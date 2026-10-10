import { useId } from 'react'
import { cn } from '@/shared/lib/cn'
import { fieldLabelClassName } from './fieldStyles'

export type SegmentedOption = {
  value: string
  label: string
}

type SegmentedProps = {
  label: string
  /** 폼으로 제출될 때의 이름. 한 화면에 여러 개를 두면 서로 달라야 한다. */
  name: string
  options: SegmentedOption[]
  /** 지금 선택된 값. 주면 바깥에서 값을 관리한다(onChange와 함께 쓴다). */
  value?: string
  /** 처음 선택돼 있을 값. value를 주지 않을 때 쓴다. */
  defaultValue?: string
  onChange?: (value: string) => void
  disabled?: boolean
  className?: string
}

/**
 * 몇 개 중 하나를 고르는 버튼 묶음 (예: 수업 횟수 8/9/10회).
 * 안쪽은 라디오 버튼이라 방향키로 옮길 수 있고 폼 제출에도 그대로 실린다.
 */
export function Segmented({
  label,
  name,
  options,
  value,
  defaultValue,
  onChange,
  disabled,
  className,
}: SegmentedProps) {
  const labelId = useId()

  return (
    <div role="radiogroup" aria-labelledby={labelId} className={cn(className)}>
      <span id={labelId} className={fieldLabelClassName}>
        {label}
      </span>
      <div className="flex gap-2">
        {options.map((option) => (
          <label key={option.value} className="relative flex-1">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === undefined ? undefined : value === option.value}
              defaultChecked={value === undefined ? defaultValue === option.value : undefined}
              onChange={() => onChange?.(option.value)}
              disabled={disabled}
              className="peer pointer-events-none absolute opacity-0"
            />
            <span
              className={cn(
                'grid h-[50px] cursor-pointer place-items-center rounded-sm border-[1.5px] border-transparent bg-field text-[14px] font-semibold',
                'peer-checked:border-night peer-checked:bg-white peer-checked:text-night',
                'peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
                'peer-disabled:cursor-default peer-disabled:text-sub',
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
