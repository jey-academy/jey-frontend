import { NavLink, Outlet } from 'react-router'
import { cn } from '@/shared/lib'

const items = [
  { to: '/admin/settings/classes', label: '반·수강료표' },
  { to: '/admin/settings/discount-types', label: '할인 유형' },
]

/** 설정 화면들의 틀. 위에 설정 안의 메뉴를 두고 아래에 고른 화면을 그린다. */
export function SettingsLayout() {
  return (
    <>
      <nav aria-label="설정 메뉴" className="mb-8 flex gap-7 border-b border-line">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                // 아래 테두리를 메뉴의 밑줄과 겹쳐, 지금 화면의 항목만 밑줄이 진하게 보이게 한다.
                '-mb-px grid h-11 place-items-center border-b-2 font-semibold whitespace-nowrap no-underline',
                isActive ? 'border-night text-night' : 'border-transparent text-sub hover:text-ink',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}
