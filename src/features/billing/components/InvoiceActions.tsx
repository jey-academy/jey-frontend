import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  ApiError,
  IDEMPOTENCY_IN_PROGRESS,
  isOutcomeUnknown,
  NO_SERVER_ERRORS,
  splitServerError,
  UNSURE_RESEND_AS_IS,
  type FieldErrors,
  type ServerErrors,
} from '@/shared/api'
import { formatDateTime, formatWon, parseWon } from '@/shared/lib'
import {
  Button,
  Card,
  Form,
  Modal,
  Notice,
  Segmented,
  TextField,
  useLeaveBlocker,
} from '@/shared/ui'
import {
  useCancelInvoice,
  useCancelPayment,
  useRecordPayment,
  type Invoice,
  type PaymentMethod,
  type PaymentRequest,
} from '../api'
import { PAYMENT_METHOD_LABELS } from '../invoiceView'

const REDEMPTIONS_PATH = '/desk/dongtanpass/redemptions'

type Action = 'record' | 'cancelPayment' | 'cancelInvoice'

const DONE_TEXT: Record<Action, string> = {
  record: '결제를 기록했어요.',
  cancelPayment: '결제를 취소했어요. 청구는 다시 결제 전이에요.',
  cancelInvoice: '청구를 취소했어요.',
}

/** 그 처리가 끝났을 때의 청구 상태. 답을 받지 못했을 때 청구를 다시 읽어 이것으로 결과를 가른다. */
const REACHED: Record<Action, (invoice: Invoice) => boolean> = {
  record: (invoice) => invoice.status === 'PAID',
  cancelPayment: (invoice) => invoice.status === 'ISSUED',
  cancelInvoice: (invoice) => invoice.status === 'CANCELED',
}

const LEAVE_TEXT = {
  sending: {
    title: '처리하는 중이에요',
    description: '결과를 받은 뒤에 넘어갈 수 있어요. 지금 떠나면 처리됐는지 알 수 없어요.',
  },
  unsure: {
    title: '결과를 아직 몰라요',
    description:
      '처리됐을 수 있어요. 먼저 "그대로 다시 보내기"를 눌러 결과를 확인해 주세요. 두 번 처리되지 않아요.',
  },
}

// 입력칸의 이름. 요청 본문의 필드 이름과 같아야 서버가 짚은 칸에 오류가 붙는다.
const PAYMENT_FIELDS = ['method', 'amount', 'bookFee'] as const
type PaymentField = (typeof PAYMENT_FIELDS)[number]
const NO_FIELDS = [] as const

const METHOD_OPTIONS = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
}))

const linkClassName =
  'font-semibold underline underline-offset-4 rounded-btn-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/**
 * 청구 상세의 오른쪽 칸: 상태에 따라 결제 기록·청구 취소(결제 전), 결제 정보·결제 취소(결제함), 안내(취소함).
 * 앱은 결제를 하지 않는다. 포스기·현금으로 받은 결과를 기록하고, 환불은 데스크에서 따로 한다.
 *
 * 답을 받지 못하면(처리됐는지 모름) 청구를 다시 읽는다(요청이 끝나면 청구를 낡은 것으로 표시한다). 청구 상태가 그 처리의
 * 결과로 바뀌었으면 끝난 것으로 보고, 그대로면 같은 키로 "그대로 다시 보내기"를 남긴다. 그동안 다른 처리는 막는다.
 */
