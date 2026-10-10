import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type NoticeProps = {
  children: ReactNode
  className?: string
}

/**
 * 화면 안에 자리를 잡고 보이는 에러 안내 (예: "패스를 찾을 수 없어요").
 * 나타나는 순간 화면 낭독기가 읽어준다. 보여줄 내용이 생겼을 때만 그린다.
 */
export function Notice({ children, className }: NoticeProps) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-sm bg-red-bg px-[18px] py-3.5 font-semibold text-pill-expired',
        className,
      )}
    >
      {children}
    </div>
  )
}
