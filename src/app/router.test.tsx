import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Outlet, type RouteObject } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { admin, renderApp } from '@/test/renderApp'
import { RouteErrorPage } from './pages/RouteErrorPage'

const SECRET_MESSAGE = '화면에-보이면-안-되는-내용'

// 실제 라우터에 연결된 화면을 에러가 나는 화면으로 바꿔 볼 수 있게 한다.
// (지금은 모든 화면이 ComingSoonPage다. P3에서 실제 화면으로 바뀌면 대상도 함께 바꾼다.)
const broken = vi.hoisted(() => ({ on: false }))
vi.mock('./pages/ComingSoonPage', async (importOriginal) => {
  const real = await importOriginal<typeof import('./pages/ComingSoonPage')>()
  return {
    ComingSoonPage: () => {
      if (broken.on) throw new Error('화면에-보이면-안-되는-내용')
      return <real.ComingSoonPage />
    },
  }
})

function BrokenPage(): never {
  throw new Error(SECRET_MESSAGE)
}

// 관리자는 모든 직원 화면을 볼 수 있다. 여기서는 틀과 주소 연결만 보고, 역할별 접근은 auth.test.tsx에서 본다.
function renderAt(path: string, routeObjects?: RouteObject[]) {
  return renderApp(path, { me: admin, routes: routeObjects }).router
}

let consoleError: ReturnType<typeof vi.spyOn>
let errorExpected: boolean

/** 화면이 에러를 던지는 테스트에서만 부른다. 그 밖의 테스트에서 콘솔 에러가 나면 테스트가 실패한다. */
function expectRenderError() {
  errorExpected = true
}

beforeEach(() => {
  errorExpected = false
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  if (!errorExpected) expect(consoleError).not.toHaveBeenCalled()
  broken.on = false
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ── 틀 연결 ──────────────────────────────────────────────

test('직원 주소는 상단 바와 탭이 있는 틀 안에 그린다', async () => {
  renderAt('/desk/dongtanpass')

  expect(await screen.findByRole('navigation', { name: '직원 메뉴' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: '화면 준비 중이에요' })).toBeInTheDocument()
  // 좁은 화면에서 로고 글자를 숨겨도 이름은 읽힌다.
  expect(screen.getByRole('link', { name: 'JEY' })).toHaveAttribute('href', '/')
  // 이름은 계정 메뉴 버튼(좁은 화면)과 상단 바 글자(넓은 화면) 두 곳에 있다.
  expect(screen.getByRole('button', { name: '김원장 계정 메뉴' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument()
})

test.each([
  ['/desk/dongtanpass', '패스 확인'],
  ['/partner/passes/new', '패스 발급'],
  ['/partner/passes', '패스 목록'],
])('%s에서는 %s 탭만 선택된다', async (path, label) => {
  renderAt(path)

  await screen.findByRole('navigation', { name: '직원 메뉴' })
  const current = screen.getAllByRole('link').filter((link) => link.hasAttribute('aria-current'))
  expect(current).toHaveLength(1)
  expect(current[0]).toHaveAccessibleName(label)
})

test('학부모 주소는 탭 없이 로고만 있는 틀 안에 그린다', async () => {
  renderAt('/find')

  expect(await screen.findByRole('link', { name: '동탄고 패스' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('heading', { level: 1, name: '화면 준비 중이에요' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
})

test('패스 링크(/p/토큰)는 학부모 틀 안에 그린다', async () => {
  renderAt('/p/k7Qm2xVa9LpR4tWz')

  expect(await screen.findByRole('link', { name: '동탄고 패스' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: '화면 준비 중이에요' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
})

// ── 없는 주소 ────────────────────────────────────────────

test('없는 주소는 학부모 틀 안에서 한국어 안내와 처음으로 가는 링크를 보여준다', async () => {
  renderAt('/없는-주소')

  expect(
    await screen.findByRole('heading', { level: 1, name: '찾는 화면이 없어요' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '처음으로' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('link', { name: '동탄고 패스' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
})

test.each([
  '/desk',
  '/desk/없는-화면',
  '/partner',
  '/partner/없는-화면',
  '/admin',
  '/admin/x',
  '/admin/settings/없는-화면',
  '/account/없는-화면',
])('%s는 직원 틀을 유지한 채 없는 화면으로 안내한다', async (path) => {
  renderAt(path)

  expect(await screen.findByRole('heading', { name: '찾는 화면이 없어요' })).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: '직원 메뉴' })).toBeInTheDocument()
})

// ── 화면 에러 ────────────────────────────────────────────

test.each([
  ['/desk/dongtanpass', '직원 틀', () => screen.getByRole('navigation', { name: '직원 메뉴' })],
  ['/find', '학부모 틀', () => screen.getByRole('link', { name: '동탄고 패스' })],
])('%s 화면에서 에러가 나도 %s은 남고 화면 자리에만 안내가 뜬다', async (path, _name, getFrame) => {
  expectRenderError()
  broken.on = true

  renderAt(path)

  expect(
    await screen.findByRole('heading', { level: 1, name: '화면을 불러오지 못했어요' }),
  ).toBeInTheDocument()
  expect(getFrame()).toBeInTheDocument()
})

test('에러 내용은 화면에 보여주지 않는다', async () => {
  expectRenderError()
  broken.on = true

  renderAt('/desk/dongtanpass')

  await screen.findByRole('heading', { name: '화면을 불러오지 못했어요' })
  expect(document.body).not.toHaveTextContent(SECRET_MESSAGE)
  expect(document.body).not.toHaveTextContent('Error')
})

test('다시 시도와 처음으로는 둘 다 페이지를 새로 불러온다', async () => {
  expectRenderError()
  broken.on = true
  const reload = vi.fn()
  vi.stubGlobal('location', { ...window.location, reload })
  const router = renderAt('/desk/dongtanpass')

  await userEvent.click(await screen.findByRole('button', { name: '다시 시도' }))
  expect(reload).toHaveBeenCalledOnce()

  // reloadDocument 링크는 React Router가 클릭을 가로채지 않는다. 브라우저가 문서를 새로 불러온다.
  const notIntercepted = fireEvent.click(screen.getByRole('link', { name: '처음으로' }))
  expect(notIntercepted).toBe(true)
  expect(router.state.location.pathname).toBe('/desk/dongtanpass')
})

test('틀 자체가 깨져도 마지막 안전망이 안내를 보여준다', async () => {
  expectRenderError()
  function BrokenLayout() {
    if (broken.on) throw new Error(SECRET_MESSAGE)
    return <Outlet />
  }
  broken.on = true

  renderAt('/', [
    {
      ErrorBoundary: RouteErrorPage,
      children: [
        {
          Component: BrokenLayout,
          children: [
            { ErrorBoundary: RouteErrorPage, children: [{ path: '/', Component: BrokenPage }] },
          ],
        },
      ],
    },
  ])

  expect(
    await screen.findByRole('heading', { name: '화면을 불러오지 못했어요' }),
  ).toBeInTheDocument()
})
