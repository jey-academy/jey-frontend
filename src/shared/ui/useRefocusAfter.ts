import { useEffect, useRef, type FocusEvent } from 'react'

/**
 * 저장하는 동안 입력칸을 막으면(disabled) 그 칸에 있던 포커스가 사라진다.
 * 끝나면 있던 칸으로 돌려놓는다. Enter로 저장하고, 실패하면 고쳐서 다시 Enter를 누르는 흐름이 끊기지 않게 한다.
 * 돌려준 `onFocus`를 칸들을 모두 감싸는 요소(보통 form)에 붙인다. React의 onFocus는 안쪽에서 올라온다.
 * 칸을 막는 일은 호출하는 쪽이 한다(fieldset disabled 등). 막지 않으면 이 훅은 아무 일도 하지 않는다.
 * Form이 쓴다. 화면에서는 이 훅을 직접 쓰지 말고 Form을 쓴다.
 *
 * @param busy 저장하는 중인지. 호출하는 쪽이 이 동안 입력칸을 막는다.
 */
export function useRefocusAfter(busy: boolean) {
  const lastFocused = useRef<HTMLElement | null>(null)

  // 처음 그릴 때와 busy가 바뀔 때 돈다. 처음에는 적어 둔 칸이 없어 아무 일도 하지 않고,
  // 저장이 끝난 때(false가 된 때)에 돌려놓는다.
  useEffect(() => {
    if (busy) return
    const target = lastFocused.current
    if (!target) return
    // 그사이 사용자가 다른 칸이나 버튼으로 포커스를 옮겼으면 빼앗지 않는다
    // (빈 곳을 눌러 body가 된 경우는 구별하지 못해 돌려놓는다).
    // 돌려놓는 것은 포커스가 그 칸을 품은 요소(그 칸 자신 포함)에 있거나 막힌 요소에 남아 있을 때다.
    // - body: 막힌 칸의 포커스는 대개 body로 간다(Chrome에서 확인했다. 모달 안에서도 body다).
    // - 그 칸 자신: 막힌 칸에 포커스를 그대로 두는 환경도 있다.
    // - 창(dialog): 브라우저가 닫은 창을 Modal이 다시 열면, 칸이 모두 막혀 있어 포커스가 창 자체에 놓인다.
    const active = document.activeElement
    const lost = !active || active.contains(target) || active.matches(':disabled')
    if (!lost) return
    // 적어 둔 칸이 그사이 사라졌으면 아무 일도 일어나지 않는다(문서에 없는 요소는 포커스를 받지 않는다).
    // 폼이 통째로 사라지면 이 효과는 돌지도 않는다.
    // 화면은 움직이지 않는다. 버튼을 눌러도 버튼에 포커스를 주지 않는 브라우저에서는 마지막으로 친 칸으로 돌아가는데,
    // 그 칸이 위쪽에 있으면 화면이 따라 올라가 버튼 위의 실패 안내가 밀려난다.
    target.focus({ preventScroll: true })
  }, [busy])

  return {
    onFocus: (event: FocusEvent<HTMLElement>) => {
      lastFocused.current = event.target
    },
  }
}
