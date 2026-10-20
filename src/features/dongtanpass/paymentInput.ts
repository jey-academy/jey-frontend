import type { FieldErrors } from '@/shared/api'
import { parseWon } from '@/shared/lib'
import { isPaymentMethod, type PaymentMethod } from './paymentMethods'

/**
 * 발급의 근거 결제를 적는 칸의 값. 연계 학원 발급과 JEY 발급이 같이 쓴다.
 * 칸 이름이 요청 본문의 필드 이름과 같아야 서버가 짚은 칸에 오류가 붙는다.
 */
export type PaymentInput = {
  paidOn: string
  paidAmount: string
  paymentMethod: string
}

export type PaymentField = keyof PaymentInput

export const PAYMENT_FIELDS = [
  'paidOn',
  'paidAmount',
  'paymentMethod',
] as const satisfies readonly PaymentField[]

/** 필드 목록 없이 코드로만 오는 결제 칸의 오류가 어느 칸의 문제인지. */
export const paymentCodeFields: Record<string, PaymentField> = {
  DONGTANPASS_PAID_ON_IN_FUTURE: 'paidOn',
  DONGTANPASS_INVALID_PAID_AMOUNT: 'paidAmount',
}

/** 결제일은 오늘(한국 날짜)로 시작한다. 대개 그날 받은 결제다. */
export function emptyPayment(today: string): PaymentInput {
  return { paidOn: today, paidAmount: '', paymentMethod: '' }
}

/** 보내기 전에 화면에서 확인할 수 있는 것을 확인한다. 나머지 규칙(금액 0원 등)은 서버가 판단한다. */
export function validatePayment(input: PaymentInput, today: string): FieldErrors<PaymentField> {
  const errors: FieldErrors<PaymentField> = {}
  if (input.paidOn === '') errors.paidOn = '결제일을 골라 주세요.'
  // 날짜 칸의 값은 늘 YYYY-MM-DD라 글자 순서가 날짜 순서다.
  else if (input.paidOn > today) errors.paidOn = '결제일은 오늘보다 뒤일 수 없어요.'
  if (input.paidAmount.trim() === '') errors.paidAmount = '결제 금액을 입력해 주세요.'
  else if (parseWon(input.paidAmount.trim()) === null) {
    errors.paidAmount = '금액을 숫자로 적어 주세요. 예: 280,000'
  }
  if (!isPaymentMethod(input.paymentMethod)) errors.paymentMethod = '결제 수단을 골라 주세요.'
  return errors
}

/** 요청 본문에 넣을 결제. 확인(validatePayment)을 통과하지 못한 값이면 null이다. */
export function toPayment(
  input: PaymentInput,
): { paidOn: string; paidAmount: number; paymentMethod: PaymentMethod } | null {
  const paidAmount = parseWon(input.paidAmount.trim())
  if (paidAmount === null || !isPaymentMethod(input.paymentMethod)) return null
  // 날짜 칸의 값을 그대로 보낸다. Date로 바꾸면(toISOString) 한국 0~9시에 하루 전 날짜가 나간다.
  return { paidOn: input.paidOn, paidAmount, paymentMethod: input.paymentMethod }
}
