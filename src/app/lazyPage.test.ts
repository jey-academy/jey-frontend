import { expect, test } from 'vitest'
import { lazyPage } from './lazyPage'

function Page() {
  return null
}

test('받은 모듈에서 화면을 꺼낸다', async () => {
  const lazy = lazyPage(
    () => Promise.resolve({ Page }),
    (m) => m.Page,
  )

  await expect(lazy()).resolves.toEqual({ Component: Page })
})

test('새로고침하기로 해 빈 값이 오면 에러를 내지 않고 새로고침을 기다린다', async () => {
  const lazy = lazyPage(
    () => Promise.resolve(undefined as unknown as { Page: typeof Page }),
    (m) => m.Page,
  )

  const settled = await Promise.race([
    lazy().then(
      () => 'resolved',
      () => 'rejected',
    ),
    new Promise((resolve) => setTimeout(() => resolve('pending'), 50)),
  ])
  expect(settled).toBe('pending')
})

test('받지 못한 에러(새로고침하지 않기로 한 경우)는 그대로 올린다', async () => {
  const failure = new TypeError('Failed to fetch dynamically imported module')
  const lazy = lazyPage(
    () => Promise.reject(failure),
    (m: { Page: typeof Page }) => m.Page,
  )

  await expect(lazy()).rejects.toBe(failure)
})
