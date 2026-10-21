import { useId, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export type ReceiptRow = {
  label: ReactNode
  /** 서버가 계산한 금액을 표시용으로 바꾼 값(`299,250원`). 이 부품은 계산하지 않는다. */
  value: string
  /** 할인처럼 빼는 항목. 값을 빨간 글자로, 앞에 −를 붙인다. */
  deduct?: boolean
  /** 한 묶음(반)의 소계처럼 위 항목들을 받는 줄. 굵게 보인다. */
  strong?: boolean
}

type ReceiptProps = {
  /** 카드 제목. 기본은 "결제 금액" */
  title?: string
  /** 항목들. 비었으면 `empty`를 보여 준다. */
  rows: ReceiptRow[]
  /** 합계. 없으면 합계 칸을 그리지 않는다. */
  total?: { label: string; value: string } | null
  /** 항목이 없을 때의 안내(예: "반과 횟수를 고르면 금액이 보여요.") */
  empty?: ReactNode
  /** 합계 아래에 붙일 것(계산 방식 안내, 오류 등) */
  children?: ReactNode
  /** 금액을 새로 받는 중. 화면 읽기 프로그램에 알리고, 낡은 금액을 흐리게 한다. */
  busy?: boolean
  className?: string
}

/**
 * 결제 금액 영수증(DESIGN.md "Receipt", P4 수납). 금액은 서버가 계산한 값만 보여 준다.
 * 금액이 바뀌면 화면 읽기 프로그램이 합계를 다시 읽는다(aria-live).
 */
export function Receipt({
  title = '결제 금액',
  rows,
  total,
  empty,
  children,
  busy = false,
  className,
}: ReceiptProps) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      aria-busy={busy}
      className={cn('rounded-lg bg-card p-[22px]', className)}
    >
      <h2 id={titleId} className="mb-3.5 text-[16px] font-bold text-ink">
        {title}
      </h2>
      <div className={cn('transition-opacity', busy && 'opacity-50')}>
        {rows.length === 0 ? (
          <p className="text-[15px] text-sub">{empty}</p>
        ) : (
          <dl className="text-[15px]">
            {rows.map((row, index) => (
              <div key={index} className="flex justify-between gap-3 py-1.5">
                <dt className={row.strong ? 'font-semibold text-ink' : 'text-sub'}>{row.label}</dt>
                <dd
                  className={cn(
                    'shrink-0 text-right font-semibold tabular-nums',
                    row.deduct ? 'text-red-ink' : 'text-ink',
                  )}
                >
                  {row.deduct ? `−${row.value}` : row.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {total && (
          <div aria-live="polite" className="mt-2 border-t-[1.5px] border-dashed border-line pt-4">
            <p className="text-[14px] text-sub">{total.label}</p>
            <p className="text-[34px] leading-tight font-extrabold tracking-[-0.03em] text-ink tabular-nums">
              {total.value}
            </p>
          </div>
        )}
      </div>
      {children}
    </section>
  )
}
