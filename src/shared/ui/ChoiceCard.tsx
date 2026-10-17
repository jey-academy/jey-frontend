import { useId, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { cn } from '@/shared/lib/cn'

type ChoiceCardProps = Omit<LinkProps, 'children' | 'title'> & {
  /** 카드 제목. 링크의 이름으로 읽힌다. */
  title: string
  /** 제목 아래 한 줄 설명 */
  description: string
  /** 왼쪽 네모 칸에 넣는 아이콘(장식, aria-hidden으로 넘긴다) */
  icon: ReactNode
  /** 아이콘 칸 색. `glow`는 학부모 쪽, `night`는 직원 쪽 */
  tone?: 'glow' | 'night'
}

const iconTones = {
  glow: 'bg-glow-soft text-glow-soft-ink',
  night: 'bg-night-soft text-night',
} as const

/** 메인 화면의 큰 선택 카드. 누르면 그 화면으로 간다. */
export function ChoiceCard({
  title,
  description,
  icon,
  tone = 'night',
  className,
  ...props
}: ChoiceCardProps) {
  // 링크 이름은 제목만, 설명은 따로 읽힌다(이름이 길어지지 않게).
  const titleId = useId()
  const descriptionId = useId()

  return (
    <Link
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={cn(
        'grid grid-cols-[56px_1fr_24px] items-center gap-[18px] rounded-lg border-[1.5px] border-transparent bg-card px-6 py-[26px] text-ink',
        'transition-[border-color,box-shadow,translate] duration-150 hover:border-night hover:shadow-float motion-safe:hover:-translate-y-0.5',
        'max-[560px]:grid-cols-[52px_1fr_20px] max-[560px]:gap-3.5 max-[560px]:px-[18px] max-[560px]:py-5',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'grid size-14 place-items-center rounded-md max-[560px]:size-[52px]',
          iconTones[tone],
        )}
      >
        {icon}
      </span>
      <span>
        <b id={titleId} className="block text-[20px] tracking-[-0.03em] max-[560px]:text-[19px]">
          {title}
        </b>
        <span
          id={descriptionId}
          className="mt-0.5 block text-[15px] text-sub max-[560px]:text-[14px]"
        >
          {description}
        </span>
      </span>
      <svg
        aria-hidden="true"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-placeholder"
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
    </Link>
  )
}
