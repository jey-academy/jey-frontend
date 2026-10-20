import { afterEach, expect, test, vi } from 'vitest'
import {
  claimPreloadReload,
  PRELOAD_RELOAD_KEY,
  PRELOAD_RELOAD_WINDOW_MS,
  watchPreloadError,
} from './preloadReload'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  }
}

afterEach(() => {
  window.sessionStorage.clear()
})

test('처음 실패하면 새로고침하고 그 시각을 적어 둔다', () => {
  const storage = memoryStorage()

  expect(claimPreloadReload(storage, 1_000_000)).toBe(true)
  expect(storage.values.get(PRELOAD_RELOAD_KEY)).toBe('1000000')
})

test('새로고침한 지 1분 안에 또 실패하면 새로고침하지 않는다', () => {
  const storage = memoryStorage({ [PRELOAD_RELOAD_KEY]: '1000000' })

  expect(claimPreloadReload(storage, 1_000_000 + PRELOAD_RELOAD_WINDOW_MS - 1)).toBe(false)
  // 적어 둔 시각은 그대로다(창이 밀려나지 않는다).
  expect(storage.values.get(PRELOAD_RELOAD_KEY)).toBe('1000000')
})

test('1분이 지난 뒤의 실패는 다음 배포의 것이라 다시 새로고침한다', () => {
  const storage = memoryStorage({ [PRELOAD_RELOAD_KEY]: '1000000' })

  expect(claimPreloadReload(storage, 1_000_000 + PRELOAD_RELOAD_WINDOW_MS)).toBe(true)
})

test('적힌 값이 숫자가 아니면 없는 것으로 본다', () => {
  expect(claimPreloadReload(memoryStorage({ [PRELOAD_RELOAD_KEY]: 'x' }), 1_000_000)).toBe(true)
})

test('저장소를 쓸 수 없으면 되풀이를 막을 수 없어 새로고침하지 않는다', () => {
  expect(claimPreloadReload(null, 1_000_000)).toBe(false)
  const broken = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {},
  }
  expect(claimPreloadReload(broken, 1_000_000)).toBe(false)
  const full = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota')
    },
  }
  expect(claimPreloadReload(full, 1_000_000)).toBe(false)
})

test('화면 파일을 받지 못했다는 알림에 한 번만 새로고침하고, 그 에러는 막는다', () => {
  const reload = vi.fn()
  watchPreloadError(reload)

  const first = new Event('vite:preloadError', { cancelable: true })
  window.dispatchEvent(first)
  expect(reload).toHaveBeenCalledTimes(1)
  expect(first.defaultPrevented).toBe(true)

  // 새로고침 뒤에도 또 실패했다(같은 탭의 sessionStorage가 남아 있다). 되풀이하지 않고 에러를 그대로 둔다.
  const second = new Event('vite:preloadError', { cancelable: true })
  window.dispatchEvent(second)
  expect(reload).toHaveBeenCalledTimes(1)
  expect(second.defaultPrevented).toBe(false)
})
