import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { waitForRefresh } from './waitForRefresh'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** 기다림이 끝났는지 지금 시점에서 본다. */
async function settled(waiting: Promise<void>) {
  let done = false
  void waiting.then(() => (done = true))
  // 이미 끝난 Promise의 then이 돌 틈을 준다. 시간은 흐르지 않는다.
  await vi.advanceTimersByTimeAsync(0)
  return done
}

test('목록이 오면 바로 끝난다', async () => {
  let arrive!: () => void
  const waiting = waitForRefresh(new Promise<void>((resolve) => (arrive = resolve)))
  expect(await settled(waiting)).toBe(false)

  arrive()

  expect(await settled(waiting)).toBe(true)
})

test('목록이 오지 않아도 3초가 지나면 끝난다. 그 전에는 기다린다', async () => {
  const waiting = waitForRefresh(new Promise(() => {}))

  await vi.advanceTimersByTimeAsync(2_999)
  expect(await settled(waiting)).toBe(false)

  await vi.advanceTimersByTimeAsync(1)
  expect(await settled(waiting)).toBe(true)
})

test('목록을 받지 못해도 거부하지 않고 끝난다', async () => {
  const waiting = waitForRefresh(Promise.reject(new Error('목록 실패')))

  await expect(waiting).resolves.toBeUndefined()
})

test('목록이 먼저 오면 남은 타이머를 치운다', async () => {
  const waiting = waitForRefresh(Promise.resolve())

  await waiting

  // 타이머가 남으면 화면이 내려간 뒤에도 3초 동안 살아 있다.
  expect(vi.getTimerCount()).toBe(0)
})

test('상한이 지난 뒤 늦게 온 목록은 아무 일도 일으키지 않는다', async () => {
  let arrive!: () => void
  const waiting = waitForRefresh(new Promise<void>((resolve) => (arrive = resolve)))
  await vi.advanceTimersByTimeAsync(3_000)
  await waiting

  arrive()

  await expect(vi.advanceTimersByTimeAsync(0)).resolves.not.toThrow()
})
