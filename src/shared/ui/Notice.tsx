import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type NoticeProps = {
  children: ReactNode
  /** `error`는 실패나 막힌 일, `success`는 끝난 일을 알린다. */
  tone?: 'error' | 'success'
  className?: string
}

const tones = {
  // 에러는 하던 말을 끊고 바로 읽어 준다(alert). 끝난 일은 하던 말이 끝난 뒤에 읽어 준다(status).
  error: { role: 'alert', className: 'bg-red-bg text-pill-expired' },
  success: { role: 'status', className: 'bg-mint-bg text-pill-valid' },
} as const

/**
 * 화면 안에 자리를 잡고 보이는 안내 (예: "패스를 찾을 수 없어요", "학생을 등록했어요").
 * 나타나는 순간 화면 낭독기가 읽어준다. 보여줄 내용이 생겼을 때만 그린다.
 */
export function Notice({ children, tone = 'error', className }: NoticeProps) {
  return (
    <div
      role={tones[tone].role}
      className={cn('rounded-sm px-[18px] py-3.5 font-semibold', tones[tone].className, className)}
    >
      {children}
    </div>
  )
}
