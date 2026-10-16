import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Outlet, type RouteObject } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Me } from '@/shared/auth'
import { mockApi, setupMockApi } from '@/test/mockApi'
import { admin, partner, renderApp } from '@/test/renderApp'
import { RouteErrorPage } from './pages/RouteErrorPage'
import { routes as appRoutes } from './router'

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

setupMockApi()

// 관리자는 연계 학원 화면(/partner)을 뺀 직원 화면을 모두 볼 수 있다. /partner는 연계 학원으로 본다.
// 여기서는 틀과 주소 연결만 보고, 역할별 접근은 auth.test.tsx에서 본다.
function renderAt(path: string, { me = admin, routes }: { me?: Me; routes?: RouteObject[] } = {}) {
  return renderApp(path, { me, routes }).router
}

// 화면이 처음 부르는 요청에 답하지 않고 둔다. 틀과 탭만 보는 테스트라 화면 내용은 필요 없다.
const neverAnswer = () => new Promise<Response>(() => {})

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
  ['/desk/dongtanpass', '패스 확인', admin],
  ['/partner/passes/new', '패스 발급', partner],
  ['/partner/passes', '패스 목록', partner],
])('%s에서는 %s 탭만 선택된다', async (path, label, me) => {
  mockApi({
    'GET /api/v1/dongtanpass/consent-notice': neverAnswer,
    'GET /api/v1/dongtanpass/passes': neverAnswer,
  })
  renderAt(path, { me })

  await screen.findByRole('navigation', { name: '직원 메뉴' })
  const current = screen.getAllByRole('link').filter((link) => link.hasAttribute('aria-current'))
  expect(current).toHaveLength(1)
  expect(current[0]).toHaveAccessibleName(label)
})

test('학부모 주소는 탭 없이 로고만 있는 틀 안에 그린다', async () => {
  renderAt('/find')

  expect(await screen.findByRole('link', { name: '동탄고 패스' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('heading', { level: 1, name: '링크 다시 받기' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
})

test('패스 링크(/p/토큰)는 학부모 틀 안에 그린다', async () => {
  mockApi({ 'POST /api/v1/dongtanpass/holder/view': neverAnswer })
  renderAt('/p/k7Qm2xVa9LpR4tWz')

  expect(await screen.findByRole('link', { name: '동탄고 패스' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('패스를 불러오고 있어요')
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
  ['/desk', admin],
  ['/desk/없는-화면', admin],
  ['/partner', partner],
  ['/partner/없는-화면', partner],
  ['/admin', admin],
  ['/admin/x', admin],
  ['/admin/settings/없는-화면', admin],
  ['/account/없는-화면', admin],
])('%s는 직원 틀을 유지한 채 없는 화면으로 안내한다', async (path, me) => {
  renderAt(path, { me })

  expect(await screen.findByRole('heading', { name: '찾는 화면이 없어요' })).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: '직원 메뉴' })).toBeInTheDocument()
})

// ── 화면 에러 ────────────────────────────────────────────

test.each([
  // 준비 중 화면(mock)이 에러를 던지게 한다.
  [
    '/desk/dongtanpass',
    '직원 틀',
    () => screen.getByRole('navigation', { name: '직원 메뉴' }),
    undefined,
  ],
  // 학부모 틀에는 준비 중 화면이 없어, 링크 다시 받기 화면 자리에 에러를 던지는 화면을 넣는다.
  [
    '/find',
    '학부모 틀',
    () => screen.getByRole('link', { name: '동탄고 패스' }),
    () => replacePage(appRoutes, '/find', async () => ({ Component: BrokenPage })),
  ],
])('%s 화면에서 에러가 나도 %s은 남고 화면 자리에만 안내가 뜬다', async (...args) => {
  const [path, , getFrame, routes] = args
  expectRenderError()
  broken.on = true

  renderAt(path, { routes: routes?.() })

  expect(
    await screen.findByRole('heading', { level: 1, name: '화면을 불러오지 못했어요' }),
  ).toBeInTheDocument()
  expect(getFrame()).toBeInTheDocument()
})

// 배포하면 화면 파일의 이름이 바뀐다. 그 전에 열어 둔 탭은 없어진 옛 파일을 받으려다 실패한다.
const CHUNK_ERROR = 'Failed to fetch dynamically imported module: /assets/옛-화면.js'

/** 실제 라우트를 복사하면서 그 주소의 화면만 바꾼다. 에러 경계의 배치는 실제 앱 그대로다. */
function replacePage(
  routes: RouteObject[],
  path: string,
  lazy: () => Promise<{ Component: () => never }>,
): RouteObject[] {
  return routes.map((route) => {
    const copy = { ...route } as RouteObject
    if (route.path === path) copy.lazy = lazy
    if (route.children) copy.children = replacePage(route.children, path, lazy)
    return copy
  })
}

/** 그 주소의 화면만 코드를 받지 못하게 한다. */
function withFailingPage(routes: RouteObject[], path: string): RouteObject[] {
  return replacePage(routes, path, () => Promise.reject(new TypeError(CHUNK_ERROR)))
}

test.each([
  [
    '/desk/students',
    '직원 틀',
    '/desk/students',
    () => screen.getByRole('navigation', { name: '직원 메뉴' }),
  ],
  [
    '/p/:token',
    '학부모 틀',
    '/p/k7Qm2xVa9LpR4tWz',
    () => screen.getByRole('link', { name: '동탄고 패스' }),
  ],
])(
  '%s 화면의 코드를 받지 못해도 %s은 남고 화면 자리에만 안내가 뜬다',
  async (pattern, _name, path, getFrame) => {
    expectRenderError()

    renderAt(path, { routes: withFailingPage(appRoutes, pattern) })

    expect(
      await screen.findByRole('heading', { level: 1, name: '화면을 불러오지 못했어요' }),
    ).toBeInTheDocument()
    expect(getFrame()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('Failed to fetch')
  },
)

test('열어 둔 화면에서 다른 화면으로 갈 때 코드를 받지 못해도 직원 틀은 남는다', async () => {
  expectRenderError()
  const router = renderAt('/desk/dongtanpass', {
    routes: withFailingPage(appRoutes, '/desk/students'),
  })
  await screen.findByRole('heading', { level: 1, name: '화면 준비 중이에요' })

  await userEvent.click(screen.getByRole('link', { name: '학생' }))

  expect(
    await screen.findByRole('heading', { level: 1, name: '화면을 불러오지 못했어요' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: '직원 메뉴' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/desk/students')
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

  renderAt('/', {
    routes: [
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
    ],
  })

  expect(
    await screen.findByRole('heading', { name: '화면을 불러오지 못했어요' }),
  ).toBeInTheDocument()
})
