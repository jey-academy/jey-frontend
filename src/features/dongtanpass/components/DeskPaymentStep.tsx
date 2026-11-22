import { useId, useState, type FormEvent } from 'react'
import {
  useInvoice,
  useRecordPayment,
  type Payment,
  type PaymentMethod,
  type PaymentRequest,
} from '@/features/billing/api'
import { QuoteReceipt } from '@/features/billing/components/QuoteReceipt'
import { PAYMENT_METHOD_LABELS } from '@/features/billing/invoiceView'
import {
  ApiError,
  IDEMPOTENCY_IN_PROGRESS,
  isOutcomeUnknown,
  splitServerError,
  UNSURE_RESEND_AS_IS,
  type FieldErrors,
} from '@/shared/api'
import { parseWon } from '@/shared/lib'
import { invoicePath } from '@/shared/paths'
import { Button, ButtonLink, Form, Notice, Segmented, TextField } from '@/shared/ui'

const FIELDS = ['method', 'bookFee'] as const
type Field = (typeof FIELDS)[number]

const METHOD_OPTIONS = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
}))

/** 이미 결제가 기록됐거나 취소된 청구라 기록할 수 없다는 답. 다시 보내도 같다. 청구 상세에서 확인하게 한다. */
const CONFLICT_CODES = new Set(['BILLING_INVOICE_NOT_PAYABLE', 'BILLING_PAYMENT_ALREADY_EXISTS'])

type DeskPaymentStepProps = {
  invoiceId: number
  /** 청구를 만든 응답의 합계(서버 값). 결제 기록의 수강료로 그대로 보낸다. */
  totalAmount: number
  onPaid: (payment: Payment) => void
  /** 결제를 나중에 받는다. 청구까지만 하고 끝낸다. */
  onLater: () => void
  /** 결제를 보내고 답을 기다리는지, 답을 모르는지 바깥(떠나기 막기)에 알린다. */
  onBusyChange?: (busy: boolean) => void
  /** 버튼 줄(안내, 결제 기록하기, 나중에 받기, 청구 보기)의 클래스. 데스크 카드는 카드 아래에 붙인다. */
  actionsClassName?: string
}

/**
 * 데스크 한 화면 흐름의 마지막 단계(#228): 실제로 만들어진 청구의 영수증을 보여 주고 결제를 기록한다.
 * 직원은 영수증의 받을 금액으로 포스기 결제를 한 뒤 누른다. 이 영수증이 청구 상세의 확인 창을 대신한다.
 * 앱은 결제를 하지 않는다. 받은 결과를 기록할 뿐이다.
 */
export function DeskPaymentStep({
  invoiceId,
  totalAmount,
  onPaid,
  onLater,
  onBusyChange,
  actionsClassName,
}: DeskPaymentStepProps) {
  const formId = useId()
  const invoice = useInvoice(invoiceId)
  const record = useRecordPayment(invoiceId)
  const [method, setMethod] = useState<PaymentMethod | ''>('')
  const [bookFee, setBookFee] = useState('0')
  const [localErrors, setLocalErrors] = useState<FieldErrors<Field>>({})
  const [lastSent, setLastSent] = useState<PaymentRequest | null>(null)

  const error = record.isError ? record.error : null
  const code = error instanceof ApiError ? error.code : null
  const unsure = error !== null && (isOutcomeUnknown(error) || code === IDEMPOTENCY_IN_PROGRESS)
  const conflict = code !== null && CONFLICT_CODES.has(code)
  const server = error
    ? splitServerError(error, {
        fields: FIELDS,
        codes: { BILLING_INVALID_BOOK_FEE: 'bookFee' },
        unsure: UNSURE_RESEND_AS_IS,
      })
    : null
  const errors: FieldErrors<Field> = { ...server?.fields, ...localErrors }
  const busy = record.isPending || unsure

  function send(body: PaymentRequest) {
    setLastSent(body)
    onBusyChange?.(true)
    record.mutate(body, {
      onSuccess: (payment) => onPaid(payment),
      onSettled: (_data, settledError) => {
        // 답을 모르면 떠나기 막기를 남긴다(같은 키로 다시 보내야 결과를 안다).
        const keep =
          settledError !== null &&
          (isOutcomeUnknown(settledError) ||
            (settledError instanceof ApiError && settledError.code === IDEMPOTENCY_IN_PROGRESS))
        onBusyChange?.(keep)
      },
    })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (record.isPending) return
    // 칸은 잠겨 있다. 처음 보낸 것과 같은 키로 나가 처음 결과를 받는다.
    if (unsure && lastSent) {
      send(lastSent)
      return
    }
    const next: FieldErrors<Field> = {}
    if (method === '') next.method = '결제 수단을 골라 주세요.'
    const fee = parseWon(bookFee)
    if (fee === null) next.bookFee = '교재비를 원 단위 숫자로 적어 주세요. 없으면 0이에요.'
    setLocalErrors(next)
    if (method === '' || fee === null) return
    // 수강료는 서버가 계산한 청구 합계 그대로다(나눠 내기 없음).
    send({ method, amount: totalAmount, bookFee: fee })
  }

  function clearServerError() {
    if (record.isError && !unsure) record.reset()
  }

  return (
    <div className="grid gap-3">
      <QuoteReceipt
        quote={invoice.data ?? null}
        calculating={invoice.isPending}
        error={invoice.error}
        waitingFor=""
        onRetry={() => void invoice.refetch()}
      />
      <Form id={formId} saving={busy} onSubmit={handleSubmit} className="grid gap-3.5">
        <TextField
          label="교재비(원)"
          inputMode="numeric"
          value={bookFee}
          onChange={(event) => {
            setBookFee(event.target.value)
            setLocalErrors((current) => ({ ...current, bookFee: undefined }))
            clearServerError()
          }}
          hint="수강료와 따로 받은 교재비예요. 없으면 0이에요."
          error={errors.bookFee}
        />
      </Form>
      {/* 버튼 줄. 데스크 카드에서는 카드 아래에 붙는다(actionsClassName). 꼭 골라야 하는 결제 수단과 오류 안내도
          여기에 둔다. 영수증이 길어 카드 안이 스크롤돼도 가려지지 않게. 폼 밖이라 잠금은 disabled로 따로 건다. */}
      <div className={`grid gap-3 ${actionsClassName ?? ''}`}>
        {server?.form && <Notice requestId={server.requestId}>{server.form}</Notice>}
        {conflict ? (
          <ButtonLink block to={invoicePath(invoiceId)}>
            청구 보기
          </ButtonLink>
        ) : (
          <>
            <Segmented
              label="결제 수단"
              name="method"
              options={METHOD_OPTIONS}
              value={method}
              disabled={busy}
              onChange={(value) => {
                setMethod(value as PaymentMethod)
                setLocalErrors((current) => ({ ...current, method: undefined }))
                clearServerError()
              }}
              error={errors.method}
            />
            <p className="text-[13px] text-sub">포스기나 현금으로 받은 뒤 눌러 주세요.</p>
            {/* 나란히 둔다. 버튼 줄이 낮을수록 카드 안에서 영수증(받을 금액)이 덜 가려진다. */}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={onLater} disabled={busy}>
                나중에 받기
              </Button>
              <Button type="submit" form={formId} disabled={record.isPending}>
                {record.isPending ? '기록하는 중' : unsure ? '그대로 다시 보내기' : '결제 기록하기'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
