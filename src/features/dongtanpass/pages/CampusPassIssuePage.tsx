import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  ApiError,
  NO_SERVER_ERRORS,
  splitServerError,
  supportRequestId,
  UNSURE_RESEND_AS_IS,
  type FieldErrors,
} from '@/shared/api'
import { formatPercent, todayInSeoul } from '@/shared/lib'
import { campusPassesPath, parseStudentId, studentPath, STUDENTS_PATH } from '@/shared/paths'
import { Button, ButtonLink, Card, DescriptionList, EmptyState, Form, Notice } from '@/shared/ui'
import {
  campusConsentNoticeQueryKey,
  issueStudentQueryKey,
  useCampusBenefit,
  useCampusConsentNotice,
  useIssueCampusPass,
  useIssueStudent,
  type CampusIssuedPass,
  type CampusPassIssueRequest,
  type IssueStudent,
} from '../api'
import { ConsentSection } from '../components/ConsentSection'
import { IssueConfirmModal, type IssueSummary } from '../components/IssueConfirmModal'
import { IssuedPassCard } from '../components/IssuedPassCard'
import { PaymentFields } from '../components/PaymentFields'
import {
  emptyPayment,
  PAYMENT_FIELDS,
  paymentCodeFields,
  toPayment,
  validatePayment,
  type PaymentField,
  type PaymentInput,
} from '../paymentInput'
import { useNoticeConsent } from '../useNoticeConsent'
import { useUnsureIssue } from '../useUnsureIssue'

// 입력칸의 이름. 요청 본문의 필드 이름과 같아야 서버가 짚은 칸에 오류가 붙는다.
const FIELDS = [
  ...PAYMENT_FIELDS,
  'consentConfirmed',
] as const satisfies readonly (keyof CampusPassIssueRequest)[]
type Field = (typeof FIELDS)[number]

const codeFields: Record<string, Field> = {
  ...paymentCodeFields,
  DONGTANPASS_CONSENT_NOT_CONFIRMED: 'consentConfirmed',
}

const NOTICE_VERSION_MISMATCH = 'DONGTANPASS_NOTICE_VERSION_MISMATCH'
/** 학생 자료 때문에 발급할 수 없다는 답(없는 학생, 퇴원, 다른 지점, 연락처 없음). 학생을 다시 받아 화면을 맞춘다. */
const STUDENT_REJECTIONS = new Set([
  'DONGTANPASS_STUDENT_NOT_FOUND',
  'DONGTANPASS_STUDENT_NOT_ENROLLED',
  'DONGTANPASS_STUDENT_NOT_AT_ISSUING_CAMPUS',
  'DONGTANPASS_STUDENT_HAS_NO_CONTACT',
])
const STUDENT_NOT_FOUND = 'MEMBER_STUDENT_NOT_FOUND'

const linkClassName =
  'rounded-btn-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/**
 * JEY 발급(관리자). 동탄관에 다니는 학생이 월 수강료를 결제하면 패스를 발급해, 연계 학원에 새로 갈 때 할인받게 한다.
 * 학생 상세의 "패스 발급"에서 `?studentId=`로 들어온다. 학생 이름과 학부모 번호는 서버가 학생 자료에서 가져온다.
 */
export function CampusPassIssuePage() {
  const [searchParams] = useSearchParams()
  const studentId = parseStudentId(searchParams.get('studentId') ?? undefined)
  const student = useIssueStudent(studentId)
  const error = student.error

  if (studentId === null) {
    return (
      <EmptyState
        headingLevel={1}
        title="발급할 학생을 먼저 골라 주세요"
        description="학생 상세에서 패스 발급을 눌러 주세요."
      >
        <ButtonLink to={STUDENTS_PATH}>학생 목록으로</ButtonLink>
      </EmptyState>
    )
  }
  if (error instanceof ApiError && error.code === STUDENT_NOT_FOUND) {
    return (
      <EmptyState
        headingLevel={1}
        title="없는 학생이에요"
        description="주소가 잘못됐거나 다른 학생의 주소일 수 있어요."
      >
        <ButtonLink to={STUDENTS_PATH}>학생 목록으로</ButtonLink>
      </EmptyState>
    )
  }
  // 학생마다 새로 시작한다(입력, 동의, 결과).
  if (student.data) {
    return (
      <IssueForm
        key={student.data.id}
        student={student.data}
        // 받아 둔 학생은 있는데 다시 받기에 실패했다. 위의 안내와 버튼이 옛 학생 자료일 수 있다.
        refetch={
          error
            ? {
                requestId: supportRequestId(error),
                retry: () => void student.refetch(),
                retrying: student.isFetching,
              }
            : null
        }
      />
    )
  }
  if (error) {
    return (
      <>
        <Heading />
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
      </>
    )
  }
  return (
    <>
      <Heading />
      <p role="status" className="py-24 text-center text-sub">
        학생 정보를 불러오고 있어요.
      </p>
    </>
  )
}

