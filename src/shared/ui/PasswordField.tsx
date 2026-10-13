import { useId, useState, type ComponentProps } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from './Button'
import { FieldMessages } from './FieldMessages'
import { fieldControlClassName, fieldLabelClassName } from './fieldStyles'

// type, spellCheck, autoCapitalize는 이 컴포넌트가 정한다. 넘겨도 덮이므로 받지 않는다.
type PasswordFieldProps = Omit<
  ComponentProps<'input'>,
  'className' | 'type' | 'spellCheck' | 'autoCapitalize'
> & {
  label: string
  /** 입력창 아래에 보여주는 도움말 */
  hint?: string
  /** 있으면 입력창을 에러 상태로 표시하고 도움말 대신 보여준다 */
  error?: string
  /** 바깥 묶음에 붙는 클래스 (폭, 여백) */
  className?: string
}

/**
 * 비밀번호 입력창. 평소에는 가려 두고, 옆의 버튼으로 친 값을 볼 수 있다.
 * 이름표·도움말·에러는 TextField와 같은 규칙이다(fieldContract.test.tsx). 그 밖의 속성(ref 포함)은 input 태그에 그대로 전달한다.
 * 값은 넘겨받은 대로 보여주기만 한다. 여기서 어디에도 남기지 않는다.
 */
export function PasswordField({
  label,
  hint,
  error,
  className,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  ...props
}: PasswordFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const [shown, setShown] = useState(false)
  // 버튼에 보이는 글자와 읽히는 이름이 같은 말로 끝나야 한다. 음성으로 "가리기"라고 불러도 찾을 수 있다.
  const toggleLabel = shown ? '가리기' : '보기'

  return (
    <div className={className}>
      <label htmlFor={inputId} className={fieldLabelClassName}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          {...props}
          id={inputId}
          type={shown ? 'text' : 'password'}
          // 보이는 동안(type="text")에는 브라우저가 보통 글로 다룬다.
          // 맞춤법 검사가 값을 바깥 서비스로 보내거나 자동 대문자가 값을 바꾸지 않게 끈다.
          spellCheck={false}
          autoCapitalize="none"
          aria-invalid={error ? true : invalid}
          // 바깥에서 준 설명이 있어도 도움말·에러 연결은 유지한다.
          aria-describedby={
            cn(describedBy, error ? errorId : hint ? hintId : undefined) || undefined
          }
          className={fieldControlClassName(Boolean(error), 'min-w-0 flex-1')}
        />
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${label} ${toggleLabel}`}
          onClick={() => setShown((now) => !now)}
        >
          {toggleLabel}
        </Button>
      </div>
      <FieldMessages hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  )
}
