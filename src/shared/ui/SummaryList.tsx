import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export type SummaryItem = {
  label: ReactNode
  value: ReactNode
  /** 합계처럼 강조할 줄. 값을 크고 굵게 보인다. */
  strong?: boolean
}

type SummaryListProps = {
  items: SummaryItem[]
  /**
   * 상자 없이 작은 글자로 보인다(다른 카드 안의 짧은 요약). 기본은 회색 상자다
   * (완료 화면·확인 창의 요약: 학생, 패스, 처리 시각, 금액 등).
   */
  plain?: boolean
  className?: string
}

/**
 * 이름표와 값을 한 줄씩, 이름표는 왼쪽 흐리게·값은 오른쪽 굵게 보이는 요약(`dl`).
 * 넓은 화면에서 두 열로 나누는 학생 정보 같은 목록은 `DescriptionList`를 쓴다.
 * 값은 쓰는 쪽이 글자로 바꿔 넘긴다(금액은 서버 값을 formatWon으로).
 */
export function SummaryList({ items, plain = false, className }: SummaryListProps) {
  return (
    <dl
      className={cn(
        plain
          ? 'grid gap-1.5 text-[14px]'
          : 'grid gap-2.5 rounded-md bg-field px-[18px] py-4 text-left text-[15px]',
        className,
      )}
    >
      {items.map((item, index) => (
        // 이름표가 글자가 아닐 수 있어(할인율이 든 이름표 등) 차례로 구분한다. 줄은 늘 같은 차례로 그린다.
        <div key={index} className="flex justify-between gap-3">
          <dt className="text-sub">{item.label}</dt>
          <dd
            className={cn(
              'text-right tabular-nums',
              item.strong ? 'text-[17px] font-extrabold' : 'font-semibold',
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
