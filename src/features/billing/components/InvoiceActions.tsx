import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  ApiError,
  IDEMPOTENCY_IN_PROGRESS,
  isOutcomeUnknown,
  NO_SERVER_ERRORS,
  splitServerError,
  supportRequestId,
  UNSURE_RESEND_AS_IS,
  type FieldErrors,
  type ServerErrors,
} from '@/shared/api'
import { formatDateTime, formatWon, parseWon } from '@/shared/lib'
import { REDEMPTIONS_PATH } from '@/shared/paths'
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
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS, wonOrNull } from '../invoiceView'

type Action = 'record' | 'cancelPayment' | 'cancelInvoice'

const DONE_TEXT: Record<Action, string> = {
  record: '결제를 기록했어요.',
  cancelPayment: '결제를 취소했어요. 청구는 다시 결제 전이에요.',
  cancelInvoice: '청구를 취소했어요.',
}

/**
 * 그 처리가 끝났을 때의 청구 상태. 답을 받지 못한 뒤 청구가 바뀌었을 때, 바뀐 상태가 이것이면 처리된 것으로 본다.
 * 상태만 본다. 그사이 다른 데서 같은 처리를 했어도 같은 상태라 가를 수 없다. 그래서 "처리된 것을 확인했어요"라고만 하고
 * 아래 내용이 맞는지 보게 한다. 끝났다고 알리는 것도 청구가 이 상태인 동안만이다.
 */
const REACHED: Record<Action, (invoice: Invoice) => boolean> = {
  record: (invoice) => invoice.status === 'PAID',
  cancelPayment: (invoice) => invoice.status === 'ISSUED',
  cancelInvoice: (invoice) => invoice.status === 'CANCELED',
}

/**
 * 다른 곳에서 먼저 처리돼 이 처리를 할 수 없다는 답. 청구를 다시 읽으면 처리 칸이 바뀌어(예: 결제 전 → 결제함)
 * 칸 안의 안내가 함께 사라진다. 칸 밖에 남겨, 직원이 남의 처리를 자기 것으로 오해하지 않게 한다.
 */
const CONFLICT_CODES = new Set([
  'BILLING_INVOICE_NOT_PAYABLE',
  'BILLING_PAYMENT_ALREADY_EXISTS',
  'BILLING_PAYMENT_ALREADY_CANCELED',
  'BILLING_PAYMENT_NOT_FOUND',
  'BILLING_INVOICE_NOT_CANCELABLE',
])

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

// 서버가 짚는 칸 이름. 요청 본문의 필드 이름과 같아야 한다. 여기 넣은 칸은 그 오류를 화면에 그린다
// (수강료 `amount`는 입력칸이 없어 넣지 않는다. 그 오류는 칸 아래가 아니라 폼 아래로 간다).
const PAYMENT_FIELDS = ['method', 'bookFee'] as const
type PaymentField = (typeof PAYMENT_FIELDS)[number]
const NO_FIELDS = [] as const

const METHOD_OPTIONS = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
}))

const linkClassName =
  'font-semibold underline underline-offset-4 rounded-btn-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/** 보낸 처리. 답을 받지 못했을 때 결과를 가르려고, 보낼 때의 청구 상태와 (결제 취소면) 결제 id를 같이 남긴다. */
type Attempt = {
  action: Action
  startStatus: string | null
  /** 결제 취소면 직원이 확인한 결제의 id. 다시 보낼 때도 이 결제로만 보낸다. */
  paymentId: number | null
  /** 결제 기록이면 보낸 본문. 그대로 다시 보낼 때 쓴다. */
  body: PaymentRequest | null
}

/** 처리 칸 위에 알릴 것. 다음 처리를 보내면 지운다. */
type Outcome =
  | { kind: 'done'; action: Action }
  | { kind: 'confirmed'; action: Action }
  | { kind: 'changed'; status: string | null }
  | { kind: 'conflict'; message: string; requestId: string | null }

/**
 * 청구 상세의 처리 칸(넓은 화면에서 오른쪽): 상태에 따라 결제 기록·청구 취소(결제 전), 결제 정보·결제 취소(결제함),
 * 안내(취소함). 앱은 결제를 하지 않는다. 포스기·현금으로 받은 결과를 기록하고, 환불은 데스크에서 따로 한다.
 *
 * 답을 받지 못했거나 서버가 아직 처리 중이라고 하면(처리됐는지 모름) 칸을 잠그고 같은 키로 "그대로 다시 보내기"만 남긴다.
 * 요청이 끝나면 청구를 다시 읽는데, 다시 읽은 청구가 보낼 때와 달라졌으면 그때 한 번만 결과를 정한다.
 * 그 처리의 결과 상태면 "처리된 것을 확인했어요", 아니면 "그사이 청구가 바뀌었어요"로 알리고 막기를 푼다.
 * 이렇게 끝낸 뒤 새로 보내는 처리는 옛 키를 버리고 새 키로 나간다(같은 내용이어도 서버가 옛 응답을 돌려주지 않게).
 */
