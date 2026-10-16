import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ApiError,
  NO_SERVER_ERRORS,
  splitServerError,
  supportRequestId,
  UNSURE_RESEND_AS_IS,
  type FieldErrors,
} from '@/shared/api'
import { formatDate, formatWon, isMobilePhone, parseWon, todayInSeoul } from '@/shared/lib'
import { Button, Card, CheckboxField, Form, Modal, Notice, Segmented, TextField } from '@/shared/ui'
import {
  consentNoticeQueryKey,
  useConsentNotice,
  useIssuePass,
  type IssuedPass,
  type PassIssueRequest,
} from '../api'
import { IssuedPassCard } from '../components/IssuedPassCard'
import { isPaymentMethod, paymentMethodLabels, paymentMethodOptions } from '../paymentMethods'

// 입력칸의 이름. 요청 본문의 필드 이름과 같아야 서버가 짚은 칸에 오류가 붙는다.
const FIELDS = [
  'studentName',
  'guardianPhone',
  'paidOn',
  'paidAmount',
  'paymentMethod',
  'consentConfirmed',
] as const satisfies readonly (keyof PassIssueRequest)[]
type Field = (typeof FIELDS)[number]

// 필드 목록 없이 코드로만 오는 오류가 어느 칸의 문제인지.
const codeFields: Record<string, Field> = {
  DONGTANPASS_PAID_ON_IN_FUTURE: 'paidOn',
  DONGTANPASS_INVALID_PAID_AMOUNT: 'paidAmount',
  DONGTANPASS_CONSENT_NOT_CONFIRMED: 'consentConfirmed',
}

/** 보여 준 문구가 지금 문구와 다르다는 답. 문구를 다시 받아 보여 주고 다시 확인하게 한다. */
const NOTICE_VERSION_MISMATCH = 'DONGTANPASS_NOTICE_VERSION_MISMATCH'
/** 꺼진 학원. 문구 조회와 발급이 모두 이 답이다. */
const PARTNER_INACTIVE = 'DONGTANPASS_PARTNER_INACTIVE'

const STUDENT_NAME_MAX = 50
const PHONE_FORMAT_ERROR = '휴대전화 번호 형식이 아니에요. 예: 010-1234-5678'

type Input = {
  studentName: string
  guardianPhone: string
  paidOn: string
  paidAmount: string
  paymentMethod: string
}

