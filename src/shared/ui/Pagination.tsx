import { cn } from '@/shared/lib/cn'
import { Button } from './Button'

type PaginationProps = {
  /** 지금 페이지. 서버와 같이 0부터 센다. 화면에는 1부터로 보여준다. */
  page: number
  totalPages: number
  onChange: (page: number) => void
  /** 다음 페이지를 받는 중처럼 잠깐 누르지 못하게 할 때 */
  disabled?: boolean
  className?: string
}

/** 목록의 페이지 넘기기. 페이지가 하나뿐이면 아무것도 그리지 않는다. */
export function Pagination({
  page,
  totalPages,
  onChange,
  disabled = false,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <nav aria-label="페이지" className={cn('flex items-center justify-center gap-3', className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(page - 1)}
        disabled={disabled || page <= 0}
      >
        이전
      </Button>
      <span className="min-w-[4.5em] text-center text-[14px] font-semibold tabular-nums">
        {/* 화면 낭독기가 "2 슬래시 5"로 읽지 않게 문장으로도 알려 준다. */}
        <span className="sr-only">{`전체 ${totalPages}페이지 중 ${page + 1}페이지`}</span>
        <span aria-hidden="true">{`${page + 1} / ${totalPages}`}</span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(page + 1)}
        disabled={disabled || page >= totalPages - 1}
      >
        다음
      </Button>
    </nav>
  )
}
