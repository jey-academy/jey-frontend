import { Outlet } from 'react-router'
import { NavTabs, type NavTabItem } from '@/shared/ui'

const items: NavTabItem[] = [
  { to: '/admin/ledger-sync', label: '수납', end: true },
  { to: '/admin/ledger-sync/partners', label: '연계 학원' },
]

/**
 * 관리자 "장부" 탭의 틀. 위에 장부 안의 메뉴(수납 장부, 연계 학원 장부)를 두고 아래에 고른 화면을 그린다.
 * 두 화면은 다른 기능 폴더(billing, dongtanpass)에 있어 여기(app)서 묶는다(설정 메뉴와 같은 모양).
 */
export function LedgerLayout() {
  return (
    <>
      <NavTabs label="장부 메뉴" items={items} variant="underline" className="mb-8" />
      <Outlet />
    </>
  )
}
