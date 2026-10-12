import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { ApiError } from '@/shared/api'
import { createErrorLogging } from './errorLogging'
import { RouteErrorPage } from './pages/RouteErrorPage'

const SECRET_MESSAGE = '전화번호 010-5521-4821'
const SECRET_TOKEN = 'k7Qm2xVa9LpR4tWz'

function BrokenPage(): never {
  throw new Error(SECRET_MESSAGE)
}

/** 실제 앱(main.tsx)과 같은 방식으로 연결해, 에러가 나는 패스 화면을 그린다. */
async function renderBrokenPassPage(isDev: boolean) {
  const { onCaughtError, onRouterError } = createErrorLogging(isDev)
  const router = createMemoryRouter(
    [{ ErrorBoundary: RouteErrorPage, children: [{ path: '/p/:token', Component: BrokenPage }] }],
    { initialEntries: [`/p/${SECRET_TOKEN}`] },
  )
  render(<RouterProvider router={router} onError={onRouterError} />, { onCaughtError })
  await screen.findByRole('heading', { name: '화면을 불러오지 못했어요' })
}

/** 콘솔에 찍힌 모든 내용을 한 문자열로 합친다. 에러 객체는 message와 stack까지 포함한다. */
function printed(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls
    .flat()
    .map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : String(arg)))
    .join('\n')
}

afterEach(() => {
  vi.restoreAllMocks()
})

test('배포 환경에서는 에러 종류와 화면 패턴 한 줄만 콘솔에 남긴다', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  await renderBrokenPassPage(false)

  expect(consoleError).toHaveBeenCalledOnce()
  expect(consoleError).toHaveBeenCalledWith('[화면 에러] Error @ /p/:token')
})

test('배포 환경에서는 에러 메시지와 실제 주소의 토큰을 콘솔에 남기지 않는다', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  await renderBrokenPassPage(false)

  const output = printed(consoleError) + printed(consoleWarn)
  expect(output).not.toContain('5521')
  expect(output).not.toContain(SECRET_TOKEN)
})

test('개발 서버에서는 원인을 볼 수 있게 에러를 그대로 남긴다', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  await renderBrokenPassPage(true)

  expect(printed(consoleError)).toContain(SECRET_MESSAGE)
})

test('배포 환경에서 API 에러는 종류·상태 코드·에러 코드·요청 번호까지 남기고 문구는 남기지 않는다', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { onRouterError } = createErrorLogging(false)

  onRouterError(
    new ApiError({
      kind: 'http',
      status: 404,
      problem: {
        detail: '김도윤 학생의 청구서를 찾을 수 없어요.',
        code: 'BILLING_INVOICE_NOT_FOUND',
        requestId: '2d6a6e90a9d04a16bb607aa43840f2d7',
      },
    }),
    { pattern: '/desk/billing' },
  )
  onRouterError(new ApiError({ kind: 'network' }), { pattern: '/find' })

  expect(consoleError).toHaveBeenNthCalledWith(
    1,
    '[화면 에러] ApiError http 404 BILLING_INVOICE_NOT_FOUND 2d6a6e90a9d04a16bb607aa43840f2d7 @ /desk/billing',
  )
  expect(consoleError).toHaveBeenNthCalledWith(2, '[화면 에러] ApiError network - - - @ /find')
  expect(printed(consoleError)).not.toContain('김도윤')
})

test('배포 환경에서 Error가 아닌 값이 던져져도 값 자체는 남기지 않는다', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { onRouterError } = createErrorLogging(false)

  onRouterError('010-5521-4821', { pattern: '/find' })

  expect(consoleError).toHaveBeenCalledWith('[화면 에러] string @ /find')
})

test('개발 서버에서는 React의 기본 에러 출력을 끄지 않는다', () => {
  expect(createErrorLogging(true).onCaughtError).toBeUndefined()
  expect(createErrorLogging(false).onCaughtError).toBeTypeOf('function')
})
