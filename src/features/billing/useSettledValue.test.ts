import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useSettledValue } from './useSettledValue'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function render(initial: { count: number } | null) {
  return renderHook(({ value }) => useSettledValue(value, 400), {
    initialProps: { value: initial },
  })
}

test('바뀐 값은 멈춘 뒤에야 돌려주고, 그 전에는 이전 값이다', () => {
  const hook = render({ count: 1 })
  expect(hook.result.current).toEqual({ count: 1 })

  hook.rerender({ value: { count: 10 } })
  act(() => vi.advanceTimersByTime(399))
  expect(hook.result.current).toEqual({ count: 1 })

  act(() => vi.advanceTimersByTime(1))
  expect(hook.result.current).toEqual({ count: 10 })
})

test('같은 내용의 새 객체로는 기다림이 다시 시작되지 않는다', () => {
  const hook = render({ count: 1 })
  hook.rerender({ value: { count: 2 } })
  act(() => vi.advanceTimersByTime(300))

  hook.rerender({ value: { count: 2 } })
  act(() => vi.advanceTimersByTime(100))

  expect(hook.result.current).toEqual({ count: 2 })
})

test('비우면 바로 null이고, 다시 채우면 그 값이 멈출 때까지 null이다', () => {
  const hook = render({ count: 1 })

  hook.rerender({ value: null })
  expect(hook.result.current).toBeNull()

  hook.rerender({ value: { count: 3 } })
  // 비우기 전의 값({ count: 1 })을 돌려주지 않는다.
  expect(hook.result.current).not.toEqual({ count: 1 })
  act(() => vi.advanceTimersByTime(400))
  expect(hook.result.current).toEqual({ count: 3 })
})
