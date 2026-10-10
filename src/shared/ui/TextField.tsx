import { useId, type InputHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'
import { FieldMessages } from './FieldMessages'
import { fieldControlClassName, fieldLabelClassName } from './fieldStyles'

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  label: string
  /** 입력창 아래에 보여주는 도움말 */
  hint?: string
  /** 있으면 입력창을 에러 상태로 표시하고 도움말 대신 보여준다 */
  error?: string
  /** 바깥 묶음에 붙는 클래스 (폭, 여백) */
  className?: string
}

/** 이름표가 붙은 입력창. 그 밖의 속성은 input 태그에 그대로 전달한다. */
export function TextField({ label, hint, error, className, id, ...props }: TextFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`

  return (
    <div className={cn(className)}>
      <label htmlFor={inputId} className={fieldLabelClassName}>
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={fieldControlClassName(Boolean(error))}
        {...props}
      />
      <FieldMessages hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  )
}
