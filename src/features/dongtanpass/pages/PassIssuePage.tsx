import { useState, type FormEvent } from 'react'
import {
  ApiError,
  NO_SERVER_ERRORS,
  splitServerError,
  UNSURE_RESEND_AS_IS,
  type FieldErrors,
} from '@/shared/api'
import { isMobilePhone, todayInSeoul } from '@/shared/lib'
import { Button, Card, Form, Notice, TextField } from '@/shared/ui'
import {
  consentNoticeQueryKey,
  useConsentNotice,
  useIssuePass,
  type IssuedPass,
  type PassIssueRequest,
} from '../api'
import { ConsentSection } from '../components/ConsentSection'
import { IssueConfirmModal } from '../components/IssueConfirmModal'
import { IssuedPassCard } from '../components/IssuedPassCard'
import { PaymentFields } from '../components/PaymentFields'
import {
  emptyPayment,
  PAYMENT_FIELDS,
  paymentCodeFields,
  toPayment,
  validatePayment,
  type PaymentInput,
} from '../paymentInput'
import { useNoticeConsent } from '../useNoticeConsent'

// 입력칸의 이름. 요청 본문의 필드 이름과 같아야 서버가 짚은 칸에 오류가 붙는다.
const FIELDS = [
  'studentName',
  'guardianPhone',
  ...PAYMENT_FIELDS,
  'consentConfirmed',
] as const satisfies readonly (keyof PassIssueRequest)[]
type Field = (typeof FIELDS)[number]

// 필드 목록 없이 코드로만 오는 오류가 어느 칸의 문제인지.
const codeFields: Record<string, Field> = {
  ...paymentCodeFields,
  DONGTANPASS_CONSENT_NOT_CONFIRMED: 'consentConfirmed',
}

/** 보여 준 문구가 지금 문구와 다르다는 답. 문구를 다시 받아 보여 주고 다시 확인하게 한다. */
const NOTICE_VERSION_MISMATCH = 'DONGTANPASS_NOTICE_VERSION_MISMATCH'
/** 꺼진 학원. 문구 조회와 발급이 모두 이 답이다. */
const PARTNER_INACTIVE = 'DONGTANPASS_PARTNER_INACTIVE'

const STUDENT_NAME_MAX = 50
const PHONE_FORMAT_ERROR = '휴대전화 번호 형식이 아니에요. 예: 010-1234-5678'

type Input = PaymentInput & {
  studentName: string
  guardianPhone: string
}