/** 연계 학원의 패스 발급. 수강료를 받은 뒤 학부모 링크를 만든다. */
export function PassIssuePage() {
  const queryClient = useQueryClient()
  const notice = useConsentNotice()
  const issue = useIssuePass()
  const [today] = useState(() => todayInSeoul())
  const [input, setInput] = useState<Input>({
    studentName: '',
    guardianPhone: '',
    paidOn: today,
    paidAmount: '',
    paymentMethod: '',
  })
  const [consented, setConsented] = useState(false)
  // 보내기 전에 걸러 낸 오류. 서버가 준 오류는 issue.error에서 읽는다.
  const [localErrors, setLocalErrors] = useState<FieldErrors<Field>>({})
  // 확인 창에 보여 주고 그대로 보낼 본문. null이면 창이 닫혀 있다.
  const [confirming, setConfirming] = useState<PassIssueRequest | null>(null)
  const [issued, setIssued] = useState<{ pass: IssuedPass; studentName: string } | null>(null)
  const consentBox = useRef<HTMLInputElement>(null)
  // 문구가 바뀌었다는 답을 받았는지. 새 문구가 오면 동의 칸으로 포커스를 옮겨 다시 확인하게 한다.
  const refocusConsent = useRef(false)

  useEffect(() => {
    if (!refocusConsent.current || !notice.data) return
    refocusConsent.current = false
    consentBox.current?.focus()
  }, [notice.data])

  const saving = issue.isPending
  const errorCode = issue.error instanceof ApiError ? issue.error.code : null
  const noticeChanged = errorCode === NOTICE_VERSION_MISMATCH
  const server =
    issue.isError && !noticeChanged
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
    if (input.paidOn === '') next.paidOn = '결제일을 골라 주세요.'
    // 날짜 칸의 값은 늘 YYYY-MM-DD라 글자 순서가 날짜 순서다.
    else if (input.paidOn > today) next.paidOn = '결제일은 오늘보다 뒤일 수 없어요.'
    if (input.paidAmount.trim() === '') next.paidAmount = '결제 금액을 입력해 주세요.'
    else if (parseWon(input.paidAmount.trim()) === null) {
      next.paidAmount = '금액을 숫자로 적어 주세요. 예: 280,000'
    }
    if (!isPaymentMethod(input.paymentMethod)) next.paymentMethod = '결제 수단을 골라 주세요.'
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
    const paidAmount = parseWon(input.paidAmount.trim())
    if (paidAmount === null || !isPaymentMethod(input.paymentMethod)) return
    setConfirming({
      studentName: input.studentName.trim(),
      guardianPhone: input.guardianPhone.trim(),
      // 날짜 칸의 값을 그대로 보낸다. Date로 바꾸면(toISOString) 한국 0~9시에 하루 전 날짜가 나간다.
      paidOn: input.paidOn,
      paidAmount,
      paymentMethod: input.paymentMethod,
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
        setConsented(false)
      },
      onError: (error) => {
        setConfirming(null)
        if (error instanceof ApiError && error.code === NOTICE_VERSION_MISMATCH) {
          // 바뀐 문구를 읽고 다시 확인해야 한다. 옛 문구를 지우고(reset) 새로 받는다.
          // 다시 받기만 하면(invalidate) 받는 동안이나 받지 못했을 때 옛 문구와 켜진 동의 칸이 남는다.
          setConsented(false)
          refocusConsent.current = true
          void queryClient.resetQueries({ queryKey: consentNoticeQueryKey })
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
            <div className="grid gap-3.5 min-[561px]:grid-cols-2">
              <TextField
                label="결제일"
                type="date"
                value={input.paidOn}
                max={today}
                onChange={(event) => change('paidOn', event.target.value)}
                error={errors.paidOn}
              />
              <TextField
                label="결제 금액(원)"
                value={input.paidAmount}
                onChange={(event) => change('paidAmount', event.target.value)}
                placeholder="280,000"
                inputMode="numeric"
                autoComplete="off"
                error={errors.paidAmount}
              />
            </div>
            <Segmented
              label="결제 수단"
              name="paymentMethod"
              options={paymentMethodOptions}
              value={input.paymentMethod}
              onChange={(value) => change('paymentMethod', value)}
              error={errors.paymentMethod}
            />

            <section aria-labelledby="consent-title" className="mt-1">
              <h3 id="consent-title" className="mb-1.5 text-[14px] font-semibold">
                개인정보 안내
              </h3>
              <ConsentNoticeText notice={notice} />
              {noticeChanged && (
                <Notice tone="warning" className="mt-3">
                  안내 문구가 바뀌었어요. 바뀐 문구를 학부모에게 다시 알리고 확인해 주세요.
                </Notice>
              )}
              <CheckboxField
                ref={consentBox}
                label="학부모에게 알리고 동의를 받았어요"
                checked={consented}
                onChange={(event) => {
                  setConsented(event.target.checked)
                  setLocalErrors((current) => ({ ...current, consentConfirmed: undefined }))
                }}
                disabled={!notice.data}
                error={errors.consentConfirmed}
                className="mt-2"
              />
            </section>

            {server.form && <Notice requestId={server.requestId}>{server.form}</Notice>}

            <Button type="submit" block disabled={!notice.data || !consented}>
              {saving ? '발급하는 중' : '패스 발급하기'}
            </Button>
          </Form>
        </Card>

        <IssuedPassCard issued={issued} />
      </div>

      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        closable={!saving}
        title="이대로 발급할까요?"
        description="발급한 뒤에는 결제 기록을 고칠 수 없어요. 틀렸다면 취소하고 다시 발급해야 해요."
      >
        {confirming && (
          <>
            <dl className="mt-4 grid gap-2.5 rounded-md bg-field px-[18px] py-4 text-left text-[15px]">
              <SummaryRow label="학생 이름" value={confirming.studentName} />
              <SummaryRow label="결제일" value={formatDate(confirming.paidOn)} />
              <SummaryRow label="결제 금액" value={formatWon(confirming.paidAmount)} />
              <SummaryRow label="결제 수단" value={paymentMethodLabels[confirming.paymentMethod]} />
            </dl>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setConfirming(null)} disabled={saving}>
                다시 확인
              </Button>
              <Button onClick={() => send(confirming)} disabled={saving}>
                {saving ? '발급하는 중' : '발급하기'}
              </Button>
            </div>
          </>
        )}
      </Modal>
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-sub">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

/** 고지 문구. 받는 중이면 그 안내를, 받지 못했으면 다시 불러오기를 보여 준다. */
function ConsentNoticeText({ notice }: { notice: ReturnType<typeof useConsentNotice> }) {
  if (notice.data) {
    // 서버 문구의 줄바꿈을 살린다.
    return (
      <Notice tone="info" className="whitespace-pre-line">
        {notice.data.text}
      </Notice>
    )
  }
  if (notice.error) {
    return (
      <div>
        <Notice requestId={supportRequestId(notice.error)}>
          안내 문구를 불러오지 못했어요. 문구를 받아야 발급할 수 있어요.
        </Notice>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={() => void notice.refetch()}
          disabled={notice.isFetching}
        >
          안내 문구 다시 불러오기
        </Button>
      </div>
    )
  }
  return <p className="text-[14px] text-sub">안내 문구를 불러오고 있어요.</p>
}
