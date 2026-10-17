import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/** 진행 중인 일의 단계 상태. 주지 않으면 사용 안내처럼 번호만 매긴다. */
export type StepState = 'done' | 'current' | 'todo' | 'failed'

type StepsProps = {
  /** 순서대로 보여줄 단계. 제목은 서로 달라야 한다. */
  items: {
    title: string
    description?: string
    state?: StepState
    /** 제목 아래에 더 보여 줄 것(확인 결과 등) */
    detail?: ReactNode
  }[]
  className?: string
}

// 원 모양(색과 안의 글자)과 화면 읽기 프로그램이 읽을 상태 이름.
const STATE_STYLES: Record<StepState, { circle: string; title: string; label: string }> = {
  done: { circle: 'bg-mint text-white', title: 'text-ink', label: '끝남' },
  current: { circle: 'bg-night text-white', title: 'text-ink', label: '지금 단계' },
  todo: { circle: 'bg-gray-bg text-sub', title: 'text-sub', label: '남음' },
  failed: { circle: 'bg-red text-white', title: 'text-ink', label: '확인 필요' },
}

/**
 * 번호를 매긴 단계 목록. 상태 없이 쓰면 사용 안내(예: 학부모 패스의 "이렇게 사용해요"),
 * 단계마다 `state`를 주면 진행 상황(예: 데스크의 처리 순서)이다.
 */
export function Steps({ items, className }: StepsProps) {
  return (
    <ol className={cn('grid gap-3.5', className)}>
      {items.map((item, index) => {
        const style = item.state ? STATE_STYLES[item.state] : null
        return (
          <li
            key={item.title}
            aria-current={item.state === 'current' ? 'step' : undefined}
            className="grid grid-cols-[28px_1fr] items-start gap-3 text-[15px]"
          >
            {/* 목록(ol)이 몇 번째인지 이미 알려 주므로 원은 장식이다. 상태는 제목 뒤에 글로 둔다. */}
            <span
              aria-hidden="true"
              className={cn(
                'grid size-7 place-items-center rounded-full text-[13px] font-bold',
                style?.circle ?? 'bg-night text-white',
              )}
            >
              {item.state === 'done' ? <CheckIcon /> : item.state === 'failed' ? '!' : index + 1}
            </span>
            <div className="min-w-0">
              <b className={cn('block font-semibold', style?.title)}>
                {item.title}
                {style && <span className="sr-only">{` (${style.label})`}</span>}
              </b>
              {item.description && <span className="text-[14px] text-sub">{item.description}</span>}
              {item.detail}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
    >
      <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
