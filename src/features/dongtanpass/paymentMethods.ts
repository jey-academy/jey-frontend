import type { SegmentedOption } from '@/shared/ui'
import type { PassIssueRequest } from './api'

export type PaymentMethod = PassIssueRequest['paymentMethod']

/** 결제 수단의 이름. 발급 화면과 발급 장부가 같이 쓴다. */
export const paymentMethodLabels: Record<PaymentMethod, string> = {
  CARD: '카드',
  CASH: '현금',
  TRANSFER: '계좌이체',
  OTHER: '기타',
}

export const paymentMethodOptions: SegmentedOption[] = Object.entries(paymentMethodLabels).map(
  ([value, label]) => ({ value, label }),
)

export function isPaymentMethod(value: string): value is PaymentMethod {
  return Object.hasOwn(paymentMethodLabels, value)
}
