import { useId, type FormEvent, type ReactNode, type Ref } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from './Button'

type SearchBoxProps = {
  /** 입력 칸의 이름. 화면에는 보이지 않고 스크린 리더가 읽는다. 검색 영역의 이름도 된다. */
  label: string
  value: string
  onValueChange: (value: string) => void
  /** 확인 버튼이나 Enter. 입력 칸 값은 쓰는 쪽이 들고 있다. */
  onSubmit: () => void
  /** 확인 버튼 글자 (예: "확인하기") */
  submitLabel: string
  /** 확인하는 중. 버튼을 막고 글자를 바꾼다. 입력 칸은 막지 않는다(포커스가 빠지지 않게). */
  busy?: boolean
  busyLabel?: string
  placeholder?: string
  /** 상자 아래 한 줄 도움말 */
  hint?: string
  /** 확인 버튼 앞에 두는 버튼 (예: "QR 찍기") */
  extraActions?: ReactNode
  inputRef?: Ref<HTMLInputElement>
  /** 화면에 들어오면 입력 칸에 포커스한다(키보드처럼 글자를 넣는 스캐너를 바로 쓰게). */
  autoFocus?: boolean
  className?: string
}

/**
 * 데스크 검색 상자(DESIGN.md "SearchBox"): 돋보기 + 큰 입력 칸 + 버튼. 560px 미만에서는 버튼이 아래 줄로 내려간다.
 * 입력 칸에는 테두리가 없어 포커스 표시를 상자 전체에 그린다.
 */
export function SearchBox({
  label,
  value,
  onValueChange,
  onSubmit,
  submitLabel,
  busy = false,
  busyLabel,
  placeholder,
  hint,
  extraActions,
  inputRef,
  autoFocus,
  className,
}: SearchBoxProps) {
  const inputId = useId()
  const hintId = useId()

  // 확인하는 중에는 확인 버튼이 막혀 있어 Enter로도 제출되지 않는다(막힌 기본 버튼은 암묵적 제출을 막는다, HTML 표준).
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form role="search" aria-label={label} onSubmit={handleSubmit} className={className}>
      <div
        className={cn(
          'flex items-center gap-2.5 rounded-xl bg-card p-2.5 shadow-search max-[560px]:flex-wrap',
          'has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus',
        )}
      >
        <span aria-hidden="true" className="grid size-11 flex-none place-items-center text-sub">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
        </span>
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={placeholder}
          aria-describedby={hint ? hintId : undefined}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="search"
          className="h-11 min-w-0 flex-1 border-0 bg-transparent text-[20px] font-medium tracking-[-0.01em] text-ink placeholder:text-placeholder focus-visible:outline-none"
        />
        <div className="flex flex-none gap-2.5 max-[560px]:w-full">
          {extraActions}
          <Button type="submit" disabled={busy} className="max-[560px]:flex-1">
            {busy ? (busyLabel ?? submitLabel) : submitLabel}
          </Button>
        </div>
      </div>
      {hint && (
        <p id={hintId} className="mt-2.5 px-1 text-[14px] text-sub">
          {hint}
        </p>
      )}
    </form>
  )
}
