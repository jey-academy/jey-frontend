import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type PassStatus = 'valid' | 'used' | 'expired'

type StatusBannerProps = {
  status: PassStatus
  /** 생략하면 상태별 기본 문구를 쓴다. */
  title?: string
  /** 제목 아래 한 줄 (예: "2026.11.05까지 사용 가능") */
  description?: ReactNode
  className?: string
}

const styles: Record<PassStatus, { banner: string; icon: string }> = {
  valid: { banner: 'bg-mint-bg', icon: 'bg-mint' },
  used: { banner: 'bg-gray-bg', icon: 'bg-gray' },
  expired: { banner: 'bg-red-bg', icon: 'bg-red' },
}

const titles: Record<PassStatus, string> = {
  valid: '사용할 수 있는 패스예요',
  used: '이미 사용한 패스예요',
  expired: '사용 기한이 지난 패스예요',
}

const strokeProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  'aria-hidden': true,
} as const

const icons: Record<PassStatus, ReactNode> = {
  valid: (
    <svg width="24" height="24" strokeWidth="2.6" strokeLinejoin="round" {...strokeProps}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  ),
  used: (
    <svg width="22" height="22" strokeWidth="2.4" {...strokeProps}>
      <path d="M6 12h12" />
    </svg>
  ),
  expired: (
    <svg width="22" height="22" strokeWidth="2.4" {...strokeProps}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 2" />
    </svg>
  ),
}

/**
 * 패스 확인 결과. 색 띠, 아이콘, 문구로 상태를 구분한다(색만으로 구분하지 않는다).
 * 나타나는 순간 화면 낭독기가 읽어준다.
 */
export function StatusBanner({ status, title, description, className }: StatusBannerProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-3.5 px-[22px] py-[18px]',
        styles[status].banner,
        className,
      )}
    >
      <div
        className={cn(
          'grid size-11 flex-none place-items-center rounded-btn text-white',
          styles[status].icon,
        )}
      >
        {icons[status]}
      </div>
      <div className="min-w-0">
        <b className="block text-[18px]">{title ?? titles[status]}</b>
        {description && <span className="text-[14px] text-sub tabular-nums">{description}</span>}
      </div>
    </div>
  )
}
