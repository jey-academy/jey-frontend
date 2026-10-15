import { render, renderHook } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { expect, test } from 'vitest'
import { useIsShown } from './useIsShown'

test('화면에 있는 동안에는 true, 내려가면 false다', () => {
  const { result, unmount } = renderHook(() => useIsShown())
  const isShown = result.current
  expect(isShown()).toBe(true)

  unmount()

  expect(isShown()).toBe(false)
})

test('내려가는 순간, 다른 컴포넌트의 layout effect 정리에서 물어도 이미 false다', () => {
  // 같은 커밋 안에서 형제 컴포넌트의 layout effect 정리는 이 훅의 정리 뒤에 불린다.
  // useEffect로 끄면 여기서 아직 true다(화면은 바뀌었는데 꺼지지 않은 틈).
  let seenOnUnmount: boolean | undefined
  let isShown!: () => boolean
  function Shown() {
    isShown = useIsShown()
    return null
  }
  function Watcher() {
    useLayoutEffect(
      () => () => {
        seenOnUnmount = isShown()
      },
      [],
    )
    return null
  }
  const { unmount } = render(
    <>
      <Shown />
      <Watcher />
    </>,
  )

  unmount()

  expect(seenOnUnmount).toBe(false)
})
