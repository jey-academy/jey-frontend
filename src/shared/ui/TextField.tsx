import { useId, type ComponentProps } from 'react'
import { cn } from '@/shared/lib/cn'
import { FieldMessages } from './FieldMessages'
import { fieldControlClassName, fieldLabelClassName } from './fieldStyles'

type TextFieldProps = Omit<ComponentProps<'input'>, 'className'> & {
  label: string
  /** 입력창 아래에 보여주는 도움말 */
  hint?: string
  /** 있으면 입력창을 에러 상태로 표시하고 도움말 대신 보여준다 */
  error?: string
  /** 바깥 묶음에 붙는 클래스 (폭, 여백) */
  className?: string
}

/** 이름표가 붙은 입력창. 그 밖의 속성(ref 포함)은 input 태그에 그대로 전달한다. */
export function TextField({
  label,
  hint,
  error,
  className,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  ...props
}: TextFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`

  return (
    <div className={className}>
      <label htmlFor={inputId} className={fieldLabelClassName}>
        {label}
      </label>
      <input
        {...props}
        id={inputId}
        aria-invalid={error ? true : invalid}
        // 바깥에서 준 설명이 있어도 도움말·에러 연결은 유지한다.
        aria-describedby={cn(describedBy, error ? errorId : hint ? hintId : undefined) || undefined}
        className={fieldControlClassName(Boolean(error))}
      />
      <FieldMessages hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  )
}
