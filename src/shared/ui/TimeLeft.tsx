import { cn } from '@/shared/lib/cn'

type TimeLeftProps = {
  /** 서버가 준 남은 일수 */
  daysLeft: number
  /** 막대를 꽉 채우는 기준 일수(패스 전체 기간) */
  totalDays: number
  className?: string
}

/** 이 일수 이하로 남으면 막대를 빨갛게 칠한다. */
const URGENT_DAYS = 7

/** 패스의 남은 기간 막대. 사용 가능한 패스에만 쓴다. */
export function TimeLeft({ daysLeft, totalDays, className }: TimeLeftProps) {
  const days = Math.max(0, daysLeft)
  const ratio = totalDays > 0 ? Math.min(1, days / totalDays) : 0

  return (
    <div className={cn('rounded-md bg-card px-[18px] py-4', className)}>
      <div className="flex justify-between text-[14px] text-sub">
        <span>남은 기간</span>
        <b className="text-[15px] text-ink tabular-nums">{days}일</b>
      </div>
      {/* 남은 일수는 위 글자로 읽히므로 막대는 장식이다. */}
      <div aria-hidden="true" className="mt-2.5 h-2 overflow-hidden rounded-full bg-gray-bg">
        <i
          className={cn('block h-full rounded-full', days <= URGENT_DAYS ? 'bg-red' : 'bg-night')}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </div>
  )
}
