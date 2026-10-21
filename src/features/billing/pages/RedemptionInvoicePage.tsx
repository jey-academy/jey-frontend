import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  ApiError,
  NO_SERVER_ERRORS,
  splitServerError,
  supportRequestId,
  UNSURE_RESEND_AS_IS,
  type ServerErrors,
} from '@/shared/api'
import { useClasses } from '@/shared/campus'
import { formatPercent, formatWon, todayInSeoul } from '@/shared/lib'
import { parseRecordId, studentPath } from '@/shared/paths'
import {
  Button,
  ButtonLink,
  Card,
  CheckboxField,
  EmptyState,
  Form,
  Notice,
  Segmented,
  SelectField,
  TextField,
} from '@/shared/ui'
import {
  billingStudentQueryKey,
  PASS_DISCOUNT_CODE,
  useBillingStudent,
  useDiscountTypes,
  useInvoiceQuote,
  useIssueRedemptionInvoice,
  type BillingStudent,
  type InvoiceRequest,
  type RedemptionInvoice,
  type RedemptionInvoiceRequest,
} from '../api'
import { QuoteReceipt } from '../components/QuoteReceipt'
import {
  discountLabel,
  extraDiscounts,
  formatMonth,
  MAX_EXTRA_DISCOUNTS,
  MAX_LINES,
  monthChoices,
  toggleDiscount,
  toRequest,
  validateLines,
  type InvoiceInput,
  type LineInput,
} from '../invoiceInput'
import { useSettledValue } from '../useSettledValue'

const REDEMPTIONS_PATH = '/desk/dongtanpass/redemptions'
const DESK_PATH = '/desk/dongtanpass'
const STUDENT_NOT_FOUND = 'MEMBER_STUDENT_NOT_FOUND'

// 입력칸의 이름. 요청 본문의 필드 이름과 같아야 서버가 짚은 칸에 오류가 붙는다.
const FIELDS = ['targetMonth', 'lines', 'discountCodes'] as const
type Field = (typeof FIELDS)[number]

const CLASS_REJECTIONS = [
  'BILLING_CLASS_NOT_FOUND',
  'BILLING_CLASS_INACTIVE',
  'BILLING_CLASS_NOT_AT_STUDENT_CAMPUS',
]
const DISCOUNT_REJECTIONS = [
  'BILLING_DISCOUNT_TYPE_NOT_FOUND',
  'BILLING_DISCOUNT_TYPE_INACTIVE',
  'BILLING_TOO_MANY_DISCOUNTS',
  'BILLING_DISCOUNT_TOO_LARGE',
  'BILLING_DISCOUNT_DUPLICATED',
  'BILLING_DISCOUNT_NEEDS_REFERENCE',
]
/** 학생 자료 때문에 만들 수 없다는 답. 학생을 다시 받아 위의 안내를 맞춘다. */
const STUDENT_REJECTIONS = new Set([
  'BILLING_STUDENT_NOT_FOUND',
  'BILLING_STUDENT_NOT_ENROLLED',
  'DONGTANPASS_STUDENT_NOT_FOUND',
])

const codeFields: Record<string, Field> = {
  ...Object.fromEntries(CLASS_REJECTIONS.map((code) => [code, 'lines'])),
  ...Object.fromEntries(DISCOUNT_REJECTIONS.map((code) => [code, 'discountCodes'])),
  BILLING_INVOICE_ALREADY_EXISTS: 'targetMonth',
}

const linkClassName =
  'rounded-btn-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/**
 * 패스 사용 기록에서 수강료 청구 만들기(데스크, P4 수납). 패스로 온 학생의 첫 달 청구다.
 * 사용 처리 완료 화면이나 패스 사용 내역에서 `?redemptionId=&studentId=`로 들어온다.
 * 반·횟수·추가 할인을 고르면 서버가 패스 할인까지 붙여 미리 계산하고, 그 금액을 보고 청구를 만든다.
 */
