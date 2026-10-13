import { Outlet } from 'react-router'
import { NavTabs, type NavTabItem } from '@/shared/ui'

const items: NavTabItem[] = [
  { to: '/admin/settings/classes', label: '반·수강료표' },
  { to: '/admin/settings/discount-types', label: '할인 유형' },
  { to: '/admin/settings/accounts', label: '계정' },
]

/** 설정 화면들의 틀. 위에 설정 안의 메뉴를 두고 아래에 고른 화면을 그린다. */
export function SettingsLayout() {
  return (
    <>
      <NavTabs label="설정 메뉴" items={items} variant="underline" className="mb-8" />
      <Outlet />
    </>
  )
}