type RefetchFailure = { requestId: string | null; retry: () => void; retrying: boolean }

function IssueForm({
  student,
  refetch,
}: {
  student: IssueStudent
  /** 학생을 다시 받지 못했을 때의 안내와 다시 받기. 없으면 null이다. */
  refetch: RefetchFailure | null
}) {
  const queryClient = useQueryClient()
  const notice = useCampusConsentNotice()
  const issue = useIssueCampusPass()
  const [today] = useState(() => todayInSeoul())
  const [input, setInput] = useState<PaymentInput>(() => emptyPayment(today))
  const [localErrors, setLocalErrors] = useState<FieldErrors<Field>>({})
  const [confirming, setConfirming] = useState<CampusPassIssueRequest | null>(null)
  const [issued, setIssued] = useState<CampusIssuedPass | null>(null)
  // 답을 받지 못한 발급. 내용이 바뀐 채 다시 보내려 하면 확인 창이 목록부터 보라고 경고한다(#160).
  const unsure = useUnsureIssue<CampusPassIssueRequest>()

  const saving = issue.isPending
  const errorCode = issue.error instanceof ApiError ? issue.error.code : null
  const rejectedForNotice = errorCode === NOTICE_VERSION_MISMATCH
  const consent = useNoticeConsent({
    notice,
    queryKey: campusConsentNoticeQueryKey,
    rejected: rejectedForNotice,
  })
  const server =
    issue.isError && !rejectedForNotice
      ? splitServerError(issue.error, {
          fields: FIELDS,
          codes: codeFields,
          unsure: UNSURE_RESEND_AS_IS,
        })
      : NO_SERVER_ERRORS
  const errors: FieldErrors<Field> = { ...server.fields, ...localErrors }

  const enrolled = student.status === 'ENROLLED'
  const contact = student.primaryContact
  // 보내도 서버가 거부할 것을 미리 막는다. 지점이 패스를 발급하는 곳인지는 서버만 안다.
  const blocked = !enrolled || contact === null

  function change(field: PaymentField, value: string) {
    setInput((current) => ({ ...current, [field]: value }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!notice.data || blocked) return
    const nextErrors: FieldErrors<Field> = validatePayment(input, today)
    if (!consent.consented) {
      nextErrors.consentConfirmed = '학부모에게 알리고 동의를 받았는지 확인해 주세요.'
    }
    setLocalErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      issue.reset()
      return
    }
    const payment = toPayment(input)
    if (payment === null) return
    setConfirming({
      studentId: student.id,
      ...payment,
      consentConfirmed: true,
      noticeVersion: notice.data.version,
    })
  }

  function send(body: CampusPassIssueRequest) {
    // 경고를 보고도 보냈다. 앞의 요청은 확인하라고 알렸으니 더 경고하지 않는다.
    if (unsure.differs(body)) unsure.acknowledge()
    issue.mutate(body, {
      onSettled: (_data, error) => unsure.settle(body, error),
      onSuccess: (pass) => {
        setConfirming(null)
        setIssued(pass)
        // 다음 발급을 위해 결제 칸과 동의를 비운다. 결제일은 대개 같은 날이라 남긴다.
        setInput((current) => ({ ...emptyPayment(today), paidOn: current.paidOn }))
        consent.clear()
      },
      onError: (error) => {
        setConfirming(null)
        if (!(error instanceof ApiError)) return
        if (error.code === NOTICE_VERSION_MISMATCH) consent.noticeRejected()
        // 그 사이 학생 자료가 바뀌었다(지움, 퇴원, 연락처 지움). 학생을 다시 받아 위의 안내와 버튼을 맞춘다.
        // 없는 학생이면 다시 받은 답(MEMBER_STUDENT_NOT_FOUND)으로 화면이 "없는 학생이에요"로 바뀐다.
        if (error.code !== null && STUDENT_REJECTIONS.has(error.code)) {
          void queryClient.invalidateQueries({ queryKey: issueStudentQueryKey(student.id) })
        }
      },
    })
  }

  const summary: IssueSummary | null = confirming && {
    studentName: student.name,
    paidOn: confirming.paidOn,
    paidAmount: confirming.paidAmount,
    paymentMethod: confirming.paymentMethod,
  }

  return (
    <>
      <Link to={studentPath(student.id)} className={`text-[14px] text-sub ${linkClassName}`}>
        {`${student.name} 학생 상세`}
      </Link>
      <Heading className="mt-2" />

      <div className="mt-7 grid items-start gap-[18px] min-[861px]:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <h2 className="mb-4 text-[19px] font-bold tracking-[-0.03em]">받는 학생</h2>
          {refetch && (
            <div className="mb-4">
              <Notice requestId={refetch.requestId}>
                학생 정보를 새로 불러오지 못했어요. 아래는 이전 내용일 수 있어요.
              </Notice>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={refetch.retry}
                disabled={refetch.retrying}
              >
                {refetch.retrying ? '불러오는 중' : '학생 정보 다시 불러오기'}
              </Button>
            </div>
          )}
          <DescriptionList
            items={[
              { label: '학생', value: student.name },
              {
                label: '학부모 번호',
                value: contact === null ? '없음' : `${contact.name} ${contact.phone}`,
              },
              { label: '할인', value: <BenefitValue /> },
            ]}
          />
          <p className="mt-3 text-[14px] text-sub">
            학부모 번호는 학생 자료의 대표 연락처예요. 링크를 다시 받거나 연계 학원에서 본인을
            확인할 때 이 번호를 써요.
          </p>
          {!enrolled && (
            <Notice className="mt-4">
              퇴원한 학생이에요. 재원 중인 학생에게만 발급할 수 있어요.
            </Notice>
          )}
          {enrolled && contact === null && (
            <Notice className="mt-4">
              학부모나 학생의 연락처가 없어 발급할 수 없어요.{' '}
              <Link
                to={studentPath(student.id)}
                className={`font-semibold underline ${linkClassName}`}
              >
                학생 상세
              </Link>
              에서 연락처를 먼저 더해 주세요.
            </Notice>
          )}

          <h2 className="mt-7 mb-1 text-[19px] font-bold tracking-[-0.03em]">근거 결제</h2>
          <p className="mb-[18px] text-[14px] text-sub">
            이 패스를 발급하는 까닭이 된 그 달의 수강료 결제를 적어 주세요. 연계 학원 수강료는
            몰라도 돼요. 연계 학원이 사용 처리할 때 넣어요.
          </p>
          <Form saving={saving} onSubmit={handleSubmit} className="grid gap-3.5">
            <PaymentFields value={input} onChange={change} errors={errors} today={today} />

            <ConsentSection
              notice={notice}
              consented={consent.consented}
              changed={consent.changed}
              boxRef={consent.boxRef}
              onChange={(checked) => {
                consent.setChecked(checked)
                if (checked && rejectedForNotice) issue.reset()
                setLocalErrors((current) => ({ ...current, consentConfirmed: undefined }))
              }}
              error={errors.consentConfirmed}
            />

            {server.form && <Notice requestId={server.requestId}>{server.form}</Notice>}

            <Button type="submit" block disabled={!notice.data || !consent.consented || blocked}>
              {saving ? '발급하는 중' : '패스 발급하기'}
            </Button>
          </Form>
        </Card>

        <div className="grid gap-3">
          <IssuedPassCard
            issued={issued && { pass: issued, studentName: student.name }}
            listName="JEY 패스 목록"
          />
          {issued && (
            <p className="text-center text-[14px] text-sub">
              {`연계 학원 첫 달 수강료 ${percentOrUnknown(issued.discountRate)} 할인 · `}
              <Link to={campusPassesPath(student.id)} className={`font-semibold ${linkClassName}`}>
                이 학생의 패스 보기
              </Link>
            </p>
          )}
        </div>
      </div>

      <IssueConfirmModal
        summary={summary}
        saving={saving}
        onClose={() => setConfirming(null)}
        unsureListPath={
          confirming && unsure.differs(confirming) ? campusPassesPath(student.id) : null
        }
        onConfirm={() => {
          if (confirming) send(confirming)
        }}
      />
    </>
  )
}

