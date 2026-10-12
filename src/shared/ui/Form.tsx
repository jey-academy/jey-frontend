import type { ComponentProps } from 'react'
import { useRefocusAfter } from './useRefocusAfter'

type FormProps = Omit<ComponentProps<'form'>, 'noValidate' | 'onFocus'> & {
  /** 저장하는 중인지. 켜져 있는 동안 안의 입력칸과 버튼을 모두 막는다. */
  saving: boolean
}

/**
 * 저장하는 동안 잠기는 폼. 안에 넣은 입력칸과 버튼이 저장 중에는 모두 막히고,
 * 끝나면 포커스가 있던 자리로 돌아온다(useRefocusAfter).
 *
 * 막는 까닭: 그사이 고친 값은 보낸 요청에 없다.
 * - 등록: 응답을 놓친 뒤 다시 누르면 내용이 달라져 새 키로 나가고, 두 건이 만들어질 수 있다(UNSURE_RESEND_AS_IS).
 * - 수정: 저장된 값과 화면이 달라지거나, 다시 저장할 때 뜻하지 않은 값이 나간다.
 *
 * 입력값 검사는 브라우저에 맡기지 않는다(noValidate). 폼이 직접 검사해 칸 아래에 알린다.
 */
export function Form({ saving, children, ...props }: FormProps) {
  const refocus = useRefocusAfter(saving)
  return (
    <form noValidate {...props} {...refocus}>
      {/* contents(display: contents): 상자를 만들지 않아, 안의 것들이 폼의 격자에 그대로 놓인다. */}
      <fieldset disabled={saving} className="contents">
        {children}
      </fieldset>
    </form>
  )
}
