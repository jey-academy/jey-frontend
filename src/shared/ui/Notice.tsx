import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { RequestIdLine } from './RequestIdLine'

type NoticeProps = {
  children: ReactNode
  /**
   * `error`는 실패나 막힌 일, `success`는 끝난 일을 알린다.
   * `warning`은 일은 끝났지만 확인이 필요한 것("다른 사람이라면 연결을 끊어 주세요")과 아직 알 수 없는 것을 알린다.
   * `info`는 화면에 늘 있는 안내다(예: 학부모 패스의 개인정보 고지). 무엇이 일어난 것이 아니라서 화면 낭독기가 끼어들어 읽지 않는다.
   */
  tone?: 'error' | 'success' | 'warning' | 'info'
  /**
   * 안내 아래에 "문의할 때 이 번호를 알려 주세요"와 함께 보여줄 요청 번호. 없으면 그 줄을 그리지 않는다.
   * 받은 값은 거르지 않고 그린다. 어떤 오류에 보여줄지는 부르는 쪽이 `supportRequestId`로 정해서 넘긴다.
   */
  requestId?: string | null
  /**
   * 긴 안내(고지 문구)를 처음에는 세 줄까지만 보이고 "전체 보기"로 펼친다. 세 줄 안에 들어가면 버튼을 두지 않는다.
   * 접혀 있어도 글은 모두 있어 화면 낭독기는 끝까지 읽는다(보이는 줄만 줄인다).
   */
  collapsible?: boolean
  className?: string
}

const tones = {
  // 에러는 하던 말을 끊고 바로 읽어 준다(alert). 끝난 일은 하던 말이 끝난 뒤에 읽어 준다(status).
  error: { role: 'alert', className: 'bg-red-bg font-semibold text-pill-expired' },
  success: { role: 'status', className: 'bg-mint-bg font-semibold text-pill-valid' },
  warning: { role: 'status', className: 'bg-warn-bg font-semibold text-warn' },
  // 긴 글(고지 문구)을 담으므로 보통 굵기의 작은 글자로 쓴다.
  info: { role: undefined, className: 'bg-field text-[14px] text-ink' },
} as const

/**
 * 화면 안에 자리를 잡고 보이는 안내 (예: "패스를 찾을 수 없어요", "학생을 등록했어요").
 * error·success·warning은 나타나는 순간 화면 낭독기가 읽어준다. 보여줄 내용이 생겼을 때만 그린다.
 * info는 처음부터 화면에 있는 안내라 읽기 순서대로만 읽힌다.
 */
export function Notice({
  children,
  tone = 'error',
  requestId,
  collapsible = false,
  className,
}: NoticeProps) {
  return (
    <div
      role={tones[tone].role}
      className={cn('rounded-sm px-[18px] py-3.5', tones[tone].className, className)}
    >
      {collapsible ? <CollapsibleText>{children}</CollapsibleText> : children}
      <RequestIdLine requestId={requestId} />
    </div>
  )
}

function CollapsibleText({ children }: { children: ReactNode }) {
  const textId = useId()
  const textRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  // 세 줄을 넘는지. 접힌 모습에서 잘린 부분이 있는지로 잰다. 그리기 전에 재서 버튼이 깜빡이지 않게 한다.
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    const text = textRef.current
    if (!text || expanded) return
    setOverflowing(text.scrollHeight > text.clientHeight)
  }, [children, expanded])

  return (
    <>
      <div id={textId} ref={textRef} className={cn(!expanded && 'line-clamp-3')}>
        {children}
      </div>
      {(overflowing || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={() => setExpanded((open) => !open)}
          // ::after로 터치 영역을 44px 높이로 넓힌다(글자 버튼이라 보이는 높이는 한 줄이다).
          className="relative mt-2 rounded-btn-sm text-[14px] font-semibold after:absolute after:-inset-x-2 after:-inset-y-[11px] after:content-[''] text-sub hover:text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {expanded ? '접기' : '전체 보기'}
        </button>
      )}
    </>
  )
}
