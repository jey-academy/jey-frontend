import { useId, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export type ReceiptRow = {
  label: ReactNode
  /** 서버가 계산한 금액을 표시용으로 바꾼 값(`299,250원`). 이 부품은 계산하지 않는다. */
  value: string
  /** 할인처럼 빼는 항목. 값을 빨간 글자로, 앞에 −를 붙인다. */
  deduct?: boolean
  /** 반 이름과 정가처럼 한 묶음을 시작하는 줄. 이름을 굵게 보인다. */
  strong?: boolean
}

type ReceiptProps = {
  /** 카드 제목. 기본은 "결제 금액" */
  title?: string
  /** 항목들. 비었으면 `empty`를 보여 준다. */
  rows: ReceiptRow[]
  /** 합계. 없으면 합계 칸을 비워 둔다. */
  total?: { label: string; value: string } | null
  /** 항목이 없을 때의 안내. 없으면 아무것도 보이지 않는다. */
  empty?: ReactNode
  /** 합계 아래에 붙일 것(계산 방식 안내, 오류 등) */
  children?: ReactNode
  className?: string
}

/**
 * 결제 금액 영수증(DESIGN.md "Receipt", P4 수납). 금액은 서버가 계산한 값만 보여 준다.
 * 합계 칸의 틀(aria-live)은 늘 그려 둔다. 틀이 먼저 있어야, 합계가 나타나거나 바뀔 때 화면 읽기 프로그램이 읽는다.
 * 차감 금액 글자는 `red` 대신 `red-ink`다(`red`는 흰 바탕에서 글자 대비가 모자란다).
 */
export function Receipt({
  title = '결제 금액',
  rows,
  total,
  empty,
  children,
  className,
}: ReceiptProps) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={cn('rounded-lg bg-card p-[22px]', className)}>
      <h2 id={titleId} className="mb-3.5 text-[16px] font-bold text-ink">
        {title}
      </h2>
      {rows.length === 0 ? (
        empty && <div className="text-[15px] text-sub">{empty}</div>
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
      <div aria-live="polite">
        {total && (
          <div className="mt-2 border-t-[1.5px] border-dashed border-line pt-4">
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
