import { formatPercent, formatWon } from '@/shared/lib'
import type { ReceiptRow } from '@/shared/ui'
import type { Invoice, PaymentMethod } from './api'
import { discountLabel } from './invoiceInput'

// 응답의 discountPolicy. 중복 할인 방식은 서버 설정값이라(바뀔 수 있다) 서버 값 그대로 알린다.
const POLICY_TEXT: Record<string, string> = {
  ADDITIVE: '할인이 여럿이면 할인율을 더해 한 번에 빼요.',
  SEQUENTIAL: '할인이 여럿이면 앞 할인을 뺀 금액에서 다음 할인을 차례로 빼요.',
  SINGLE: '할인은 하나만 붙어요.',
}

/** 청구를 계산한 방식의 안내. 모르는 값이면 값을 그대로 보인다. */
export function policyText(policy: string): string {
  return POLICY_TEXT[policy] ?? `할인 계산 방식: ${policy}`
}

/**
 * 청구(미리 계산 포함)의 영수증 줄. 반마다 정가 → 할인들 → (반이 여럿이면) 반 청구액이다. 금액은 서버 값 그대로다.
 * 이상한 금액이면 formatWon·formatPercent가 던진다. 경로의 ErrorBoundary가 받는다(라우터 밖에서 쓰면 직접 감싼다).
 */
export function invoiceRows(invoice: Invoice): ReceiptRow[] {
  const rows: ReceiptRow[] = []
  const several = invoice.lines.length > 1
  for (const line of invoice.lines) {
    rows.push({
      label: `${line.className} · ${line.lessonCount}회`,
      value: formatWon(line.listAmount),
      strong: true,
    })
    for (const discount of line.discounts) {
      rows.push({
        label: discountLabel(discount.name, formatPercent(discount.rate)),
        value: formatWon(discount.amount),
        deduct: true,
      })
    }
    // 반이 하나면 합계와 같아 되풀이하지 않는다.
    if (several) rows.push({ label: '이 반 청구액', value: formatWon(line.chargeAmount) })
  }
  return rows
}

/**
 * 금액을 글자로. 바꿀 수 없는 값이면(서버 응답이 이상함) 던지지 않고 null이다.
 * 이미 처리된 것(만든 청구, 기록한 결제)을 보일 때 쓴다. 에러 화면으로 바뀌면 그 화면에만 있는 정보와 처리 칸을 잃는다.
 */
export function wonOrNull(amount: number): string | null {
  try {
    return formatWon(amount)
  } catch (error) {
    console.error('금액을 표시하지 못했어요.', error)
    return null
  }
}

/** 청구 상태의 이름. `ISSUED` 결제 전, `PAID` 결제함, `CANCELED` 취소함 */
export const INVOICE_STATUS_LABELS: Record<string, string> = {
  ISSUED: '결제 전',
  PAID: '결제함',
  CANCELED: '취소함',
}

const INVOICE_STATUS_COLORS: Record<string, string> = {
  ISSUED: 'bg-warn-bg text-warn',
  PAID: 'bg-mint-bg text-pill-valid',
  CANCELED: 'bg-gray-bg text-pill-used',
}

/** 청구 상태 표시(Pill)의 색. 결제 전은 할 일이 남았다는 뜻으로 주의 색이다. 모르는 상태는 회색이다. */
export function invoiceStatusColor(status: string): string {
  return INVOICE_STATUS_COLORS[status] ?? 'bg-gray-bg text-pill-used'
}

/** 결제 상태의 이름. `COMPLETED` 결제함, `CANCELED` 취소함 */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  COMPLETED: '결제함',
  CANCELED: '취소함',
}

/** 결제 상태 표시(Pill)의 색. 취소한 결제는 회색이다(모르는 상태도). */
export function paymentStatusColor(status: string): string {
  return status === 'COMPLETED' ? 'bg-mint-bg text-pill-valid' : 'bg-gray-bg text-pill-used'
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CARD_POS: '포스기 카드',
  CASH: '현금',
}