export function RedemptionInvoicePage() {
  const [searchParams] = useSearchParams()
  const redemptionId = parseRecordId(searchParams.get('redemptionId'))
  const studentId = parseRecordId(searchParams.get('studentId'))
  const student = useBillingStudent(redemptionId === null ? null : studentId)
  const error = student.error

  if (redemptionId === null || studentId === null) {
    return (
      <EmptyState
        headingLevel={1}
        title="청구할 패스 사용 기록을 먼저 골라 주세요"
        description="패스 사용 내역에서 청구 만들기를 눌러 주세요."
      >
        <ButtonLink to={REDEMPTIONS_PATH}>패스 사용 내역으로</ButtonLink>
      </EmptyState>
    )
  }
  if (error instanceof ApiError && error.code === STUDENT_NOT_FOUND) {
    return (
      <EmptyState
        headingLevel={1}
        title="없는 학생이에요"
        description="주소가 잘못됐거나 학생 자료가 지워졌을 수 있어요."
      >
        <ButtonLink to={REDEMPTIONS_PATH}>패스 사용 내역으로</ButtonLink>
      </EmptyState>
    )
  }
  if (student.data) {
    return (
      <InvoiceForm
        // 사용 기록·학생마다 새로 시작한다(입력, 결과).
        key={`${redemptionId}-${student.data.id}`}
        redemptionId={redemptionId}
        student={student.data}
        refetchFailed={error !== null}
      />
    )
  }
  return (
    <>
      <Heading />
      {error ? (
        <div className="mt-7">
          <Notice requestId={supportRequestId(error)}>
            {error instanceof ApiError ? error.message : '학생 정보를 불러오지 못했어요.'}
          </Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void student.refetch()}
            disabled={student.isFetching}
          >
            {student.isFetching ? '불러오는 중' : '다시 불러오기'}
          </Button>
        </div>
      ) : (
        <p role="status" className="py-24 text-center text-sub">
          학생 정보를 불러오고 있어요.
        </p>
      )}
    </>
  )
}

