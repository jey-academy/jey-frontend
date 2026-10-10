import { useId, type ComponentProps } from 'react'
import { cn } from '@/shared/lib/cn'
import { FieldMessages } from './FieldMessages'
import { fieldControlClassName, fieldLabelClassName } from './fieldStyles'

type SelectFieldProps = Omit<ComponentProps<'select'>, 'className'> & {
  label: string
  /** 선택 상자 아래에 보여주는 도움말 */
  hint?: string
  /** 있으면 선택 상자를 에러 상태로 표시하고 도움말 대신 보여준다 */
  error?: string
  /** 바깥 묶음에 붙는 클래스 (폭, 여백) */
  className?: string
}

/** 이름표가 붙은 선택 상자. 선택지는 option 태그를 children으로 넣는다. */
export function SelectField({
  label,
  hint,
  error,
  className,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  ...props
}: SelectFieldProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const hintId = `${selectId}-hint`
  const errorId = `${selectId}-error`

  return (
    <div className={className}>
      <label htmlFor={selectId} className={fieldLabelClassName}>
        {label}
      </label>
      <select
        {...props}
        id={selectId}
        aria-invalid={error ? true : invalid}
        // 바깥에서 준 설명이 있어도 도움말·에러 연결은 유지한다.
        aria-describedby={cn(describedBy, error ? errorId : hint ? hintId : undefined) || undefined}
        className={fieldControlClassName(Boolean(error))}
      />
      <FieldMessages hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  )
}