export function InvoiceActions({ invoice, invoiceId }: { invoice: Invoice; invoiceId: number }) {
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [confirming, setConfirming] = useState<Action | null>(null)
  // 취소하려고 고른 결제. 확인 창을 열 때 정하고, 그 결제로만 보낸다.
  const [cancelTarget, setCancelTarget] = useState<number | null>(null)
  // 결제 기록 칸
  const [method, setMethod] = useState<PaymentMethod | ''>('')
  const [bookFee, setBookFee] = useState('0')
  const [localErrors, setLocalErrors] = useState<FieldErrors<PaymentField>>({})
  const formId = useId()

  const record = useRecordPayment(invoiceId)
  const cancelPayment = useCancelPayment(invoiceId, cancelTarget ?? 0)
  const cancelInvoice = useCancelInvoice(invoiceId)
  const mutations = { record, cancelPayment, cancelInvoice }

  const pending = record.isPending || cancelPayment.isPending || cancelInvoice.isPending
  const attemptMutation = attempt ? mutations[attempt.action] : null
  const attemptError = attemptMutation?.isError ? attemptMutation.error : null
  const attemptCode = attemptError instanceof ApiError ? attemptError.code : null
  const answerUnknown =
    attempt !== null &&
    attemptError !== null &&
    (isOutcomeUnknown(attemptError) || attemptCode === IDEMPOTENCY_IN_PROGRESS)
  // 다시 읽은 청구가 보낼 때와 다르다. 결제 취소는 그사이 다른 결제로 바뀐 것도 바뀐 것이다.
  const changedSinceSend =
    attempt !== null &&
    (invoice.status !== attempt.startStatus ||
      (attempt.action === 'cancelPayment' &&
        (invoice.payment?.paymentId ?? null) !== attempt.paymentId))

  // 답을 모르는데 청구가 바뀌었다. 여기서 한 번만 결과를 정한다(렌더 중에 맞춘다, React 문서의 "이전 렌더의 정보 저장").
  // 뒤에 청구가 또 바뀌어도 다시 "결과 모름"으로 돌아가지 않는다.
  if (answerUnknown && changedSinceSend) {
    setOutcome(
      REACHED[attempt.action](invoice)
        ? { kind: 'confirmed', action: attempt.action }
        : { kind: 'changed', status: invoice.status },
    )
    setAttempt(null)
  }
  const unsure = answerUnknown && !changedSinceSend

  // 확인 창을 연 채 청구가 바뀌어 그 처리를 할 수 없게 됐다. 창을 닫고 알린다(엉뚱한 요청이 나가지 않게).
  const confirmable =
    confirming === null ||
    (confirming === 'cancelPayment'
      ? invoice.status === 'PAID' && invoice.payment?.paymentId === cancelTarget
      : invoice.status === 'ISSUED')
  if (!confirmable) {
    setConfirming(null)
    setOutcome({ kind: 'changed', status: invoice.status })
  }

  const leaveBlock = useLeaveBlocker(
    pending ? LEAVE_TEXT.sending : unsure ? LEAVE_TEXT.unsure : null,
  )

  /** 지금 보낸 처리의 서버 오류(칸·폼 아래). 끝냈거나(attempt 없음) 다른 처리면 없다. */
  function errorsOf(action: Action): ServerErrors<PaymentField> {
    if (attempt?.action !== action || !mutations[action].isError) return NO_SERVER_ERRORS
    const error = mutations[action].error
    return action === 'record'
      ? splitServerError(error, {
          fields: PAYMENT_FIELDS,
          codes: { BILLING_INVALID_BOOK_FEE: 'bookFee' },
          unsure: UNSURE_RESEND_AS_IS,
        })
      : splitServerError(error, { fields: NO_FIELDS, unsure: UNSURE_RESEND_AS_IS })
  }

  /** 새로 보내는 처리. 옛 키를 버리고(같은 내용이어도 새 키), 지난 알림을 지운다. */
  function begin(action: Action, next: Omit<Attempt, 'action' | 'startStatus'>) {
    mutations[action].forgetKey()
    setOutcome(null)
    setConfirming(null)
    setAttempt({ action, startStatus: invoice.status, ...next })
  }

  function handlers(action: Action) {
    return {
      onSuccess: () => {
        setOutcome({ kind: 'done', action })
        setAttempt(null)
      },
      onError: (error: Error) => {
        if (error instanceof ApiError && error.code !== null && CONFLICT_CODES.has(error.code)) {
          setOutcome({
            kind: 'conflict',
            message: error.message,
            requestId: supportRequestId(error),
          })
          setAttempt(null)
        }
      },
    }
  }

  function sendPayment(body: PaymentRequest) {
    begin('record', { paymentId: null, body })
    record.mutate(body, handlers('record'))
  }

  function sendCancelPayment() {
    begin('cancelPayment', { paymentId: cancelTarget, body: null })
    cancelPayment.mutate(undefined, handlers('cancelPayment'))
  }

  function sendCancelInvoice() {
    begin('cancelInvoice', { paymentId: null, body: null })
    cancelInvoice.mutate(undefined, handlers('cancelInvoice'))
  }

  /** 답을 받지 못한 처리를 같은 내용·같은 키로 다시 보낸다(키를 버리지 않는다). */
  function resend() {
    if (!attempt) return
    if (attempt.action === 'record' && attempt.body) {
      record.mutate(attempt.body, handlers('record'))
    } else if (attempt.action === 'cancelPayment') {
      cancelPayment.mutate(undefined, handlers('cancelPayment'))
    } else if (attempt.action === 'cancelInvoice') {
      cancelInvoice.mutate(undefined, handlers('cancelInvoice'))
    }
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
    if (attempt?.action === 'record' && record.isError && !unsure) record.reset()
  }

  const recordErrors = errorsOf('record')
  const fieldErrors: FieldErrors<PaymentField> = { ...recordErrors.fields, ...localErrors }
  // 확인 창에 보이고 그대로 보낼 교재비(칸의 지금 값). 칸 검사는 창을 열 때 이미 했다.
  const fee = parseWon(bookFee)
  const busy = pending || unsure

  return (
    <div className="grid gap-3">
      {leaveBlock}
      {!pending && <OutcomeNotice outcome={outcome} invoice={invoice} />}

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
            {unsure && attempt?.action === 'record' ? (
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
            errors={errorsOf('cancelInvoice')}
            unsure={unsure && attempt?.action === 'cancelInvoice'}
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
              <Row label="수강료">{wonOrNull(invoice.payment.amount) ?? '확인 필요'}</Row>
              <Row label="교재비">{wonOrNull(invoice.payment.bookFee) ?? '확인 필요'}</Row>
              <Row label="결제 시각">{formatDateTime(invoice.payment.paidAt)}</Row>
            </dl>
          ) : (
            // 결제함이면 결제가 있어야 한다(서버 약속). 불러오기 문제가 아니다.
            <Notice>결제 정보가 없어요. 관리자에게 알려 주세요.</Notice>
          )}
          <CancelBlock
            label="결제 취소"
            errors={errorsOf('cancelPayment')}
            unsure={unsure && attempt?.action === 'cancelPayment'}
            pending={cancelPayment.isPending}
            disabled={busy || !invoice.payment}
            onOpen={() => {
              setCancelTarget(invoice.payment?.paymentId ?? null)
              setConfirming('cancelPayment')
            }}
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

      {invoice.status !== 'ISSUED' &&
        invoice.status !== 'PAID' &&
        invoice.status !== 'CANCELED' && (
          <Notice>{`알 수 없는 청구 상태예요(${invoice.status ?? '없음'}). 관리자에게 알려 주세요.`}</Notice>
        )}

      <Modal
        open={confirming === 'record' && confirmable && method !== '' && fee !== null}
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
        open={confirming === 'cancelInvoice' && confirmable}
        title="청구를 취소할까요?"
        description="취소하면 이 청구로 결제를 기록할 수 없어요. 다시 만들려면 패스 사용 내역에서 청구 만들기를 눌러 주세요."
        confirmLabel="청구 취소하기"
        onClose={() => setConfirming(null)}
        onConfirm={sendCancelInvoice}
      />
      <ConfirmCancel
        open={confirming === 'cancelPayment' && confirmable}
        title="결제를 취소할까요?"
        description="환불은 포스기에서 따로 해 주세요. 앱에는 취소 기록만 남고, 청구는 다시 결제 전이 돼요."
        confirmLabel="결제 취소하기"
        onClose={() => setConfirming(null)}
        onConfirm={sendCancelPayment}
      />
    </div>
  )
}