function InvoiceForm({
  redemptionId,
  student,
  refetchFailed,
}: {
  redemptionId: number
  student: BillingStudent
  /** 받아 둔 학생은 있는데 다시 받기에 실패했다. 위의 안내가 옛 자료일 수 있다. */
  refetchFailed: boolean
}) {
  const formId = useId()
  const queryClient = useQueryClient()
  const classes = useClasses()
  const discountTypes = useDiscountTypes()
  const issue = useIssueRedemptionInvoice(redemptionId)
  const [months] = useState(() => monthChoices(todayInSeoul()))
  const nextKey = useRef(2)
  const [issued, setIssued] = useState<{
    result: RedemptionInvoice
    targetMonth: string
  } | null>(null)

  const campusClasses = (classes.data ?? []).filter((item) => item.campusId === student.campusId)
  const options = extraDiscounts(discountTypes.data ?? [])
  const [input, setInput] = useState<InvoiceInput>(() => ({
    targetMonth: months[0],
    lines: [{ key: 1, classId: '', lessonCount: '' }],
    discountCodes: [],
  }))

  // 학생의 지금 반을 처음 줄에 미리 고른다. 반 목록을 받은 뒤 한 번만(직원이 고친 값을 덮지 않는다).
  // effect가 아니라 렌더 중에 맞춘다(React 문서의 "이전 렌더의 정보 저장"). 그려지기 전에 반영된다.
  const [prefilled, setPrefilled] = useState(false)
  if (!prefilled && classes.data) {
    setPrefilled(true)
    const own = classes.data.find(
      (item) => item.id === student.classId && item.campusId === student.campusId,
    )
    if (own) {
      setInput((current) => ({
        ...current,
        lines: current.lines.map((line, index) =>
          index === 0 && line.classId === '' ? { ...line, classId: String(own.id) } : line,
        ),
      }))
    }
  }

  const enrolled = student.status === 'ENROLLED'
  const ready = classes.data !== undefined && discountTypes.data !== undefined
  const request = toRequest(input)
  // 칸을 고치는 동안 매번 계산하지 않는다. 잠시 멈추면 그때 묻는다.
  const settled = useSettledValue(request)
  const quoteBody: InvoiceRequest | null =
    ready && enrolled && settled !== null
      ? {
          studentId: student.id,
          ...settled,
          // 실제 청구가 패스 할인을 먼저 계산한다. 같은 순서로 넣어야 순차 방식에서도 금액이 같다.
          discountCodes: [PASS_DISCOUNT_CODE, ...(settled.discountCodes ?? [])],
        }
      : null
  const quote = useInvoiceQuote(issued ? null : quoteBody)
  const quoteMatches = request !== null && settled !== null && sameRequest(request, settled)
  const calculating = request !== null && (!quoteMatches || quote.isFetching)
  const quoted = quoteMatches && !quote.isFetching ? (quote.data ?? null) : null

  const saving = issue.isPending
  const server: ServerErrors<Field> = issue.isError
    ? splitServerError(issue.error, {
        fields: FIELDS,
        codes: codeFields,
        unsure: UNSURE_RESEND_AS_IS,
      })
    : NO_SERVER_ERRORS
  const lineErrors = validateLines(input.lines)

  if (issued) {
    return <IssuedCard student={student} {...issued} />
  }

  function changeLine(key: number, patch: Partial<LineInput>) {
    setInput((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (blockedReason !== null || request === null) return
    send(request)
  }

  function send(body: RedemptionInvoiceRequest) {
    issue.mutate(body, {
      onSuccess: (result) => setIssued({ result, targetMonth: body.targetMonth }),
      onError: (error) => {
        if (!(error instanceof ApiError) || error.code === null) return
        if (STUDENT_REJECTIONS.has(error.code)) {
          void queryClient.invalidateQueries({ queryKey: billingStudentQueryKey(student.id) })
        }
        // 그사이 반이나 할인이 꺼졌을 수 있다. 목록을 다시 받아 고르는 칸을 맞춘다.
        if (CLASS_REJECTIONS.includes(error.code)) void classes.refetch()
        if (DISCOUNT_REJECTIONS.includes(error.code)) void discountTypes.refetch()
      },
    })
  }

  const blockedReason = !enrolled
    ? '퇴원한 학생이라 청구를 만들 수 없어요.'
    : !ready
      ? '반과 할인 목록을 받아야 만들 수 있어요.'
      : request === null
        ? '반과 수업 횟수를 적으면 금액을 계산해요.'
        : calculating
          ? '금액을 계산하고 있어요.'
          : quoted === null
            ? '금액을 계산해야 만들 수 있어요.'
            : null

  const lookupError = classes.error ?? discountTypes.error

  return (
    <>
      <Link to={studentPath(student.id)} className={`text-[14px] text-sub ${linkClassName}`}>
        {`${student.name} 학생 상세`}
      </Link>
      <Heading className="mt-2" />

      <div className="mt-7 grid items-start gap-[18px] min-[861px]:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <p className="mb-5 text-[15px]">
            <span className="text-sub">학생 </span>
            <strong className="font-bold">{student.name}</strong>
          </p>
          {refetchFailed && (
            <Notice className="mb-4">
              학생 정보를 새로 불러오지 못했어요. 아래는 이전 내용일 수 있어요.
            </Notice>
          )}
          {!enrolled && (
            <Notice className="mb-4">퇴원한 학생이에요. 재원 중인 학생만 청구할 수 있어요.</Notice>
          )}
          {!ready && lookupError && (
            <div className="mb-4">
              <Notice requestId={supportRequestId(lookupError)}>
                반·할인 목록을 불러오지 못했어요. 목록을 받아야 청구를 만들 수 있어요.
              </Notice>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={() => {
                  void classes.refetch()
                  void discountTypes.refetch()
                }}
                disabled={classes.isFetching || discountTypes.isFetching}
              >
                반·할인 다시 불러오기
              </Button>
            </div>
          )}

          <Form id={formId} saving={saving} onSubmit={handleSubmit} className="grid gap-[22px]">
            <Segmented
              label="대상 월"
              name="targetMonth"
              options={months.map((month) => ({ value: month, label: formatMonth(month) }))}
              value={input.targetMonth}
              onChange={(targetMonth) => setInput((current) => ({ ...current, targetMonth }))}
              hint="수강료를 내는 달이에요. 이달 말에 다음 달 것을 받으면 다음 달을 골라 주세요."
              error={server.fields.targetMonth}
            />

            <fieldset className="grid gap-3.5">
              <legend className="mb-1.5 text-[14px] font-semibold">반과 수업 횟수</legend>
              {input.lines.map((line, index) => {
                const name = input.lines.length > 1 ? `${index + 1}번째 반` : '반'
                const errors = lineErrors[index]
                return (
                  <div
                    key={line.key}
                    className="grid items-start gap-3 min-[561px]:grid-cols-[minmax(0,1fr)_140px_auto]"
                  >
                    <SelectField
                      label={name}
                      value={line.classId}
                      onChange={(event) => changeLine(line.key, { classId: event.target.value })}
                      error={line.classId === '' ? undefined : errors.classId}
                    >
                      <option value="">반 고르기</option>
                      {campusClasses.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </SelectField>
                    <TextField
                      // 반이 여럿이면 어느 반의 횟수인지 이름에 넣는다(화면 읽기 프로그램은 칸 이름만 읽는다).
                      label={input.lines.length > 1 ? `${name} 수업 횟수` : '수업 횟수'}
                      inputMode="numeric"
                      placeholder="예: 8"
                      value={line.lessonCount}
                      onChange={(event) =>
                        changeLine(line.key, { lessonCount: event.target.value })
                      }
                      error={line.lessonCount.trim() === '' ? undefined : errors.lessonCount}
                    />
                    {input.lines.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-[561px]:mt-[30px]"
                        aria-label={`${name} 빼기`}
                        onClick={() =>
                          setInput((current) => ({
                            ...current,
                            lines: current.lines.filter((item) => item.key !== line.key),
                          }))
                        }
                      >
                        빼기
                      </Button>
                    )}
                  </div>
                )
              })}
              {ready && campusClasses.length === 0 && (
                <Notice>이 학생의 지점에 운영 중인 반이 없어요.</Notice>
              )}
              {server.fields.lines && <Notice>{server.fields.lines}</Notice>}
              {input.lines.length < MAX_LINES && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-self-start"
                  onClick={() => {
                    const key = nextKey.current++
                    setInput((current) => ({
                      ...current,
                      lines: [...current.lines, { key, classId: '', lessonCount: '' }],
                    }))
                  }}
                >
                  반 더하기 (반 나눔)
                </Button>
              )}
            </fieldset>

            <fieldset className="grid gap-2.5">
              <legend className="mb-1 text-[14px] font-semibold">추가 할인 (선택)</legend>
              <p className="text-[14px] text-sub">
                {`형제 할인처럼 더 받는 할인을 ${MAX_EXTRA_DISCOUNTS}개까지 골라요. 패스 할인은 저절로 붙어요.`}
              </p>
              {ready && options.length === 0 && (
                <p className="text-[14px] text-sub">고를 수 있는 할인이 없어요.</p>
              )}
              {options.map((option) => {
                const checked = input.discountCodes.includes(option.code)
                return (
                  <CheckboxField
                    key={option.code}
                    label={discountLabel(option.name, formatPercent(option.rate))}
                    checked={checked}
                    disabled={!checked && input.discountCodes.length >= MAX_EXTRA_DISCOUNTS}
                    onChange={(event) =>
                      setInput((current) => ({
                        ...current,
                        discountCodes: toggleDiscount(
                          current,
                          option.code,
                          event.target.checked,
                          options,
                        ),
                      }))
                    }
                  />
                )
              })}
              {server.fields.discountCodes && <Notice>{server.fields.discountCodes}</Notice>}
            </fieldset>
          </Form>
        </Card>

        <div className="grid gap-3 min-[861px]:sticky min-[861px]:top-[84px]">
          <QuoteReceipt
            quote={quoted}
            calculating={calculating}
            error={quoteMatches && !quote.isFetching ? quote.error : null}
            onRetry={() => void quote.refetch()}
          />
          {server.form && <Notice requestId={server.requestId}>{server.form}</Notice>}
          <Button type="submit" form={formId} block disabled={saving || blockedReason !== null}>
            {saving ? '청구를 만드는 중' : '청구 만들기'}
          </Button>
          {blockedReason !== null && !saving && (
            <p className="text-center text-[13px] text-sub">{blockedReason}</p>
          )}
        </div>
      </div>
    </>
  )
}

function sameRequest(a: RedemptionInvoiceRequest, b: RedemptionInvoiceRequest): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** 청구를 만든 뒤. 결제 기록 화면은 다음 작업이라, 지금은 금액과 할 일만 알린다. */
function IssuedCard({
  student,
  result,
  targetMonth,
}: {
  student: BillingStudent
  result: RedemptionInvoice
  targetMonth: string
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  // 누른 버튼과 폼이 사라진다. 포커스를 제목으로 옮겨 끝났다는 것부터 읽게 한다.
  useEffect(() => titleRef.current?.focus(), [])
  return (
    <section className="mx-auto mt-[22px] max-w-[560px] rounded-lg bg-card px-7 py-9 text-center">
      <h1
        ref={titleRef}
        tabIndex={-1}
        className="text-[24px] font-bold tracking-[-0.03em] text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        수강료 청구를 만들었어요
      </h1>
      <p className="mt-1.5 text-sub">{`${student.name} 학생의 ${formatMonth(targetMonth)} 청구예요.`}</p>
      <dl className="my-[22px] grid gap-2.5 rounded-md bg-field px-[18px] py-4 text-left text-[15px]">
        <Row label="학생">{student.name}</Row>
        <Row label="대상 월">{formatMonth(targetMonth)}</Row>
        <Row label="받을 금액">{formatWon(result.totalAmount)}</Row>
        <Row label="청구 번호">{result.invoiceId}</Row>
      </dl>
      <Notice tone="info" className="mb-[22px] text-left">
        결제 기록 화면은 준비 중이에요. 결제를 받으면 지금처럼 장부에 적어 주세요.
      </Notice>
      <div className="flex gap-2.5 max-[400px]:flex-col [&>*]:flex-1">
        <ButtonLink variant="ghost" to={studentPath(student.id)}>
          학생 정보 보기
        </ButtonLink>
        <ButtonLink to={DESK_PATH}>다음 패스 확인하기</ButtonLink>
      </div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-sub">{label}</dt>
      <dd className="text-right font-semibold tabular-nums">{children}</dd>
    </div>
  )
}

function Heading({ className }: { className?: string }) {
  return (
    <div className={className}>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">
        수강료 청구 만들기
      </h1>
      <p className="mt-1 text-sub">
        패스를 사용한 학생의 수강료 청구를 만들어요. 패스 할인은 저절로 붙어요.
      </p>
    </div>
  )
}