/** 지금 할인율. 발급하면 이 값이 패스에 남는다. 받지 못해도 발급은 할 수 있다(서버가 정한다). */
function BenefitValue() {
  const benefit = useCampusBenefit()
  if (benefit.data) return `연계 학원 첫 달 수강료 ${percentOrUnknown(benefit.data.discountRate)}`
  return (
    <span className="font-normal text-sub">
      {benefit.error ? '할인율을 불러오지 못했어요' : '불러오는 중'}
    </span>
  )
}

/**
 * 할인율 표시. 모양이 틀린 값이면 formatPercent가 던지는데, 이 화면에서는 던지지 않고 "확인 필요"로 둔다.
 * 발급한 뒤에 화면이 에러 화면으로 바뀌면 이 응답에만 있는 학부모 링크를 잃고, 실패한 줄 알고 다시 발급하게 된다.
 */
function percentOrUnknown(rate: number): string {
  try {
    return formatPercent(rate)
  } catch (error) {
    console.error('할인율을 표시하지 못했어요.', rate, error)
    return '(할인율 확인 필요)'
  }
}

function Heading({ className }: { className?: string }) {
  return (
    <div className={className}>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">JEY 패스 발급</h1>
      <p className="mt-1 text-sub">
        월 수강료를 결제한 재원생에게, 연계 학원에 새로 등록할 때 쓰는 제이G패스를 발급해요.
      </p>
    </div>
  )
}
