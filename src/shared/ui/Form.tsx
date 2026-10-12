import type { ComponentProps } from 'react'
import { useRefocusAfter } from './useRefocusAfter'

// noValidate는 늘 켠다. onFocus는 받지 않는다. 포커스를 돌려놓는 데 Form이 쓴다.
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
 * 안에 넣은 것은 저장하는 동안 모두 막힌다(안내 안의 다시 불러오기 버튼 등도). 저장 중에도 눌러야 하는 것은
 * Form 밖에 둔다. 링크는 막히지 않는다. 안의 버튼에 disabled={saving}을 따로 줄 필요는 없다.
 *
 * 입력값 검사는 브라우저에 맡기지 않는다(noValidate). 쓰는 쪽이 onSubmit에서 직접 검사해 칸 아래에 알린다.
 * 브라우저 검사를 켜 두면 빈 필수 칸에서 제출이 막혀 onSubmit이 불리지 않는다.
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