/** 연계 학원의 패스 발급. 수강료를 받은 뒤 학부모 링크를 만든다. */
export function PassIssuePage() {
  const notice = useConsentNotice()
  const issue = useIssuePass()
  const [today] = useState(() => todayInSeoul())
  const [input, setInput] = useState<Input>({
    studentName: '',
    guardianPhone: '',
    ...emptyPayment(today),
  })
  // 보내기 전에 걸러 낸 오류. 서버가 준 오류는 issue.error에서 읽는다.
  const [localErrors, setLocalErrors] = useState<FieldErrors<Field>>({})
  // 확인 창에 보여 주고 그대로 보낼 본문. null이면 창이 닫혀 있다.
  const [confirming, setConfirming] = useState<PassIssueRequest | null>(null)
  const [issued, setIssued] = useState<{ pass: IssuedPass; studentName: string } | null>(null)

  const saving = issue.isPending
  const errorCode = issue.error instanceof ApiError ? issue.error.code : null
  // 서버가 문구가 바뀌었다고 거부했다(400). 이 오류는 칸 오류로 나누지 않고 동의 칸 위의 안내로만 보여 준다.
  const rejectedForNotice = errorCode === NOTICE_VERSION_MISMATCH
  const consent = useNoticeConsent({
    notice,
    queryKey: consentNoticeQueryKey,
    rejected: rejectedForNotice,
  })
  const consented = consent.consented
  const server =
    issue.isError && !rejectedForNotice
      ? splitServerError(issue.error, {
          fields: FIELDS,
          codes: codeFields,
          unsure: UNSURE_RESEND_AS_IS,
        })
      : NO_SERVER_ERRORS
  const errors: FieldErrors<Field> = { ...server.fields, ...localErrors }

  const noticeError = notice.error instanceof ApiError ? notice.error : null
  if (noticeError?.code === PARTNER_INACTIVE || errorCode === PARTNER_INACTIVE) {
    return (
      <>
        <Heading />
        <Notice className="mt-7 max-w-[560px]">
          {(noticeError?.code === PARTNER_INACTIVE ? noticeError : issue.error)?.message}
        </Notice>
      </>
    )
  }

  function change(field: keyof Input, value: string) {
    setInput((current) => ({ ...current, [field]: value }))
  }

  /** 보내기 전에 화면에서 확인할 수 있는 것을 확인한다. 나머지 규칙(금액 0원 등)은 서버가 판단한다. */
  function validate(): FieldErrors<Field> {
    const next: FieldErrors<Field> = {}
    const name = input.studentName.trim()
    if (name === '') next.studentName = '학생 이름을 입력해 주세요.'
    else if (name.length > STUDENT_NAME_MAX) {
      next.studentName = `${STUDENT_NAME_MAX}자까지 적을 수 있어요.`
    }
    const phone = input.guardianPhone.trim()
    if (phone === '') next.guardianPhone = '학부모 휴대전화 번호를 입력해 주세요.'
    else if (!isMobilePhone(phone)) next.guardianPhone = PHONE_FORMAT_ERROR
    Object.assign(next, validatePayment(input, today))
    if (!consented) next.consentConfirmed = '학부모에게 알리고 동의를 받았는지 확인해 주세요.'
    return next
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!notice.data) return
    const nextErrors = validate()
    setLocalErrors(nextErrors)
    // 보내지 않았으니 지난번 서버 오류는 지금 입력에 대한 것이 아니다.
    if (Object.keys(nextErrors).length > 0) {
      issue.reset()
      return
    }
    const payment = toPayment(input)
    if (payment === null) return
    setConfirming({
      studentName: input.studentName.trim(),
      guardianPhone: input.guardianPhone.trim(),
      ...payment,
      consentConfirmed: true,
      noticeVersion: notice.data.version,
    })
  }

  function send(body: PassIssueRequest) {
    issue.mutate(body, {
      onSuccess: (pass) => {
        setConfirming(null)
        setIssued({ pass, studentName: body.studentName })
        // 다음 학부모의 발급을 받는다. 결제일은 대개 같은 날이라 남긴다.
        setInput((current) => ({
          ...current,
          studentName: '',
          guardianPhone: '',
          paidAmount: '',
          paymentMethod: '',
        }))
        consent.clear()
      },
      onError: (error) => {
        setConfirming(null)
        if (error instanceof ApiError && error.code === NOTICE_VERSION_MISMATCH) {
          consent.noticeRejected()
        }
      },
    })
  }

  return (
    <>
      <Heading />

      <div className="mt-7 grid items-start gap-[18px] min-[861px]:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <h2 className="mb-1 text-[19px] font-bold tracking-[-0.03em]">발급 정보</h2>
          <p className="mb-[18px] text-[14px] text-sub">
            발급 후 나오는 링크를 학부모님께 카카오톡이나 문자로 보내 주세요.
          </p>

          <Form saving={saving} onSubmit={handleSubmit} className="grid gap-3.5">
            <div className="grid gap-3.5 min-[561px]:grid-cols-2">
              <TextField
                label="학생 이름"
                value={input.studentName}
                onChange={(event) => change('studentName', event.target.value)}
                hint="JEY에 등록할 이름과 똑같이 적어 주세요"
                error={errors.studentName}
                autoComplete="off"
              />
              <TextField
                label="학부모 휴대전화"
                value={input.guardianPhone}
                onChange={(event) => change('guardianPhone', event.target.value)}
                placeholder="010-1234-5678"
                inputMode="tel"
                autoComplete="off"
                error={errors.guardianPhone}
              />
            </div>
            <PaymentFields value={input} onChange={change} errors={errors} today={today} />

            <ConsentSection
              notice={notice}
              consented={consent.consented}
              changed={consent.changed}
              boxRef={consent.boxRef}
              onChange={(checked) => {
                consent.setChecked(checked)
                // 서버가 문구 버전으로 거부한 뒤 바뀐 문구로 다시 확인했다. 그 거부는 끝났으니 안내를 지운다.
                // 뒤에서 문구가 바뀐 경우와 같이, 다시 확인하면 안내가 사라진다. 다른 서버 오류는 건드리지 않는다.
                if (checked && rejectedForNotice) issue.reset()
                setLocalErrors((current) => ({ ...current, consentConfirmed: undefined }))
              }}
              error={errors.consentConfirmed}
            />

            {server.form && <Notice requestId={server.requestId}>{server.form}</Notice>}

            <Button type="submit" block disabled={!notice.data || !consented}>
              {saving ? '발급하는 중' : '패스 발급하기'}
            </Button>
          </Form>
        </Card>

        <IssuedPassCard issued={issued} />
      </div>

      <IssueConfirmModal
        summary={confirming}
        saving={saving}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) send(confirming)
        }}
      />
    </>
  )
}

function Heading() {
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">패스 발급</h1>
      <p className="mt-1 text-sub">수강료를 받은 뒤 학부모님께 동탄고 패스를 발급해요.</p>
    </>
  )
}
