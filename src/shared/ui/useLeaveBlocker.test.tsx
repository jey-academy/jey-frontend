import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { createMemoryRouter, Link, RouterProvider } from 'react-router'
import { expect, test } from 'vitest'
import { setupDialog } from '@/test/dialog'
import { useLeaveBlocker } from './useLeaveBlocker'

setupDialog()

const TEXT = { title: '처리하는 중이에요', description: '끝난 뒤에 넘어갈 수 있어요.' }

function Page() {
  const [busy, setBusy] = useState(false)
  const modal = useLeaveBlocker(busy ? TEXT : null)
  return (
    <>
      {modal}
      <button onClick={() => setBusy((value) => !value)}>{busy ? '끝내기' : '시작'}</button>
      <Link to="/other">다른 화면</Link>
      <Link to="/page?tab=2">같은 화면의 다른 주소</Link>
    </>
  )
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/page', Component: Page },
      { path: '/other', element: <h1>다른 화면</h1> },
    ],
    { initialEntries: ['/page'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

function leave() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

test('막지 않을 때는 다른 화면으로 가고, 새로 고침도 묻지 않는다', async () => {
  const router = renderPage()

  expect(leave()).toBe(false)
  await userEvent.click(screen.getByRole('link', { name: '다른 화면' }))

  expect(router.state.location.pathname).toBe('/other')
})

test('막는 동안 다른 화면으로 가려 하면 창을 띄우고 남는다. 확인을 누르면 창만 닫힌다', async () => {
  const router = renderPage()
  await userEvent.click(screen.getByRole('button', { name: '시작' }))

  expect(leave()).toBe(true)
  await userEvent.click(screen.getByRole('link', { name: '다른 화면' }))

  expect(await screen.findByRole('dialog', { name: TEXT.title })).toHaveAccessibleDescription(
    TEXT.description,
  )
  expect(router.state.location.pathname).toBe('/page')
  await userEvent.click(screen.getByRole('button', { name: '확인' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/page')
})

test('같은 화면 안의 주소 바꾸기는 막지 않는다', async () => {
  const router = renderPage()
  await userEvent.click(screen.getByRole('button', { name: '시작' }))

  await userEvent.click(screen.getByRole('link', { name: '같은 화면의 다른 주소' }))

  expect(router.state.location.search).toBe('?tab=2')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('막은 사이 끝나면 창을 닫는다(떠나지는 않는다)', async () => {
  const router = renderPage()
  await userEvent.click(screen.getByRole('button', { name: '시작' }))
  await userEvent.click(screen.getByRole('link', { name: '다른 화면' }))
  await screen.findByRole('dialog', { name: TEXT.title })

  // 창 뒤의 버튼을 누를 수 없으니 직접 누른다(답이 온 것과 같다).
  act(() => screen.getByRole('button', { name: '끝내기', hidden: true }).click())

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/page')
  expect(leave()).toBe(false)
  // 막아 둔 이동을 풀어 두었다. 이제는 그냥 떠날 수 있다.
  expect(
    router.state.blockers.size === 0 ||
      [...router.state.blockers.values()].every((b) => b.state === 'unblocked'),
  ).toBe(true)
  await userEvent.click(screen.getByRole('link', { name: '다른 화면' }))
  expect(router.state.location.pathname).toBe('/other')
})
