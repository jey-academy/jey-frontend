import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type DescriptionListProps = {
  /** 이름표와 값의 쌍. 값이 없을 때 무엇을 보여줄지는 쓰는 쪽이 정한다(예: "-"). */
  items: { label: string; value: ReactNode }[]
  className?: string
}

/** 이름표와 값을 나란히 보여주는 목록 (예: 학년 · 중1). 넓은 화면에서는 두 줄로 나눈다. */
export function DescriptionList({ items, className }: DescriptionListProps) {
  return (
    <dl className={cn('grid gap-x-8 gap-y-3.5 sm:grid-cols-2', className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-3">
          <dt className="w-[76px] shrink-0 text-[14px] text-sub">{item.label}</dt>
          <dd className="min-w-0 font-semibold break-words text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
