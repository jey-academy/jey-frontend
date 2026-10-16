import { useId, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type SheetProps = {
  /** 묶음의 제목 (예: "발급 정보"). 화면 낭독기는 이 제목으로 묶음을 부른다. */
  title: string
  children: ReactNode
  className?: string
}

/**
 * 학부모 화면의 작은 흰 카드(예: 패스 아래의 "이렇게 사용해요", "발급 정보").
 * 관리 화면의 `Card`보다 작은 모서리·여백·제목을 쓴다. 바로 위 요소와 12px 띄운다.
 */
export function Sheet({ title, children, className }: SheetProps) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className={cn('mt-3 rounded-md bg-card px-[18px] py-5', className)}
    >
      <h2 id={titleId} className="mb-3.5 text-[17px] font-bold tracking-[-0.02em]">
        {title}
      </h2>
      {children}
    </section>
  )
}
