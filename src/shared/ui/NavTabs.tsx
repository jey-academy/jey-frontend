import { NavLink } from 'react-router'
import { cn } from '@/shared/lib/cn'

export type NavTabItem = {
  /** 이동할 주소 */
  to: string
  label: string
  /** 주소가 정확히 같을 때만 선택된 것으로 본다. `/passes`와 `/passes/new`처럼 겹치는 주소에 쓴다. */
  end?: boolean
}

type NavTabsProps = {
  /** 스크린 리더가 읽는 메뉴 이름 */
  label: string
  items: NavTabItem[]
  className?: string
}

/**
 * 화면을 오가는 탭 메뉴. 탭마다 주소가 있어서 링크로 만든다.
 * 지금 보고 있는 화면의 탭은 `aria-current="page"`가 붙고 흰 배경으로 표시된다.
 */
export function NavTabs({ label, items, className }: NavTabsProps) {
  return (
    <nav aria-label={label} className={cn('flex gap-1 rounded-sm bg-field p-1', className)}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              // 보이는 높이는 38px이고, ::after로 위아래 3px씩 넓혀 터치 영역 44px을 맞춘다.
              'relative grid h-[38px] place-items-center rounded-[9px] px-4 font-semibold whitespace-nowrap no-underline',
              "after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-['']",
              'max-[560px]:px-2.5 max-[560px]:text-[14px]',
              isActive ? 'bg-white text-night shadow-tab' : 'text-sub hover:text-ink',
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
