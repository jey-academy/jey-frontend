import { afterEach } from 'vitest'

/**
 * 포커스가 있던 칸이 막혔을 때(disabled) 브라우저가 하는 일을 흉내 낸다. Chrome은 포커스를 body로 옮긴다.
 * jsdom은 막힌 칸에 그대로 두고, 그 칸의 blur()도 듣지 않는다. 그래서 body로 직접 옮긴다.
 * (jsdom의 body는 tabIndex를 줘야 포커스를 받는다. 테스트가 끝나면 되돌린다.)
 */
export function loseFocus() {
  document.body.tabIndex = -1
  document.body.focus()
}

afterEach(() => {
  document.body.removeAttribute('tabindex')
})
