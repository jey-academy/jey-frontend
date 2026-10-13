import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type TableProps = {
  /** 표가 무엇의 목록인지. 화면에는 보이지 않고 스크린 리더가 읽는다. */
  caption: string
  /** `<thead>`와 `<tbody>`. 칸은 `Th`, `Td`로 만든다. */
  children: ReactNode
  /** 열이 많은 표. 칸이 눌리지 않게 최소 폭을 더 넓게 잡는다. */
  wide?: boolean
  /**
   * 보여주는 목록을 다시 받는 중인지. 켜면 받는 동안 표를 흐리게 해서 아직 바뀌지 않았음을 알리고,
   * 화면 낭독기에도 바쁘다고 알린다(aria-busy). 금방 끝나는 다시 받기(0.5초 안)에서는 흐려지지 않는다.
   */
  refreshing?: boolean
  className?: string
}

/**
 * 목록을 보여주는 표. 흰 카드 위에 줄마다 가는 선으로만 나눈다.
 * 화면이 좁으면 표 안에서 가로로 스크롤된다. 칸이 눌려 글자가 줄바꿈되지 않게 최소 폭을 둔다.
 */
export function Table({
  caption,
  children,
  wide = false,
  refreshing = false,
  className,
}: TableProps) {
  return (
    // relative: 표 안의 숨긴 글자(sr-only, 버튼만 있는 열의 머리글 등)는 absolute다. 기준을 이 묶음에 두지 않으면
    // 가로 스크롤에 잘리지 않고 밖으로 나가, 좁은 화면에서 페이지 전체가 가로로 넓어진다.
    <div
      aria-busy={refreshing || undefined}
      className={cn(
        'relative overflow-x-auto rounded-lg bg-card',
        // 흐려지기까지 0.5초를 둔다(delay). 평소의 빠른 다시 받기에서 표가 깜빡이지 않는다.
        // 끝나면 이 클래스들이 빠져 바로 또렷해진다.
        refreshing && 'opacity-60 transition-opacity delay-500',
        className,
      )}
    >
      <table
        className={cn(
          'w-full border-collapse text-left',
          wide ? 'min-w-[880px]' : 'min-w-[640px]',
          '[&_tbody_tr]:border-t [&_tbody_tr]:border-line',
          '[&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-field',
        )}
      >
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  )
}

type CellProps = {
  /** 금액·개수 같은 숫자 칸. 오른쪽으로 붙이고 자릿수가 세로로 맞게 고정폭 숫자를 쓴다. */
  numeric?: boolean
}

/** 머리 칸. */
export function Th({ numeric = false, className, ...props }: ComponentProps<'th'> & CellProps) {
  return (
    <th
      scope="col"
      className={cn(
        'px-5 pt-4 pb-3 text-[13px] font-semibold whitespace-nowrap text-sub first:pl-[22px] last:pr-[22px]',
        numeric && 'text-right',
        className,
      )}
      {...props}
    />
  )
}

/** 내용 칸. */
export function Td({ numeric = false, className, ...props }: ComponentProps<'td'> & CellProps) {
  return (
    <td
      className={cn(
        'px-5 py-4 whitespace-nowrap first:pl-[22px] last:pr-[22px]',
        numeric && 'text-right font-semibold tabular-nums',
        className,
      )}
      {...props}
    />
  )
}
