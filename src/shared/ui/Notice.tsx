import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { RequestIdLine } from './RequestIdLine'

type NoticeProps = {
  children: ReactNode
  /**
   * `error`는 실패나 막힌 일, `success`는 끝난 일을 알린다.
   * `warning`은 일은 끝났지만 확인이 필요한 것("다른 사람이라면 연결을 끊어 주세요")과 아직 알 수 없는 것을 알린다.
   */
  tone?: 'error' | 'success' | 'warning'
  /**
   * 안내 아래에 "문의할 때 이 번호를 알려 주세요"와 함께 보여줄 요청 번호. 없으면 그 줄을 그리지 않는다.
   * 받은 값은 거르지 않고 그린다. 어떤 오류에 보여줄지는 부르는 쪽이 `supportRequestId`로 정해서 넘긴다.
   */
  requestId?: string | null
  className?: string
}

const tones = {
  // 에러는 하던 말을 끊고 바로 읽어 준다(alert). 끝난 일은 하던 말이 끝난 뒤에 읽어 준다(status).
  error: { role: 'alert', className: 'bg-red-bg text-pill-expired' },
  success: { role: 'status', className: 'bg-mint-bg text-pill-valid' },
  warning: { role: 'status', className: 'bg-warn-bg text-warn' },
} as const

/**
 * 화면 안에 자리를 잡고 보이는 안내 (예: "패스를 찾을 수 없어요", "학생을 등록했어요").
 * 나타나는 순간 화면 낭독기가 읽어준다. 보여줄 내용이 생겼을 때만 그린다.
 */
export function Notice({ children, tone = 'error', requestId, className }: NoticeProps) {
  return (
    <div
      role={tones[tone].role}
      className={cn('rounded-sm px-[18px] py-3.5 font-semibold', tones[tone].className, className)}
    >
      {children}
      <RequestIdLine requestId={requestId} />
    </div>
  )
}
