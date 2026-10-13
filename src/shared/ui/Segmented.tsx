import { useId } from 'react'
import { cn } from '@/shared/lib/cn'
import { FieldMessages } from './FieldMessages'
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
  /**
   * 지금 선택된 값. 주면 바깥에서 값을 관리한다(onChange와 함께 쓴다).
   * 값을 불러오는 중이라 아직 없을 때는 undefined 대신 빈 문자열을 준다.
   * undefined에서 값으로 바뀌면 React가 경고를 낸다.
   */
  value?: string
  /** 처음 선택돼 있을 값. value를 주지 않을 때 쓴다. */
  defaultValue?: string
  onChange?: (value: string) => void
  disabled?: boolean
  /** 묶음 아래에 보여주는 도움말 */
  hint?: string
  /** 있으면 도움말 대신 보여주고, 묶음을 에러 상태로 알린다 */
  error?: string
  className?: string
}

/**
 * 몇 개 중 하나를 고르는 버튼 묶음 (예: 수업 횟수 8/9/10회).
 * 안쪽은 라디오 버튼이라 방향키로 옮길 수 있고 폼 제출에도 그대로 실린다.
 * 도움말과 에러는 TextField와 같은 규칙이다. 묶음(radiogroup)의 설명으로 이어진다.
 */
export function Segmented({
  label,
  name,
  options,
  value,
  defaultValue,
  onChange,
  disabled,
  hint,
  error,
  className,
}: SegmentedProps) {
  const labelId = useId()
  const hintId = `${labelId}-hint`
  const errorId = `${labelId}-error`

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={error ? errorId : hint ? hintId : undefined}
      aria-invalid={error ? true : undefined}
      className={className}
    >
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
      <FieldMessages hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  )
}
