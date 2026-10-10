import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { LogoMark } from './Logo'

type EmptyStateProps = {
  title: string
  description?: ReactNode
  /** 화면 전체를 대신할 때는 1(h1), 화면 안의 한 영역일 때는 2(h2) */
  headingLevel?: 1 | 2
  /** 버튼 등 다음에 할 수 있는 일 */
  children?: ReactNode
  className?: string
}

/** 보여줄 내용이 없을 때의 안내: 마크 + 제목 + 설명 + 다음에 할 수 있는 일. */
export function EmptyState({
  title,
  description,
  headingLevel = 2,
  children,
  className,
}: EmptyStateProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'

  return (
    <section className={cn('px-3 py-24 text-center text-sub max-[560px]:py-16', className)}>
      <LogoMark size={40} className="mx-auto mb-4 text-night" />
      <Heading className="text-[22px] font-bold tracking-[-0.03em] text-ink">{title}</Heading>
      {description && <p className="mx-auto mt-1.5 max-w-[26em]">{description}</p>}
      {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
    </section>
  )
}
