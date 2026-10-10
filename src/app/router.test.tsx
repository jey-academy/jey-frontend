import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { formatWon } from '@/shared/lib'
import { GuardianLayout } from './layouts/GuardianLayout'
import { StaffLayout } from './layouts/StaffLayout'
import { RouteErrorPage } from './pages/RouteErrorPage'
import { routes } from './router'

function renderAt(path: string, routeObjects: RouteObject[] = routes) {
  const router = createMemoryRouter(routeObjects, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
}

/** 잘못된 금액을 표시하려다 에러가 나는 화면 */
function BrokenPage() {
  return <p>{formatWon(299250.5)}</p>
}

// 화면이 에러를 던지는 테스트에서 React와 에러 화면이 콘솔에 남기는 내용을 가린다.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('직원 주소는 상단 바와 탭이 있는 틀 안에 그린다', async () => {
  renderAt('/desk/gopass')

  expect(await screen.findByRole('navigation', { name: '직원 메뉴' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '패스 확인' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('heading', { level: 1, name: '화면 준비 중이에요' })).toBeInTheDocument()
})

test('학부모 주소는 탭 없이 로고만 있는 틀 안에 그린다', async () => {
  renderAt('/find')

  expect(await screen.findByRole('link', { name: '동탄고패스' })).toHaveAttribute('href', '/')
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
})

test('없는 주소는 한국어 안내와 처음으로 가는 링크를 보여준다', async () => {
  renderAt('/없는-주소')

  expect(
    await screen.findByRole('heading', { level: 1, name: '찾는 화면이 없어요' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '처음으로' })).toHaveAttribute('href', '/')
})

test('직원 주소 아래의 없는 주소는 직원 틀을 유지한 채 안내한다', async () => {
  renderAt('/desk/없는-화면')

  expect(await screen.findByRole('heading', { name: '찾는 화면이 없어요' })).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: '직원 메뉴' })).toBeInTheDocument()
})

test('화면에서 에러가 나면 틀은 남기고 화면 자리에 안내와 버튼을 보여준다', async () => {
  renderAt('/desk/broken', [
    {
      Component: StaffLayout,
      children: [
        {
          ErrorBoundary: RouteErrorPage,
          children: [{ path: '/desk/broken', Component: BrokenPage }],
        },
      ],
    },
  ])

  expect(
    await screen.findByRole('heading', { level: 1, name: '화면을 불러오지 못했어요' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '처음으로' })).toHaveAttribute('href', '/')
  // 다른 탭으로 이동할 수 있게 상단 바가 남아 있다.
  expect(screen.getByRole('navigation', { name: '직원 메뉴' })).toBeInTheDocument()
})

test('에러 내용은 화면에 보여주지 않는다', async () => {
  renderAt('/find', [
    {
      Component: GuardianLayout,
      children: [
        { ErrorBoundary: RouteErrorPage, children: [{ path: '/find', Component: BrokenPage }] },
      ],
    },
  ])

  await screen.findByRole('heading', { name: '화면을 불러오지 못했어요' })
  expect(document.body).not.toHaveTextContent('금액은 정수여야 해요')
  expect(document.body).not.toHaveTextContent('RangeError')
})

test('틀 자체가 깨져도 마지막 안전망이 안내를 보여준다', async () => {
  renderAt('/', [
    { ErrorBoundary: RouteErrorPage, children: [{ path: '/', Component: BrokenPage }] },
  ])

  expect(
    await screen.findByRole('heading', { name: '화면을 불러오지 못했어요' }),
  ).toBeInTheDocument()
})