export function InvoiceActions({ invoice, invoiceId }: { invoice: Invoice; invoiceId: number }) {
  const record = useRecordPayment(invoiceId)
  const cancelPayment = useCancelPayment(invoice.payment?.paymentId ?? 0)
  const cancelInvoice = useCancelInvoice(invoiceId)
  const mutations = { record, cancelPayment, cancelInvoice }

  // 마지막으로 보낸 처리와 끝낸 처리
  const [last, setLast] = useState<Action | null>(null)
  const [done, setDone] = useState<Action | null>(null)
  const [confirming, setConfirming] = useState<Action | null>(null)
  // 결제 기록 칸. 답을 받지 못했을 때 그대로 다시 보낼 본문도 남긴다.
  const [method, setMethod] = useState<PaymentMethod | ''>('')
  const [bookFee, setBookFee] = useState('0')
  const [localErrors, setLocalErrors] = useState<FieldErrors<PaymentField>>({})
  const [lastPayment, setLastPayment] = useState<PaymentRequest | null>(null)
  const formId = useId()

  const pending = record.isPending || cancelPayment.isPending || cancelInvoice.isPending
  const lastMutation = last ? mutations[last] : null
  const lastError = lastMutation?.isError ? lastMutation.error : null
  const lastCode = lastError instanceof ApiError ? lastError.code : null
  const answerUnknown =
    lastError !== null && (isOutcomeUnknown(lastError) || lastCode === IDEMPOTENCY_IN_PROGRESS)
  // 다시 읽은 청구가 그 처리의 결과로 바뀌었다. 처리된 것이다.
  const resolved = answerUnknown && last !== null && REACHED[last](invoice)
  const unsure = answerUnknown && !resolved
  const doneAction = resolved ? last : done

  const leaveBlock = useLeaveBlocker(
    pending ? LEAVE_TEXT.sending : unsure ? LEAVE_TEXT.unsure : null,
  )

  /** 지금 보이는 처리의 서버 오류. 끝났거나(답을 늦게 확인) 다른 처리면 없다. */
  function errorsOf(action: Action): ServerErrors<PaymentField> {
    if (last !== action || resolved || !mutations[action].isError) return NO_SERVER_ERRORS
    const error = mutations[action].error
    return action === 'record'
      ? splitServerError(error, {
          fields: PAYMENT_FIELDS,
          codes: { BILLING_INVALID_BOOK_FEE: 'bookFee' },
          unsure: UNSURE_RESEND_AS_IS,
        })
      : splitServerError(error, { fields: NO_FIELDS, unsure: UNSURE_RESEND_AS_IS })
  }

  function start(action: Action) {
    setLast(action)
    setDone(null)
    setConfirming(null)
  }

  function sendPayment(body: PaymentRequest) {
    start('record')
    setLastPayment(body)
    record.mutate(body, { onSuccess: () => setDone('record') })
  }

  function sendCancelPayment() {
    start('cancelPayment')
    cancelPayment.mutate(undefined, { onSuccess: () => setDone('cancelPayment') })
  }

  function sendCancelInvoice() {
    start('cancelInvoice')
    cancelInvoice.mutate(undefined, { onSuccess: () => setDone('cancelInvoice') })
  }

  function resend() {
    if (last === 'record' && lastPayment) sendPayment(lastPayment)
    else if (last === 'cancelPayment') sendCancelPayment()
    else if (last === 'cancelInvoice') sendCancelInvoice()
  }

  /** 결제 칸을 검사해 칸 아래에 알린다. 보낼 수 있으면 true다. 본문은 확인 창이 만든다. */
  function validatePayment(): boolean {
    const errors: FieldErrors<PaymentField> = {}
    if (method === '') errors.method = '결제 수단을 골라 주세요.'
    if (parseWon(bookFee) === null) {
      errors.bookFee = '교재비를 원 단위 숫자로 적어 주세요. 없으면 0이에요.'
    }
    setLocalErrors(errors)
    return Object.keys(errors).length === 0
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || unsure) return
    if (validatePayment()) setConfirming('record')
  }

  /** 칸을 고치면 서버가 짚었던 오류를 지운다. */
  function clearRecordError() {
    if (last === 'record' && record.isError && !unsure) record.reset()
  }

  const recordErrors = errorsOf('record')
  const fieldErrors: FieldErrors<PaymentField> = { ...recordErrors.fields, ...localErrors }
  // 확인 창에 보일 결제(칸의 지금 값). 칸 검사는 창을 열 때 이미 했다.
  const fee = parseWon(bookFee)
  const busy = pending || unsure

  return (
    <div className="grid gap-3">
      {leaveBlock}
      {doneAction && !pending && <Notice tone="success">{DONE_TEXT[doneAction]}</Notice>}

      {invoice.status === 'ISSUED' && (
        <Card>
          <h2 className="mb-1 text-[17px] font-bold">결제 기록</h2>
          <p className="mb-4 text-[14px] text-sub">
            포스기나 현금으로 받은 결과를 적어요. 앱이 결제하지는 않아요.
          </p>
          <Form id={formId} saving={busy} onSubmit={handleSubmit} className="grid gap-4">
            <Segmented
              label="결제 수단"
              name="method"
              options={METHOD_OPTIONS}
              value={method}
              onChange={(value) => {
                setMethod(value as PaymentMethod)
                setLocalErrors((current) => ({ ...current, method: undefined }))
                clearRecordError()
              }}
              error={fieldErrors.method}
            />
            <div>
              <p className="text-[14px] font-semibold">수강료</p>
              <p className="mt-1 text-[20px] font-bold tabular-nums">
                {formatWon(invoice.totalAmount)}
              </p>
              <p className="mt-1 text-[13px] text-sub">
                청구 금액 그대로 기록해요(나눠 내기 없음).
              </p>
            </div>
            <TextField
              label="교재비(원)"
              inputMode="numeric"
              value={bookFee}
              onChange={(event) => {
                setBookFee(event.target.value)
                setLocalErrors((current) => ({ ...current, bookFee: undefined }))
                clearRecordError()
              }}
              hint="수강료와 따로 받은 교재비예요. 없으면 0이에요."
              error={fieldErrors.bookFee}
            />
          </Form>
          {recordErrors.form && (
            <Notice className="mt-4" requestId={recordErrors.requestId}>
              {recordErrors.form}
            </Notice>
          )}
          <div className="mt-4 grid gap-2.5">
            {unsure && last === 'record' ? (
              <Button block onClick={resend} disabled={pending}>
                그대로 다시 보내기
              </Button>
            ) : (
              <Button type="submit" form={formId} block disabled={busy}>
                {record.isPending ? '기록하는 중' : '결제 기록하기'}
              </Button>
            )}
          </div>

          <CancelBlock
            label="청구 취소"
            pendingLabel="취소하는 중"
            errors={errorsOf('cancelInvoice')}
            unsure={unsure && last === 'cancelInvoice'}
            pending={cancelInvoice.isPending}
            disabled={busy}
            onOpen={() => setConfirming('cancelInvoice')}
            onResend={resend}
          />
        </Card>
      )}

      {invoice.status === 'PAID' && (
        <Card>
          <h2 className="mb-4 text-[17px] font-bold">결제</h2>
          {invoice.payment ? (
            <dl className="grid gap-2.5 rounded-md bg-field px-[18px] py-4 text-[15px]">
              <Row label="결제 수단">{PAYMENT_METHOD_LABELS[invoice.payment.method]}</Row>
              <Row label="수강료">{formatWon(invoice.payment.amount)}</Row>
              <Row label="교재비">{formatWon(invoice.payment.bookFee)}</Row>
              <Row label="결제 시각">{formatDateTime(invoice.payment.paidAt)}</Row>
            </dl>
          ) : (
            <p className="text-sub">결제 정보를 불러오지 못했어요.</p>
          )}
          <CancelBlock
            label="결제 취소"
            pendingLabel="취소하는 중"
            errors={errorsOf('cancelPayment')}
            unsure={unsure && last === 'cancelPayment'}
            pending={cancelPayment.isPending}
            disabled={busy || !invoice.payment}
            onOpen={() => setConfirming('cancelPayment')}
            onResend={resend}
          />
        </Card>
      )}

      {invoice.status === 'CANCELED' && (
        <Notice tone="info">
          취소한 청구예요. 다시 만들려면{' '}
          <Link to={REDEMPTIONS_PATH} className={linkClassName}>
            패스 사용 내역
          </Link>
          에서 청구 만들기를 눌러 주세요.
        </Notice>
      )}

      <Modal
        open={confirming === 'record' && method !== '' && fee !== null}
        onClose={() => setConfirming(null)}
        title="이대로 결제를 기록할까요?"
        description="받은 결과와 같은지 확인해 주세요. 틀렸다면 결제를 취소하고 다시 기록해요."
      >
        {method !== '' && fee !== null && (
          <>
            <dl className="mt-4 grid gap-2.5 rounded-md bg-field px-[18px] py-4 text-left text-[15px]">
              <Row label="결제 수단">{PAYMENT_METHOD_LABELS[method]}</Row>
              <Row label="수강료">{formatWon(invoice.totalAmount)}</Row>
              <Row label="교재비">{formatWon(fee)}</Row>
            </dl>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                돌아가기
              </Button>
              <Button
                // 수강료는 서버가 계산한 청구 합계 그대로다(나눠 내기 없음).
                onClick={() => sendPayment({ method, amount: invoice.totalAmount, bookFee: fee })}
              >
                기록하기
              </Button>
            </div>
          </>
        )}
      </Modal>
      <ConfirmCancel
        open={confirming === 'cancelInvoice'}
        title="청구를 취소할까요?"
        description="취소하면 이 청구로 결제를 기록할 수 없어요. 다시 만들려면 패스 사용 내역에서 청구 만들기를 눌러 주세요."
        confirmLabel="청구 취소하기"
        onClose={() => setConfirming(null)}
        onConfirm={sendCancelInvoice}
      />
      <ConfirmCancel
        open={confirming === 'cancelPayment'}
        title="결제를 취소할까요?"
        description="환불은 포스기에서 따로 해 주세요. 앱에는 취소 기록만 남고, 청구는 다시 결제 전이 돼요."
        confirmLabel="결제 취소하기"
        onClose={() => setConfirming(null)}
        onConfirm={sendCancelPayment}
      />
    </div>
  )
}

/** 취소 버튼과 그 오류, 답을 받지 못했을 때의 "그대로 다시 보내기" */
function CancelBlock({
  label,
  pendingLabel,
  errors,
  unsure,
  pending,
  disabled,
  onOpen,
  onResend,
}: {
  label: string
  pendingLabel: string
  errors: ServerErrors<PaymentField>
  unsure: boolean
  pending: boolean
  disabled: boolean
  onOpen: () => void
  onResend: () => void
}) {
  return (
    <div className="mt-4 grid gap-2.5 border-t border-line pt-4">
      {errors.form && <Notice requestId={errors.requestId}>{errors.form}</Notice>}
      {unsure ? (
        <Button variant="ghost" block onClick={onResend} disabled={pending}>
          그대로 다시 보내기
        </Button>
      ) : (
        <Button variant="ghost" block onClick={onOpen} disabled={disabled}>
          {pending ? pendingLabel : label}
        </Button>
      )}
    </div>
  )
}

function ConfirmCancel({
  open,
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          돌아가기
        </Button>
        <Button onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
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
