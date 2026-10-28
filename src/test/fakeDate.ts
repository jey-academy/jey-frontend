import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

/**
 * 테스트 파일 맨 위에서 한 번 부른다. 파일의 모든 테스트에서 "지금"을 `now`로 고정한다(타이머는 진짜 그대로).
 *
 * 테스트가 끝나면 화면을 먼저 치우고 날짜를 되돌린다. 화면이 남은 채 진짜 날짜로 돌아가면,
 * 가짜 날짜에 넣은 로그인 정보가 며칠 묵은 것으로 보여 GET /auth/me를 다시 보낸다.
 * 그러면 setupMockApi가 "흉내 내지 않은 요청"으로 실패한다(가끔만 실패하던 #186).
 */
export function setupFakeDate(now: Date) {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })
}
