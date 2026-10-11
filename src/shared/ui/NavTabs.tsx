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
  /**
   * 모양. `pill`은 회색 바탕 위의 알약 모양(상단 바의 큰 메뉴), `underline`은 밑줄 모양(화면 안의 작은 메뉴).
   * 한 화면에 메뉴가 둘이면 서로 다른 모양을 써서 위아래 관계가 보이게 한다.
   */
  variant?: 'pill' | 'underline'
  className?: string
}

const navStyles = {
  pill: 'flex gap-1 rounded-sm bg-field p-1',
  underline: 'flex gap-7 border-b border-line',
}

const tabStyles = {
  pill: {
    // 보이는 높이는 38px이고, ::after로 위아래 3px씩 넓혀 터치 영역 44px을 맞춘다.
    base: cn(
      'relative grid h-[38px] place-items-center rounded-[9px] px-4 font-semibold whitespace-nowrap no-underline',
      "after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-['']",
      'max-[560px]:px-2.5 max-[560px]:text-[14px]',
    ),
    active: 'bg-white text-night shadow-tab',
    inactive: 'text-sub hover:text-ink',
  },
  underline: {
    // 탭의 아래 테두리를 메뉴의 밑줄과 겹쳐, 지금 화면의 탭만 밑줄이 진하게 보이게 한다.
    base: '-mb-px grid h-11 place-items-center border-b-2 font-semibold whitespace-nowrap no-underline',
    active: 'border-night text-night',
    inactive: 'border-transparent text-sub hover:text-ink',
  },
}

/**
 * 화면을 오가는 탭 메뉴. 탭마다 주소가 있어서 링크로 만든다.
 * 지금 보고 있는 화면의 탭은 `aria-current="page"`가 붙고 눈에 띄게 표시된다.
 */
export function NavTabs({ label, items, variant = 'pill', className }: NavTabsProps) {
  const styles = tabStyles[variant]

  return (
    <nav aria-label={label} className={cn(navStyles[variant], className)}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => cn(styles.base, isActive ? styles.active : styles.inactive)}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
