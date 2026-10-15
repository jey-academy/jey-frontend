import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import type { PassStatus } from './passStatus'

type StatusBannerProps = {
  status: PassStatus
  /** 생략하면 상태별 기본 문구를 쓴다. */
  title?: string
  /** 제목 아래 한 줄 (예: "2026.11.05까지 사용 가능"). 꼭 읽어야 하는 정보라 본문 색으로 쓴다. */
  description?: ReactNode
  className?: string
}

const styles: Record<PassStatus, { banner: string; icon: string }> = {
  valid: { banner: 'bg-mint-bg', icon: 'bg-mint' },
  used: { banner: 'bg-gray-bg', icon: 'bg-gray' },
  expired: { banner: 'bg-red-bg', icon: 'bg-red' },
  canceled: { banner: 'bg-gray-bg', icon: 'bg-gray' },
}

const titles: Record<PassStatus, string> = {
  valid: '사용할 수 있는 패스예요',
  used: '이미 사용한 패스예요',
  expired: '사용 기한이 지난 패스예요',
  canceled: '발급이 취소된 패스예요',
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
  // 사용 완료와 색이 같아서 아이콘 모양(×)으로도 구분한다.
  canceled: (
    <svg width="22" height="22" strokeWidth="2.4" {...strokeProps}>
      <path d="M7 7l10 10M17 7 7 17" />
    </svg>
  ),
}

/**
 * 패스 확인 결과. 색 띠, 아이콘, 문구로 상태를 구분한다(색만으로 구분하지 않는다).
 * role="status"라서 내용이 바뀌면 화면 낭독기가 읽어준다. 처음부터 내용이 든 채로 나타나면
 * 읽지 않는 낭독기도 있으므로, 쓰는 화면에서 결과 영역을 미리 그려 두고 내용만 바꾸는 편이 안전하다.
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
        {description && <span className="text-[14px] text-ink tabular-nums">{description}</span>}
      </div>
    </div>
  )
}
