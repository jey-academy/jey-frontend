import { formatPercent, formatWon } from '@/shared/lib'
import type { ReceiptRow } from '@/shared/ui'
import type { Invoice, PaymentMethod } from './api'
import { discountLabel } from './invoiceInput'

// 응답의 discountPolicy. 중복 할인 방식은 원장님 확인 전 설정값이라 서버 값을 그대로 알린다.
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
 * 이상한 금액이면 formatWon·formatPercent가 던진다(쓰는 화면은 에러 화면으로 감싸져 있다).
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

/** 청구 상태의 이름. `ISSUED` 결제 전, `PAID` 결제함, `CANCELED` 취소함 */
export const INVOICE_STATUS_LABELS: Record<string, string> = {
  ISSUED: '결제 전',
  PAID: '결제함',
  CANCELED: '취소함',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CARD_POS: '포스기 카드',
  CASH: '현금',
}
