import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

// 표가 좁은 화면에서 줄을 쌓는지. 칸(Td)마다 props로 넘기지 않고 Table이 한 번 알려 준다.
const StackContext = createContext(false)

type TableProps = {
  /** 표가 무엇의 목록인지. 화면에는 보이지 않고 스크린 리더가 읽는다. */
  caption: string
  /** `<thead>`와 `<tbody>`. 칸은 `Th`, `Td`로 만든다. */
  children: ReactNode
  /** 열이 많은 표. 칸이 눌리지 않게 최소 폭을 더 넓게 잡는다. */
  wide?: boolean
  /**
   * 좁은 화면(560px 미만, 상단 바가 접히는 폭과 같다)에서 가로로 스크롤하지 않고 줄마다 카드처럼 쌓는다. 머리 줄은 숨기고,
   * 칸마다 `Td`의 `label`을 이름표로 앞에 붙인다. 이름표도 `actions`도 없는 칸은 카드의 제목 모양이 되므로 첫 칸에만 쓴다.
   * `actions` 칸은 맨 아래 버튼 줄이 된다.
   */
  stack?: boolean
  /**
   * 보여주는 목록을 다시 받는 중인지. 켜면 받는 동안 표를 흐리게 해서 아직 바뀌지 않았음을 알리고,
   * 화면 낭독기에도 바쁘다고 알린다(aria-busy). 금방 끝나는 다시 받기(0.5초 안)에서는 흐려지지 않는다.
   */
  refreshing?: boolean
  className?: string
}

/**
 * 목록을 보여주는 표. 흰 카드 위에 줄마다 가는 선으로만 나눈다.
 * 화면이 좁으면 표 안에서 가로로 스크롤된다(`stack`이면 줄을 쌓는다). 칸이 눌려 글자가 줄바꿈되지 않게 최소 폭을 둔다.
 */
export function Table({
  caption,
  children,
  wide = false,
  stack = false,
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
          // 쌓을 때: 표·본문·줄을 블록으로 바꿔 세로로 늘어놓는다. 머리 줄 대신 칸마다 이름표가 붙는다.
          stack &&
            'max-[560px]:block max-[560px]:min-w-0 max-[560px]:[&_thead]:hidden ' +
              'max-[560px]:[&_tbody]:block max-[560px]:[&_tbody_tr]:block ' +
              'max-[560px]:[&_tbody_tr]:px-[18px] max-[560px]:[&_tbody_tr]:py-3.5 ' +
              'max-[560px]:[&_tbody_tr:first-child]:border-t-0',
        )}
      >
        <caption className="sr-only">{caption}</caption>
        <StackContext.Provider value={stack}>{children}</StackContext.Provider>
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

type TdProps = ComponentProps<'td'> &
  CellProps & {
    /**
     * 줄을 쌓는 표(`Table`의 `stack`)에서 칸 앞에 붙는 이름표. 보통 그 열의 머리 글자와 같게 쓴다.
     * 글자가 아니라 CSS(::before)로 그려 칸의 글자(textContent)는 그대로다. 넓은 화면에서는 그리지 않는다.
     */
    label?: string
    /** 버튼만 있는 칸. 버튼을 한 줄로 오른쪽에 붙이고, 줄을 쌓을 때는 카드 맨 아래 왼쪽에 둔다. */
    actions?: boolean
  }

/** 내용 칸. */
export function Td({
  numeric = false,
  label,
  actions = false,
  className,
  children,
  ...props
}: TdProps) {
  const stack = useContext(StackContext)
  return (
    <td
      data-label={stack ? label : undefined}
      className={cn(
        'px-5 py-4 whitespace-nowrap first:pl-[22px] last:pr-[22px]',
        numeric && 'text-right font-semibold tabular-nums',
        stack &&
          'max-[560px]:block max-[560px]:px-0 max-[560px]:py-0.5 max-[560px]:text-left max-[560px]:whitespace-normal ' +
            // first:·last:가 붙은 넓은 화면의 여백이 더 강하다(:first-child). 같은 꼴로 덮는다.
            'max-[560px]:first:pl-0 max-[560px]:last:pr-0',
        // 이름표: 왼쪽 88px 칸에 두고 값은 그 오른쪽에서 줄바꿈된다.
        stack &&
          label &&
          'max-[560px]:relative max-[560px]:pl-[100px] max-[560px]:first:pl-[100px] ' +
            'max-[560px]:before:absolute max-[560px]:before:top-[5px] max-[560px]:before:left-0 max-[560px]:before:w-[88px] ' +
            'max-[560px]:before:text-[13px] max-[560px]:before:font-normal max-[560px]:before:text-sub ' +
            'max-[560px]:before:content-[attr(data-label)]',
        // 제목 칸(이름표 없는 첫 칸)은 아래 칸들과 조금 띄운다.
        stack && !label && !actions && 'max-[560px]:pb-1.5',
        stack && actions && 'max-[560px]:pt-2.5',
        className,
      )}
      {...props}
    >
      {actions ? (
        <span
          className={cn(
            'flex justify-end gap-2',
            stack && 'max-[560px]:flex-wrap max-[560px]:justify-start',
          )}
        >
          {children}
        </span>
      ) : (
        children
      )}
    </td>
  )
}
