import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { useSaving, type RunSaving } from './useSaving'

/** 테스트가 원하는 때에 끝내는 일. */
function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

test('맡긴 일이 끝날 때까지 saving이 켜져 있고, 끝나면 풀린다', async () => {
  const work = deferred()
  const { result } = renderHook(() => useSaving())
  expect(result.current[0]).toBe(false)

  let running!: Promise<void>
  act(() => {
    running = result.current[1](() => work.promise)
  })
  expect(result.current[0]).toBe(true)

  await act(async () => {
    work.resolve()
    await running
  })
  expect(result.current[0]).toBe(false)
})

test('맡긴 일이 실패해도 풀린다. 에러는 삼키지 않고 그대로 내보낸다', async () => {
  const work = deferred()
  const { result } = renderHook(() => useSaving())

  let running!: Promise<void>
  act(() => {
    running = result.current[1](() => work.promise)
  })
  const failure = new Error('창을 닫다가 난 에러')
  let caught: unknown
  await act(async () => {
    work.reject(failure)
    await running.catch((error: unknown) => {
      caught = error
    })
  })

  expect(result.current[0]).toBe(false)
  expect(caught).toBe(failure)
})

test('맡긴 일이 시작하자마자 던져도 풀린다', async () => {
  const { result } = renderHook(() => useSaving())

  await act(async () => {
    // 약속을 돌려주기도 전에 던진다.
    const work = () => {
      throw new Error('바로 실패')
    }
    await result.current[1](work).catch(() => {})
  })

  expect(result.current[0]).toBe(false)
})

test('저장하는 중에 또 맡기면 받지 않는다. 먼저 맡긴 일이 끝날 때까지 잠겨 있다', async () => {
  const first = deferred()
  const second = vi.fn(() => Promise.resolve())
  const { result } = renderHook(() => useSaving())

  let running!: Promise<void>
  await act(async () => {
    running = result.current[1](() => first.promise)
    // 다시 그리기 전에 또 불린 경우다. 받으면 이 일이 먼저 끝나면서 잠금을 풀어 버린다.
    await result.current[1](second)
  })
  expect(second).not.toHaveBeenCalled()
  expect(result.current[0]).toBe(true)

  await act(async () => {
    first.resolve()
    await running
  })
  expect(result.current[0]).toBe(false)

  // 끝난 뒤에는 다시 받는다.
  await act(async () => {
    await result.current[1](second)
  })
  expect(second).toHaveBeenCalledOnce()
})

test('일을 맡긴 폼이 그사이 사라져도 풀린다', async () => {
  // 쓰는 모양을 보여주는 테스트다. 맡긴 일이 평범한 약속이라 훅을 어떻게 고쳐도 실패하지 않는다.
  // 실제 폼에서는 StudentDetailPage.guardians.edge.test.tsx의 "폼이 사라져도" 테스트가 지킨다.
  // 바깥(창)이 saving을 갖고, 안쪽 폼이 일을 맡긴다. 폼은 저장하는 동안 사라질 수 있다.
  const work = deferred()
  function InnerForm({ runSaving }: { runSaving: RunSaving }) {
    return (
      <button type="button" onClick={() => void runSaving(() => work.promise)}>
        저장
      </button>
    )
  }
  function Wrapper() {
    const [saving, runSaving] = useSaving()
    const [mounted, setMounted] = useState(true)
    return (
      <>
        <p>{saving ? '저장하는 중' : '쉬는 중'}</p>
        <button type="button" onClick={() => setMounted(false)}>
          폼 없애기
        </button>
        {mounted && <InnerForm runSaving={runSaving} />}
      </>
    )
  }
  render(<Wrapper />)
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  expect(screen.getByText('저장하는 중')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '폼 없애기' }))
  expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
  await act(async () => {
    work.resolve()
    await work.promise
  })

  // 풀리지 않으면 다음에 여는 창이 입력칸도 버튼도 막힌 채로 뜬다.
  expect(await screen.findByText('쉬는 중')).toBeInTheDocument()
})

test('runSaving은 다시 그려도 같은 함수다', () => {
  const { result, rerender } = renderHook(() => useSaving())
  const first = result.current[1]

  rerender()

  expect(result.current[1]).toBe(first)
})

test('맡긴 일은 한 번만 실행한다', async () => {
  const work = vi.fn(() => Promise.resolve())
  const { result } = renderHook(() => useSaving())

  await act(async () => {
    await result.current[1](work)
  })

  expect(work).toHaveBeenCalledOnce()
})
