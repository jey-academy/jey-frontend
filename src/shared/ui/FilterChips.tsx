import { useId } from 'react'
import { cn } from '@/shared/lib/cn'
import type { SegmentedOption } from './Segmented'

type FilterChipsProps = {
  /** 묶음의 이름. 화면에는 보이지 않고 화면 낭독기가 읽는다(칩 이름만으로 무엇을 거르는지 알 수 있을 때 쓴다). */
  label: string
  /** 라디오 묶음의 이름. 한 화면에 여러 개를 두면 서로 달라야 한다. */
  name: string
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}

/**
 * 목록 위의 거르기 칩(전체 / 사용 가능 / …). 하나만 고른다.
 * Segmented와 같이 안쪽은 라디오 버튼이라 방향키로 옮길 수 있다. 칸을 나눠 채우지 않고 글자 폭대로 늘어서며, 좁으면 줄을 바꾼다.
 */
export function FilterChips({
  label,
  name,
  options,
  value,
  onChange,
  disabled,
  className,
}: FilterChipsProps) {
  const labelId = useId()

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className={cn('flex flex-wrap gap-2', className)}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>
      {options.map((option) => (
        <label key={option.value} className="relative">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            disabled={disabled}
            className="peer pointer-events-none absolute opacity-0"
          />
          <span
            className={cn(
              // 보이는 높이는 38px이고, 터치 영역은 가상 요소로 44px까지 넓힌다(설계서 8.3).
              "relative inline-flex h-[38px] cursor-pointer items-center rounded-full border-[1.5px] border-line bg-card px-4 text-[14px] font-semibold whitespace-nowrap text-sub after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-['']",
              'peer-checked:border-night peer-checked:bg-night-tint peer-checked:text-night',
              'peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
              'peer-disabled:cursor-default peer-disabled:opacity-60',
            )}
          >
            {option.label}
          </span>
        </label>
      ))}
    </div>
  )
}
