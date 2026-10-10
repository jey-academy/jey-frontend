import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { expect, test } from 'vitest'
import { NavTabs, type NavTabItem } from './NavTabs'

const items: NavTabItem[] = [
  { to: '/desk/gopass', label: '패스 확인' },
  { to: '/partner/passes/new', label: '패스 발급' },
  { to: '/partner/passes', label: '패스 목록', end: true },
]

function renderAt(path: string) {
  const router = createMemoryRouter(
    [{ path: '*', element: <NavTabs label="직원 메뉴" items={items} /> }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

test('이름이 붙은 메뉴 안에 탭을 링크로 그린다', () => {
  renderAt('/desk/gopass')

  expect(screen.getByRole('navigation', { name: '직원 메뉴' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '패스 발급' })).toHaveAttribute(
    'href',
    '/partner/passes/new',
  )
})

test('지금 보고 있는 화면의 탭만 선택된 것으로 표시한다', () => {
  renderAt('/desk/gopass')

  expect(screen.getByRole('link', { name: '패스 확인' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: '패스 확인' })).toHaveClass('bg-white', 'text-night')
  expect(screen.getByRole('link', { name: '패스 발급' })).not.toHaveAttribute('aria-current')
  expect(screen.getByRole('link', { name: '패스 발급' })).toHaveClass('text-sub')
})

test('end를 준 탭은 하위 주소에서 선택되지 않는다', () => {
  renderAt('/partner/passes/new')

  expect(screen.getByRole('link', { name: '패스 발급' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: '패스 목록' })).not.toHaveAttribute('aria-current')
})

test('탭을 누르면 그 주소로 이동하고 선택 표시가 옮겨 간다', async () => {
  const router = renderAt('/desk/gopass')

  await userEvent.click(screen.getByRole('link', { name: '패스 목록' }))

  expect(router.state.location.pathname).toBe('/partner/passes')
  expect(screen.getByRole('link', { name: '패스 목록' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: '패스 확인' })).not.toHaveAttribute('aria-current')
})
