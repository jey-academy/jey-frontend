import { useEffect, useRef, type FocusEvent } from 'react'

/**
 * 저장하는 동안 입력칸을 막으면(disabled) 그 칸에 있던 포커스가 사라진다.
 * 끝나면 있던 칸으로 돌려놓는다. Enter로 저장하고, 실패하면 고쳐서 다시 Enter를 누르는 흐름이 끊기지 않게 한다.
 * 돌려준 `onFocus`를 폼(form)에 붙인다. 폼 안에서 포커스가 옮겨질 때마다 그 자리를 적어 둔다.
 *
 * @param busy 저장하는 중인지. true인 동안 입력칸이 막혀 있다고 본다.
 */
export function useRefocusAfter(busy: boolean) {
  const lastFocused = useRef<HTMLElement | null>(null)

  // busy가 바뀔 때만 돈다. 저장이 끝난 때(false가 된 때)에 돌려놓는다.
  useEffect(() => {
    if (busy) return
    const target = lastFocused.current
    if (!target) return
    // 그사이 사용자가 다른 곳으로 포커스를 옮겼으면 빼앗지 않는다.
    // 막힌 칸의 포커스는 body로 가거나(대부분의 브라우저) 막힌 칸에 남는다.
    const active = document.activeElement
    if (active && active !== document.body && active !== target && !active.matches(':disabled')) {
      return
    }
    // 저장에 성공해 폼이 사라졌으면 아무 일도 일어나지 않는다(문서에 없는 요소는 포커스를 받지 않는다).
    target.focus()
  }, [busy])

  return {
    onFocus: (event: FocusEvent<HTMLElement>) => {
      lastFocused.current = event.target
    },
  }
}
