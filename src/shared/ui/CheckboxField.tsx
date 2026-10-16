import { useId, type ComponentProps } from 'react'
import { cn } from '@/shared/lib/cn'
import { FieldMessages } from './FieldMessages'

type CheckboxFieldProps = Omit<ComponentProps<'input'>, 'type' | 'className'> & {
  /** 확인 칸 옆에 쓰는 말. 이 말을 눌러도 칸이 바뀐다. */
  label: string
  /** 아래에 보여주는 도움말 */
  hint?: string
  /** 있으면 도움말 대신 보여주고 칸을 에러 상태로 알린다 */
  error?: string
  /** 바깥 묶음에 붙는 클래스 (여백) */
  className?: string
}

/**
 * 이름표가 붙은 확인 칸 (예: "학부모에게 알리고 동의를 받았어요").
 * 이름표까지 누를 수 있게 묶어 터치 영역을 44px 이상으로 둔다. 그 밖의 속성은 input 태그에 그대로 전달한다.
 */
export function CheckboxField({
  label,
  hint,
  error,
  className,
  id,
  'aria-describedby': describedBy,
  ...props
}: CheckboxFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold has-disabled:cursor-default has-disabled:text-sub"
      >
        <input
          {...props}
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={
            cn(describedBy, error ? errorId : hint ? hintId : undefined) || undefined
          }
          className={cn(
            'size-[22px] flex-none cursor-[inherit] accent-night',
            error && 'outline-2 outline-red',
          )}
        />
        {label}
      </label>
      <FieldMessages hintId={hintId} errorId={errorId} hint={hint} error={error} />
    </div>
  )
}
