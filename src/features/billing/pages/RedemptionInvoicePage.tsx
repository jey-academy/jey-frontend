import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  ApiError,
  IDEMPOTENCY_IN_PROGRESS,
  isOutcomeUnknown,
  NO_SERVER_ERRORS,
  splitServerError,
  supportRequestId,
  UNSURE_RESEND_AS_IS,
  type ServerErrors,
} from '@/shared/api'
import { useClasses } from '@/shared/campus'
import { formatPercent, todayInSeoul } from '@/shared/lib'
import {
  invoiceListPath,
  invoicePath,
  parseRecordId,
  REDEMPTIONS_PATH,
  studentPath,
} from '@/shared/paths'
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
  SummaryList,
  TextField,
  useLeaveBlocker,
} from '@/shared/ui'
import {
  billingStudentQueryKey,
  PASS_DISCOUNT_CODE,
  quoteQueryKey,
  useBillingStudent,
  useDiscountTypes,
  useInvoiceQuote,
  useIssueRedemptionInvoice,
  useRedemption,
  type BillingStudent,
  type InvoiceRequest,
  type RedemptionInvoice,
  type RedemptionInvoiceRequest,
} from '../api'
import { QuoteReceipt } from '../components/QuoteReceipt'
import {
  discountLabel,
  extraDiscounts,
  fitToLists,
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
import { wonOrNull } from '../invoiceView'
import { useSettledValue } from '../useSettledValue'

const DESK_PATH = '/desk/dongtanpass'
const STUDENT_NOT_FOUND = 'MEMBER_STUDENT_NOT_FOUND'
const CAMPUS_NOT_ALLOWED = 'AUTH_CAMPUS_NOT_ALLOWED'
const ALREADY_INVOICED = 'DONGTANPASS_REDEMPTION_ALREADY_INVOICED'
const REDEMPTION_NOT_FOUND = 'DONGTANPASS_REDEMPTION_NOT_FOUND'
const PASS_DISCOUNT_INACTIVE = 'DONGTANPASS_DISCOUNT_INACTIVE'
const MONTH_ALREADY_INVOICED = 'BILLING_INVOICE_ALREADY_EXISTS'

// 입력칸의 이름. 요청 본문의 필드 이름과 같아야 서버가 짚은 칸에 오류가 붙는다.
const FIELDS = ['targetMonth', 'lines', 'discountCodes'] as const
type Field = (typeof FIELDS)[number]

const CLASS_REJECTIONS = new Set([
  'BILLING_CLASS_NOT_FOUND',
  'BILLING_CLASS_INACTIVE',
  'BILLING_CLASS_NOT_AT_STUDENT_CAMPUS',
])
const DISCOUNT_REJECTIONS = new Set([
  'BILLING_DISCOUNT_TYPE_NOT_FOUND',
  'BILLING_DISCOUNT_TYPE_INACTIVE',
  'BILLING_TOO_MANY_DISCOUNTS',
  'BILLING_DISCOUNT_TOO_LARGE',
  'BILLING_DISCOUNT_DUPLICATED',
  'BILLING_DISCOUNT_NEEDS_REFERENCE',
])
/** 학생 자료 때문에 만들 수 없다는 답. 학생을 다시 받아 위의 안내를 맞춘다. */
const STUDENT_REJECTIONS = new Set([
  'BILLING_STUDENT_NOT_FOUND',
  'BILLING_STUDENT_NOT_ENROLLED',
  'DONGTANPASS_STUDENT_NOT_FOUND',
])

const codeFields: Record<string, Field> = {
  ...Object.fromEntries([...CLASS_REJECTIONS].map((code) => [code, 'lines'])),
  ...Object.fromEntries([...DISCOUNT_REJECTIONS].map((code) => [code, 'discountCodes'])),
  [MONTH_ALREADY_INVOICED]: 'targetMonth',
}

/**
 * 떠나지 못하게 막을 때의 문구.
 * - `sending`: 청구를 보내고 답을 기다린다. 떠나면 만든 청구의 번호와 금액을 받을 곳이 없다.
 * - `unsure`: 답을 받지 못했다. 만들어졌을 수 있다. 같은 내용으로 다시 보내야 처음 결과를 받는다(떠나면 키를 잃는다).
 */
const LEAVE_TEXT = {
  sending: {
    title: '청구를 만드는 중이에요',
    description: '결과를 받은 뒤에 넘어갈 수 있어요. 지금 떠나면 청구가 만들어졌는지 알 수 없어요.',
  },
  unsure: {
    title: '청구 결과를 아직 몰라요',
    description:
      '만들어졌을 수 있어요. 먼저 "그대로 다시 보내기"를 눌러 결과를 확인해 주세요. 두 번 만들어지지 않아요.',
  },
}

const linkClassName =
  'rounded-btn-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/**
 * 패스 사용 기록에서 수강료 청구 만들기(데스크, P4 수납). 사용 기록 하나에 열린 청구는 하나다.
 * 사용 처리 완료 화면이나 패스 사용 내역에서 `?redemptionId=`로 들어온다. 학생은 사용 기록에서 읽는다
 * (청구는 서버가 사용 기록의 학생으로 만든다. 예전 주소의 `studentId`는 읽지 않는다).
 * 반·횟수·추가 할인을 고르면 패스 할인을 맨 앞에 넣어 서버에 미리 계산을 묻고, 그 금액을 보고 청구를 만든다
 * (실제 청구의 패스 할인은 서버가 붙인다).
 */
export function RedemptionInvoicePage() {
  const [searchParams] = useSearchParams()
  const redemptionId = parseRecordId(searchParams.get('redemptionId'))
  const redemption = useRedemption(redemptionId)
  const redemptionCode = redemption.error instanceof ApiError ? redemption.error.code : null
  const student = useBillingStudent(redemption.data?.studentId ?? null)
  // 사용 기록을 아직 받지 못했으면 그 실패를 먼저 보인다(학생은 묻지도 않았다).
  const error = redemption.data ? student.error : redemption.error
  const errorCode = error instanceof ApiError ? error.code : null

  if (redemptionId === null) {
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
  // 아래 셋은 다시 불러와도 같은 답이다.
  if (redemptionCode === REDEMPTION_NOT_FOUND && !redemption.data) {
    return (
      <EmptyState
        headingLevel={1}
        title="패스 사용 기록을 찾을 수 없어요"
        description="주소가 잘못됐을 수 있어요. 패스 사용 내역에서 다시 골라 주세요."
      >
        <ButtonLink to={REDEMPTIONS_PATH}>패스 사용 내역으로</ButtonLink>
      </EmptyState>
    )
  }
  // 받아 둔 학생이 있으면 다시 받기의 404로 화면을 바꾸지 않는다. 결과를 모르는 청구(다시 보낼 키)가 사라진다.
  if (errorCode === STUDENT_NOT_FOUND && !student.data) {
    return (
      <EmptyState
        headingLevel={1}
        title="없는 학생이에요"
        description="학생 자료가 지워졌을 수 있어요."
      >
        <ButtonLink to={REDEMPTIONS_PATH}>패스 사용 내역으로</ButtonLink>
      </EmptyState>
    )
  }
  if (errorCode === CAMPUS_NOT_ALLOWED && !student.data) {
    return (
      <EmptyState
        headingLevel={1}
        title={redemption.data ? '다른 지점의 학생이에요' : '다른 지점의 패스 사용 기록이에요'}
        description="소속 지점의 학생만 청구할 수 있어요."
      >
        <ButtonLink to={REDEMPTIONS_PATH}>패스 사용 내역으로</ButtonLink>
      </EmptyState>
    )
  }
  if (redemption.data && student.data) {
    return (
      <InvoiceForm
        // 사용 기록·학생마다 새로 시작한다(입력, 결과).
        key={`${redemptionId}-${student.data.id}`}
        redemptionId={redemptionId}
        openInvoiceId={redemption.data.invoiceId}
        student={student.data}
        refetchFailed={redemption.error !== null || student.error !== null}
      />
    )
  }
  // 조사까지 넣는다("학생 정보를", "패스 사용 기록을").
  const loadingWhat = redemption.data ? '학생 정보를' : '패스 사용 기록을'
  const retry = redemption.data ? student : redemption
  return (
    <>
      <Heading />
      {error ? (
        <div className="mt-7">
          <Notice requestId={supportRequestId(error)}>
            {error instanceof ApiError
              ? `${loadingWhat} 불러오지 못했어요. ${error.message}`
              : `${loadingWhat} 불러오지 못했어요.`}
          </Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void retry.refetch()}
            disabled={retry.isFetching}
          >
            {retry.isFetching ? '불러오는 중' : '다시 불러오기'}
          </Button>
        </div>
      ) : (
        <p role="status" className="py-24 text-center text-sub">
          {`${loadingWhat} 불러오고 있어요.`}
        </p>
      )}
    </>
  )
}

type Issued = {
  result: RedemptionInvoice
  targetMonth: string
  /** 보낼 때 화면에 있던 미리 계산 합계. 서버는 만들 때 다시 계산한다. */
  quotedTotal: number | null
}

function InvoiceForm({
  redemptionId,
  openInvoiceId,
  student,
  refetchFailed,
}: {
  redemptionId: number
  /**
   * 이 사용 기록의 열린 청구(사용 기록 단건의 `invoiceId`). 있으면 만들 수 없다. 폼 대신 그 청구를 여는 카드를 보인다.
   * 청구를 만들거나 답을 놓친 뒤에도 사용 기록을 다시 받아 채워진다. 만든 결과는 이것보다 먼저 보인다.
   */
  openInvoiceId: number | null
  student: BillingStudent
  /** 받아 둔 사용 기록·학생은 있는데 다시 받기에 실패했다. 위의 안내가 옛 자료일 수 있다. */
  refetchFailed: boolean
}) {
  const formId = useId()
  const queryClient = useQueryClient()
  const classes = useClasses()
  const discountTypes = useDiscountTypes()
  const issue = useIssueRedemptionInvoice(redemptionId)
  const [months] = useState(() => monthChoices(todayInSeoul()))
  const nextKey = useRef(2)
  const [issued, setIssued] = useState<Issued | null>(null)
  // 마지막으로 보낸 본문. 답을 받지 못했을 때 그대로 다시 보낸다.
  const [lastSent, setLastSent] = useState<RedemptionInvoiceRequest | null>(null)
  // 목록에 맞추느라 입력에서 뺀 것의 안내. 입력을 고치면 지운다.
  const [fitNotice, setFitNotice] = useState<string | null>(null)
  const [input, setInput] = useState<InvoiceInput>(() => ({
    targetMonth: months[0],
    lines: [{ key: 1, classId: '', lessonCount: '' }],
    discountCodes: [],
  }))

  // 미리 계산은 저절로 다시 묻지 않는다. 화면을 떠나면 기억을 지워, 다시 들어오면 새로 계산하게 한다.
  useEffect(() => () => queryClient.removeQueries({ queryKey: quoteQueryKey }), [queryClient])

  const campusClasses = (classes.data ?? []).filter((item) => item.campusId === student.campusId)
  const options = extraDiscounts(discountTypes.data ?? [])
  const enrolled = student.status === 'ENROLLED'
  const ready = classes.data !== undefined && discountTypes.data !== undefined

  // 학생의 지금 반을 처음 줄에 미리 고른다. 반 목록을 받은 뒤 한 번만(직원이 고친 값을 덮지 않는다).
  // 다른 지점의 반이면 고르지 않는다(목록에 없는 값이 화면에는 "반 고르기"로 보인 채 나간다).
  // effect가 아니라 렌더 중에 맞춘다(React 문서의 "이전 렌더의 정보 저장"). 그려지기 전에 반영된다.
  const [prefilled, setPrefilled] = useState(false)
  if (!prefilled && classes.data) {
    setPrefilled(true)
    const own = campusClasses.find((item) => item.id === student.classId)
    if (own) {
      setInput((current) => ({
        ...current,
        lines: current.lines.map((line, index) =>
          index === 0 && line.classId === '' ? { ...line, classId: String(own.id) } : line,
        ),
      }))
    }
  }

  // 그사이 꺼진 반·할인을 입력에서 뺀다(목록을 다시 받은 뒤). 같은 방식으로 렌더 중에 맞춘다.
  if (ready) {
    const fitted = fitToLists(input, new Set(campusClasses.map((item) => String(item.id))), options)
    if (fitted.input !== input) {
      setInput(fitted.input)
      const names = fitted.droppedCodes.map(
        (code) => discountTypes.data?.find((type) => type.code === code)?.name ?? code,
      )
      setFitNotice(
        [
          fitted.clearedClass && '고른 반을 지금 운영하지 않아 비웠어요. 반을 다시 골라 주세요.',
          names.length > 0 && `지금 쓸 수 없는 할인을 뺐어요: ${names.join(', ')}`,
        ]
          .filter(Boolean)
          .join(' '),
      )
    }
  }

  const request = toRequest(input)
  // 칸을 고치는 동안 매번 계산하지 않는다. 잠시 멈추면 그때 묻는다.
  const settled = useSettledValue(request)
  // 목록을 받았고 재원생일 때만 계산을 묻는다.
  const canQuote = ready && enrolled
  const quoteBody: InvoiceRequest | null =
    canQuote && settled !== null
      ? {
          studentId: student.id,
          ...settled,
          // 실제 청구가 패스 할인을 먼저 계산한다. 같은 순서로 넣어야 순차 방식에서도 금액이 같다.
          discountCodes: [PASS_DISCOUNT_CODE, ...(settled.discountCodes ?? [])],
        }
      : null
  const quote = useInvoiceQuote(issued ? null : quoteBody)
  const quoteMatches = request !== null && settled !== null && sameRequest(request, settled)
  const calculating = canQuote && request !== null && (!quoteMatches || quote.isFetching)
  // 지금 칸에 맞고 다 받은 금액만 보인다. 이 금액이 있어야 만들 수 있다.
  // 미리 계산은 저절로 다시 묻지 않아(useInvoiceQuote) 옛 금액과 실패가 같이 남지 않는다.
  const quoted = quoteMatches && !quote.isFetching ? (quote.data ?? null) : null
  const quoteError = quoteMatches && !quote.isFetching ? quote.error : null

  // 거부(반·할인·학생)는 그사이 자료가 바뀐 것일 수 있다. 목록과 학생을 다시 받아 화면을 맞춘다.
  const refreshFor = useCallback(
    (error: unknown) => {
      if (!(error instanceof ApiError) || error.code === null) return
      if (STUDENT_REJECTIONS.has(error.code)) {
        void queryClient.invalidateQueries({ queryKey: billingStudentQueryKey(student.id) })
      }
      if (CLASS_REJECTIONS.has(error.code)) void classes.refetch()
      if (DISCOUNT_REJECTIONS.has(error.code)) void discountTypes.refetch()
    },
    [queryClient, student.id, classes, discountTypes],
  )
  const rejectedQuote = quote.isError ? quote.error : null
  useEffect(() => {
    if (rejectedQuote) refreshFor(rejectedQuote)
    // 같은 거부로 여러 번 다시 받지 않게, 오류가 바뀔 때만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rejectedQuote])

  const saving = issue.isPending
  const issueError = issue.isError ? issue.error : null
  const issueCode = issueError instanceof ApiError ? issueError.code : null
  // 답을 받지 못했다. 만들어졌을 수 있으니 같은 내용으로만 다시 보낸다(칸을 잠근다).
  const unsure =
    issueError !== null && (isOutcomeUnknown(issueError) || issueCode === IDEMPOTENCY_IN_PROGRESS)
  // 보내는 동안, 답을 받지 못한 동안 다른 화면으로 가거나 새로 고치려 하면 막는다.
  // 답을 놓친 뒤 사용 기록을 다시 받아 열린 청구가 보이면 결과를 안 것이라 막지 않는다(그 청구로 간다).
  const leaveBlock = useLeaveBlocker(
    saving ? LEAVE_TEXT.sending : unsure && openInvoiceId === null ? LEAVE_TEXT.unsure : null,
  )

  const server: ServerErrors<Field> =
    issueError === null
      ? NO_SERVER_ERRORS
      : issueCode === PASS_DISCOUNT_INACTIVE
        ? {
            fields: {},
            // 서버 문구는 사용 처리용("사용 처리할 수 없습니다")이다.
            form: '패스 할인이 꺼져 있어 청구를 만들 수 없어요. 관리자에게 알려 주세요.',
            requestId: null,
          }
        : splitServerError(issueError, {
            fields: FIELDS,
            codes: codeFields,
            unsure: UNSURE_RESEND_AS_IS,
          })
  const lineErrors = validateLines(input.lines)
  // 그 달에 학생의 다른 청구가 이미 있다는 답이면 그 청구의 번호(서버가 실을 수 있을 때만).
  const monthTaken = issueCode === MONTH_ALREADY_INVOICED
  const monthTakenBy =
    monthTaken && issueError instanceof ApiError ? issueError.id('invoiceId') : null
  // 거부된 요청의 대상 월(입력을 고치면 오류가 지워져 지금 칸과 같다).
  const takenMonth = lastSent?.targetMonth ?? input.targetMonth

  // 아래 카드들에도 떠나기 막기의 안내 창을 함께 그린다. 그대로 다시 보내는 중에 다시 받은 사용 기록으로
  // 카드가 바뀌면 막기는 남아 있다(보내기가 끝나면 풀린다). 창이 없으면 링크를 눌러도 아무 반응이 없다.
  if (issued) {
    return (
      <>
        {leaveBlock}
        <IssuedCard student={student} {...issued} />
      </>
    )
  }
  if (openInvoiceId !== null) {
    // 답을 놓친 채로 열린 청구가 보이면 보낸 청구가 만들어진 것이다(사용 기록 하나에 열린 청구는 하나).
    // 남겨 둔 멱등 키는 버리지 않는다. 그사이 다른 쪽이 그 청구를 취소해 열린 청구가 사라지면 폼이 다시 보이고,
    // 그대로 다시 보내면 서버가 보관한 첫 결과(취소된 청구)를 돌려준다. 드문 경우라 그대로 둔다.
    return (
      <>
        {leaveBlock}
        <ClosedCard
          student={student}
          reason={unsure ? 'confirmed' : 'invoiced'}
          invoiceId={openInvoiceId}
        />
      </>
    )
  }
  if (issueCode === ALREADY_INVOICED || issueCode === REDEMPTION_NOT_FOUND) {
    return (
      <>
        {leaveBlock}
        <ClosedCard
          student={student}
          reason={issueCode === ALREADY_INVOICED ? 'invoiced' : 'notFound'}
          invoiceId={issueError instanceof ApiError ? issueError.id('invoiceId') : null}
        />
      </>
    )
  }

  /** 입력을 바꾼다. 서버가 짚었던 오류와 목록 맞춤 안내는 지운다(고친 칸에 옛 오류가 남지 않게). */
  function update(change: (current: InvoiceInput) => InvoiceInput) {
    setInput(change)
    setFitNotice(null)
    if (issue.isError) issue.reset()
  }

  function changeLine(key: number, patch: Partial<LineInput>) {
    update((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    // 칸은 잠겨 있다. 처음 보낸 것과 같은 키로 나가 처음 결과를 받는다.
    if (unsure && lastSent) {
      send(lastSent)
      return
    }
    if (blockedReason !== null || request === null) return
    send(request)
  }

  function send(body: RedemptionInvoiceRequest) {
    const quotedTotal = quoted?.totalAmount ?? null
    setLastSent(body)
    issue.mutate(body, {
      // 다시 보낸 것이어도 칸이 잠겨 있어 금액은 처음 보낼 때와 같은 내용의 것이다.
      onSuccess: (result) => setIssued({ result, targetMonth: body.targetMonth, quotedTotal }),
      onError: refreshFor,
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
      {leaveBlock}

      <div className="mt-7 grid items-start gap-[18px] min-[861px]:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <p className="mb-5 text-[15px]">
            <span className="text-sub">학생 </span>
            <strong className="font-bold">{student.name}</strong>
          </p>
          {refetchFailed && (
            <Notice className="mb-4">
              패스 사용 기록이나 학생 정보를 새로 불러오지 못했어요. 아래는 이전 내용일 수 있어요.
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
          {fitNotice && (
            <Notice tone="warning" className="mb-4">
              {fitNotice}
            </Notice>
          )}

          <Form
            id={formId}
            saving={saving || unsure}
            onSubmit={handleSubmit}
            className="grid gap-[22px]"
          >
            <Segmented
              label="대상 월"
              name="targetMonth"
              options={months.map((month) => ({ value: month, label: formatMonth(month) }))}
              value={input.targetMonth}
              onChange={(targetMonth) => update((current) => ({ ...current, targetMonth }))}
              hint="수강료를 내는 달이에요. 이달 말에 다음 달 것을 받으면 다음 달을 골라 주세요."
              error={server.fields.targetMonth}
            />
            {monthTaken && (
              // 같은 달의 다른 청구(일반 청구 등). 그 청구를 취소하거나 다른 달을 고른다.
              // 서버가 번호를 싣지 못했으면(옛 지점의 청구, 동시 요청) 그 달 청구 목록에서 찾게 한다.
              <Link
                to={
                  monthTakenBy !== null
                    ? invoicePath(monthTakenBy)
                    : invoiceListPath(takenMonth, student.campusId)
                }
                className={`-mt-3 justify-self-start text-[14px] font-semibold ${linkClassName}`}
              >
                {monthTakenBy !== null
                  ? `${formatMonth(takenMonth)} 청구 열기`
                  : `${formatMonth(takenMonth)} 청구 목록 보기`}
              </Link>
            )}

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
                          update((current) => ({
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
                    update((current) => ({
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
                      update((current) => ({
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
            error={quoteError}
            // 만들기 버튼이 막힌 까닭을 영수증 자리에 한 번만 보인다(버튼 바로 위다).
            waitingFor={blockedReason ?? ''}
            onRetry={() => void quote.refetch()}
          />
          {server.form && <Notice requestId={server.requestId}>{server.form}</Notice>}
          <Button
            type="submit"
            form={formId}
            block
            // 결과를 모를 때는 칸이 잠겨 금액도 그대로라, 막힐 까닭이 없다(그대로 다시 보낼 수 있다).
            disabled={saving || blockedReason !== null}
          >
            {saving ? '청구를 만드는 중' : unsure ? '그대로 다시 보내기' : '청구 만들기'}
          </Button>
        </div>
      </div>
    </>
  )
}

function sameRequest(a: RedemptionInvoiceRequest, b: RedemptionInvoiceRequest): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * 청구를 만든 뒤. 금액과 청구 번호를 보이고, 결제 기록 화면(청구 상세)으로 보낸다.
 * 서버가 만들 때 다시 계산하므로, 미리 본 금액과 다르면 알린다.
 */
function IssuedCard({
  student,
  result,
  targetMonth,
  quotedTotal,
}: Issued & { student: BillingStudent }) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  // 누른 버튼과 폼이 사라진다. 포커스를 제목으로 옮겨 끝났다는 것부터 읽게 한다.
  useEffect(() => titleRef.current?.focus(), [])
  const total = wonOrNull(result.totalAmount)
  const quotedText = quotedTotal === null ? null : wonOrNull(quotedTotal)
  const differs = quotedTotal !== null && quotedTotal !== result.totalAmount
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
      <SummaryList
        className="my-[22px]"
        items={[
          { label: '청구 번호', value: result.invoiceId },
          { label: '학생', value: student.name },
          { label: '대상 월', value: formatMonth(targetMonth) },
          { label: '받을 금액', value: total ?? '관리자에게 확인해 주세요' },
        ]}
      />
      {differs && (
        <Notice tone="warning" className="mb-4 text-left">
          {`미리 본 금액(${quotedText ?? '확인 필요'})과 달라요. 그사이 수강료나 할인율이 바뀌었을 수 있어요. 받을 금액은 위의 금액이에요.`}
        </Notice>
      )}
      {/* 다음 할 일은 포스기·현금으로 받은 결제를 기록하는 것이다. */}
      <ButtonLink block to={invoicePath(result.invoiceId)}>
        결제 기록하기
      </ButtonLink>
      <div className="mt-2.5 flex gap-2.5 max-[400px]:flex-col [&>*]:flex-1">
        <ButtonLink variant="ghost" to={studentPath(student.id)}>
          학생 정보 보기
        </ButtonLink>
        <ButtonLink variant="ghost" to={DESK_PATH}>
          다음 패스 확인하기
        </ButtonLink>
      </div>
    </section>
  )
}

/**
 * 이 사용 기록으로는 청구를 만들 수 없다. 사용 기록의 `invoiceId`나 만들기의 409·404로 온다.
 * - `invoiced`: 열린 청구가 이미 있다.
 * - `confirmed`: 답을 놓쳤는데 다시 읽은 사용 기록에 열린 청구가 있다. 보낸 청구가 만들어진 것이다.
 * - `notFound`: 없는 사용 기록.
 * 열린 청구의 번호를 알면 그 청구를 여는 버튼을 둔다(결제 기록이나 취소는 거기서 한다).
 */
function ClosedCard({
  student,
  reason,
  invoiceId,
}: {
  student: BillingStudent
  reason: 'invoiced' | 'confirmed' | 'notFound'
  invoiceId: number | null
}) {
  const invoiced = reason !== 'notFound'
  const text = {
    invoiced: {
      title: '이 사용 기록의 청구가 이미 있어요',
      description:
        invoiceId !== null
          ? '사용 기록 하나에 청구는 하나예요. 그 청구에서 결제를 기록하거나, 취소한 뒤 다시 만들 수 있어요.'
          : '사용 기록 하나에 청구는 하나예요. 패스 사용 내역에서 "청구 보기"를 눌러 그 청구를 열어 주세요.',
    },
    confirmed: {
      title: '청구가 만들어진 것을 확인했어요',
      description:
        '답을 받지 못했지만 청구가 있어요. 청구에서 금액을 확인하고 결제를 기록해 주세요.',
    },
    notFound: {
      title: '패스 사용 기록을 찾을 수 없어요',
      description: '주소가 잘못됐을 수 있어요. 패스 사용 내역에서 다시 골라 주세요.',
    },
  }[reason]
  return (
    <EmptyState headingLevel={1} title={text.title} description={text.description}>
      <div className="flex flex-wrap justify-center gap-2.5">
        <ButtonLink variant="ghost" to={studentPath(student.id)}>
          학생 정보 보기
        </ButtonLink>
        {invoiced && invoiceId !== null ? (
          <ButtonLink to={invoicePath(invoiceId)}>청구 보기</ButtonLink>
        ) : (
          <ButtonLink to={REDEMPTIONS_PATH}>패스 사용 내역으로</ButtonLink>
        )}
      </div>
    </EmptyState>
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
