import { BILLING_PATH, PAYMENTS_PATH } from '@/shared/paths'
import { NavTabs, type NavTabItem } from '@/shared/ui'

const items: NavTabItem[] = [
  { to: BILLING_PATH, label: '청구', end: true },
  { to: PAYMENTS_PATH, label: '결제' },
]

/** 수납 안의 메뉴. 그 달 청구 목록과 결제 목록을 오간다(JEY 패스 메뉴와 같은 모양). */
export function BillingTabs() {
  return <NavTabs label="수납 메뉴" items={items} variant="underline" className="mt-6" />
}
