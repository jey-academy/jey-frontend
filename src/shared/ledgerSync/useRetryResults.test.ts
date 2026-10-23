import { act, renderHook } from '@testing-library/react'
import { expect, test } from 'vitest'
import { useRetryResults } from './useRetryResults'

function result(id: number, text = `${id}번 결과`) {
  return { id, tone: 'success' as const, text, requestId: null }
}

test('목록에 없는 줄의 결과는 최근 것부터 5개까지만 준다', () => {
  const { result: hook } = renderHook(() => useRetryResults())

  act(() => {
    for (let id = 1; id <= 6; id++) hook.current.add(result(id))
  })

  const shown = hook.current.detached(new Set())
  expect(shown.map((item) => item.id)).toEqual([6, 5, 4, 3, 2])
})

test('목록에 남아 있는 줄의 결과는 빼고, 그 줄의 결과는 resultOf로 준다', () => {
  const { result: hook } = renderHook(() => useRetryResults())

  act(() => {
    hook.current.add(result(1))
    hook.current.add(result(2))
  })

  expect(hook.current.detached(new Set([2])).map((item) => item.id)).toEqual([1])
  expect(hook.current.resultOf(2)?.text).toBe('2번 결과')
  expect(hook.current.resultOf(3)).toBeNull()
})

test('같은 줄의 결과는 마지막 것 하나만 맨 앞에 남고, 매번 새 번호를 받는다', () => {
  const { result: hook } = renderHook(() => useRetryResults())

  act(() => {
    hook.current.add(result(1, '처음'))
    hook.current.add(result(2))
  })
  const firstSeq = hook.current.resultOf(1)?.seq
  act(() => hook.current.add(result(1, '다시')))

  expect(hook.current.detached(new Set()).map((item) => item.text)).toEqual(['다시', '2번 결과'])
  expect(hook.current.resultOf(1)?.seq).not.toBe(firstSeq)
})

test('clear로 모두 지운다', () => {
  const { result: hook } = renderHook(() => useRetryResults())

  act(() => hook.current.add(result(1)))
  act(() => hook.current.clear())

  expect(hook.current.detached(new Set())).toEqual([])
})