/** 처리 칸 위의 알림. 끝났다는 알림은 청구가 그 결과 상태인 동안만 보인다(그 뒤 다른 데서 바꾸면 거짓이 된다). */
function OutcomeNotice({ outcome, invoice }: { outcome: Outcome | null; invoice: Invoice }) {
  if (outcome === null) return null
  if (outcome.kind === 'done') {
    return REACHED[outcome.action](invoice) ? (
      <Notice tone="success">{DONE_TEXT[outcome.action]}</Notice>
    ) : null
  }
  if (outcome.kind === 'confirmed') {
    return REACHED[outcome.action](invoice) ? (
      <Notice tone="success">처리된 것을 확인했어요. 아래 내용이 맞는지 봐 주세요.</Notice>
    ) : null
  }
  if (outcome.kind === 'changed') {
    const status = INVOICE_STATUS_LABELS[outcome.status ?? ''] ?? outcome.status ?? '알 수 없음'
    return (
      <Notice tone="warning">
        {`그사이 청구가 바뀌었어요(지금: ${status}). 아래 상태를 확인해 주세요.`}
      </Notice>
    )
  }
  return (
    <Notice tone="warning" requestId={outcome.requestId}>
      {`${outcome.message} 다른 곳에서 먼저 처리했을 수 있어요. 아래 상태를 확인해 주세요.`}
    </Notice>
  )
}

/** 취소 버튼과 그 오류, 답을 받지 못했을 때의 "그대로 다시 보내기" */
function CancelBlock({
  label,
  errors,
  unsure,
  pending,
  disabled,
  onOpen,
  onResend,
}: {
  label: string
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
          {pending ? '취소하는 중' : label}
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
