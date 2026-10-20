import type { FieldErrors } from '@/shared/api'
import { Segmented, TextField } from '@/shared/ui'
import type { PaymentField, PaymentInput } from '../paymentInput'
import { paymentMethodOptions } from '../paymentMethods'

type PaymentFieldsProps = {
  value: PaymentInput
  onChange: (field: PaymentField, value: string) => void
  errors: FieldErrors<PaymentField>
  /** 오늘(한국 날짜). 결제일은 이보다 뒤일 수 없다. */
  today: string
  /** 결제 금액 칸의 보기 */
  amountPlaceholder?: string
}

/** 발급의 근거 결제(결제일·금액·수단)를 적는 칸. 연계 학원 발급과 JEY 발급이 같이 쓴다. */
export function PaymentFields({
  value,
  onChange,
  errors,
  today,
  amountPlaceholder = '280,000',
}: PaymentFieldsProps) {
  return (
    <>
      <div className="grid gap-3.5 min-[561px]:grid-cols-2">
        <TextField
          label="결제일"
          type="date"
          value={value.paidOn}
          max={today}
          onChange={(event) => onChange('paidOn', event.target.value)}
          error={errors.paidOn}
        />
        <TextField
          label="결제 금액(원)"
          value={value.paidAmount}
          onChange={(event) => onChange('paidAmount', event.target.value)}
          placeholder={amountPlaceholder}
          inputMode="numeric"
          autoComplete="off"
          error={errors.paidAmount}
        />
      </div>
      <Segmented
        label="결제 수단"
        name="paymentMethod"
        options={paymentMethodOptions}
        value={value.paymentMethod}
        onChange={(next) => onChange('paymentMethod', next)}
        error={errors.paymentMethod}
      />
    </>
  )
}
