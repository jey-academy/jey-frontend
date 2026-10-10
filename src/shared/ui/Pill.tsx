import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import type { PassStatus } from './passStatus'

type PillProps = {
  status: PassStatus
  /** 생략하면 상태별 기본 문구를 쓴다. */
  children?: ReactNode
  className?: string
}

const styles: Record<PassStatus, string> = {
  valid: 'bg-mint-bg text-pill-valid',
  used: 'bg-gray-bg text-pill-used',
  expired: 'bg-red-bg text-pill-expired',
}

const labels: Record<PassStatus, string> = {
  valid: '사용 가능',
  used: '사용 완료',
  expired: '기간 만료',
}

export function Pill({ status, children, className }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-[11px] py-[5px] text-[13px] font-bold whitespace-nowrap',
        "before:size-[7px] before:rounded-full before:bg-current before:content-['']",
        styles[status],
        className,
      )}
    >
      {children ?? labels[status]}
    </span>
  )
}
