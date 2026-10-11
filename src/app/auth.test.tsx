import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ApiError } from '@/shared/api'
import { meQueryKey } from '@/shared/auth'
import { admin, partner, renderApp, staff } from '@/test/renderApp'

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
}

function problemResponse(status: number, problem: Record<string, unknown>) {
  return new Response(JSON.stringify(problem), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

const noContent = () => new Response(null, { status: 204 })
const unauthenticated = () =>
  problemResponse(401, { detail: '로그인이 필요합니다.', code: 'COMMON_UNAUTHENTICATED' })

type Handler = () => Response | Promise<Response>

/** 주소와 메서드별로 응답을 정한다. 정하지 않은 요청이 나가면 테스트가 실패한다. */
function mockApi(handlers: Record<string, Handler>) {
  fetchMock.mockImplementation(async (input, init) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`
    const handler = handlers[key]
    if (!handler) throw new Error(`흉내 내지 않은 요청: ${key}`)
    return handler()
  })
}

/** 지금까지 나간 요청을 "메서드 주소" 목록으로. */
function requests() {
  return fetchMock.mock.calls.map(([input, init]) => `${init?.method ?? 'GET'} ${String(input)}`)
}

function requestBody(key: string): unknown {
  const call = fetchMock.mock.calls.find(
    ([input, init]) => `${init?.method ?? 'GET'} ${String(input)}` === key,
  )
  return JSON.parse(String(call![1]!.body))
}

async function fillAndSubmit(loginId: string, password: string) {
  await userEvent.type(await screen.findByLabelText('아이디'), loginId)
  await userEvent.type(screen.getByLabelText('비밀번호'), password)
  await userEvent.click(screen.getByRole('button', { name: '로그인' }))
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

// ── 가드 ─────────────────────────────────────────────────

test.each(['/desk/dongtanpass', '/partner/passes', '/admin/settings'])(
  '로그인하지 않고 %s에 가면 틀을 그리지 않고 로그인 화면으로 보낸다',
  async (path) => {
    const { router } = renderApp(path, { me: null })

    expect(await screen.findByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.queryByRole('navigation', { name: '직원 메뉴' })).not.toBeInTheDocument()
  },
)

test('로그인 상태를 확인하는 동안에는 보호된 화면을 그리지 않는다', async () => {
  let respond!: (response: Response) => void
  mockApi({
    'GET /api/v1/auth/me': () => new Promise<Response>((resolve) => (respond = resolve)),
  })

  renderApp('/desk/dongtanpass')

  expect(await screen.findByRole('status')).toHaveTextContent('로그인 상태를 확인하고 있어요.')
  expect(screen.queryByRole('navigation', { name: '직원 메뉴' })).not.toBeInTheDocument()

  respond(jsonResponse(staff))
  expect(await screen.findByRole('navigation', { name: '직원 메뉴' })).toBeInTheDocument()
})

test.each([
  ['직원', staff, '/partner/passes', '/desk/dongtanpass'],
  ['직원', staff, '/admin/settings', '/desk/dongtanpass'],
  ['연계 학원', partner, '/desk/dongtanpass', '/partner/passes/new'],
  ['연계 학원', partner, '/admin/settings', '/partner/passes/new'],
])('%s 계정으로 볼 수 없는 화면(%s → %s)은 안내와 내 화면 링크를 보여준다', async (...args) => {
  const [, me, path, home] = args
  const { router } = renderApp(path, { me })

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '내 화면으로' })).toHaveAttribute('href', home)
  // 몰래 다른 화면으로 돌려보내지 않는다.
  expect(router.state.location.pathname).toBe(path)
})

test.each([
  ['관리자', admin, ['패스 확인', '패스 발급', '패스 목록']],
  ['직원', staff, ['패스 확인']],
  ['연계 학원', partner, ['패스 발급', '패스 목록']],
])('%s에게는 볼 수 있는 탭만 보여준다', async (_name, me, labels) => {
  renderApp(me.role === 'PARTNER' ? '/partner/passes/new' : '/desk/dongtanpass', { me })

  const nav = await screen.findByRole('navigation', { name: '직원 메뉴' })
  const tabs = within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent)
  expect(tabs).toEqual(labels)
})

test('로그인 상태를 확인하지 못하면 안내와 다시 시도를 보여준다', async () => {
  let fail = true
  mockApi({
    'GET /api/v1/auth/me': () =>
      fail ? problemResponse(403, { detail: '권한이 없습니다.' }) : jsonResponse(staff),
  })

  renderApp('/desk/dongtanpass')

  expect(
    await screen.findByRole('heading', { name: '로그인 상태를 확인하지 못했어요' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: '직원 메뉴' })).not.toBeInTheDocument()

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
  expect(await screen.findByRole('navigation', { name: '직원 메뉴' })).toBeInTheDocument()
})

// ── 로그인 ───────────────────────────────────────────────

test('로그인하면 CSRF 토큰을 받은 뒤 로그인 요청을 보내고, 가려던 화면으로 돌아간다', async () => {
  mockApi({
    'GET /api/v1/auth/me': unauthenticated,
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/login': () => jsonResponse(partner),
  })
  const { router } = renderApp('/partner/passes')

  await fillAndSubmit('partner1', 'correct-password')

  expect(await screen.findByRole('navigation', { name: '직원 메뉴' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/partner/passes')
  expect(screen.getByText('박연계')).toBeInTheDocument()
  // 로그인 응답을 그대로 쓰므로 /auth/me를 다시 묻지 않는다.
  expect(requests()).toEqual([
    'GET /api/v1/auth/me',
    'GET /api/v1/auth/csrf',
    'POST /api/v1/auth/login',
  ])
  expect(requestBody('POST /api/v1/auth/login')).toEqual({
    loginId: 'partner1',
    password: 'correct-password',
  })
})

test.each([
  ['직원', staff, '/desk/dongtanpass'],
  ['관리자', admin, '/desk/dongtanpass'],
  ['연계 학원', partner, '/partner/passes/new'],
])('로그인 화면으로 바로 온 %s은 로그인 후 역할의 첫 화면으로 간다', async (_name, me, home) => {
  mockApi({
    'GET /api/v1/auth/me': unauthenticated,
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/login': () => jsonResponse(me),
  })
  const { router } = renderApp('/login')

  await fillAndSubmit(me.loginId, 'correct-password')

  await waitFor(() => expect(router.state.location.pathname).toBe(home))
})

test('이미 로그인한 사람이 로그인 화면에 오면 역할의 첫 화면으로 보낸다', async () => {
  const { router } = renderApp('/login', { me: staff })

  await waitFor(() => expect(router.state.location.pathname).toBe('/desk/dongtanpass'))
  expect(screen.queryByLabelText('아이디')).not.toBeInTheDocument()
})

test.each(['//evil.example', 'https://evil.example', 42])(
  '앱 밖의 주소(%s)가 넘어와도 그곳으로 보내지 않는다',
  async (from) => {
    const { router } = renderApp('/login', { me: staff, state: { from } })

    await waitFor(() => expect(router.state.location.pathname).toBe('/desk/dongtanpass'))
  },
)

test.each([
  [401, 'AUTH_INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.'],
  [429, 'AUTH_TOO_MANY_ATTEMPTS', '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.'],
])('로그인에 실패하면(%i %s) 서버가 준 안내를 보여주고 화면에 남는다', async (...args) => {
  const [status, code, detail] = args
  mockApi({
    'GET /api/v1/auth/me': unauthenticated,
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/login': () => problemResponse(status, { detail, code }),
  })
  const { router } = renderApp('/login')

  await fillAndSubmit('desk1', 'wrong-password')

  expect(await screen.findByRole('alert')).toHaveTextContent(detail)
  expect(router.state.location.pathname).toBe('/login')
  // 다시 시도할 수 있게 입력한 아이디와 버튼은 그대로 둔다.
  expect(screen.getByLabelText('아이디')).toHaveValue('desk1')
  expect(screen.getByRole('button', { name: '로그인' })).toBeEnabled()
})

test('서버에 닿지 못하면 연결 안내를 보여준다', async () => {
  mockApi({
    'GET /api/v1/auth/me': unauthenticated,
    'GET /api/v1/auth/csrf': () => {
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp('/login')

  await fillAndSubmit('desk1', 'correct-password')

  expect(await screen.findByRole('alert')).toHaveTextContent('연결 상태를 확인해 주세요.')
  expect(requests()).not.toContain('POST /api/v1/auth/login')
})

// ── 로그아웃, 세션 만료 ──────────────────────────────────

test('로그아웃하면 받아 둔 자료를 지우고 로그인 화면으로 간다', async () => {
  mockApi({
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/logout': noContent,
  })
  const { router, queryClient } = renderApp('/desk/dongtanpass', { me: staff })
  queryClient.setQueryData(['billing', 'payments'], [{ id: 1 }])

  await userEvent.click(await screen.findByRole('button', { name: '로그아웃' }))

  expect(await screen.findByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
  // 다음 사람이 로그인했을 때 앞사람이 보던 화면으로 가지 않는다.
  expect(router.state.location.state).toBeNull()
  expect(queryClient.getQueryData(['billing', 'payments'])).toBeUndefined()
  expect(queryClient.getQueryData(meQueryKey)).toBeNull()
})

test('로그아웃 요청이 실패하면 로그인한 상태로 남는다', async () => {
  mockApi({
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/logout': () => problemResponse(500, {}),
  })
  const { router, queryClient } = renderApp('/desk/dongtanpass', { me: staff })

  await userEvent.click(await screen.findByRole('button', { name: '로그아웃' }))

  await waitFor(() => expect(requests()).toContain('POST /api/v1/auth/logout'))
  await waitFor(() => expect(screen.getByRole('button', { name: '로그아웃' })).toBeEnabled())
  expect(router.state.location.pathname).toBe('/desk/dongtanpass')
  expect(queryClient.getQueryData(meQueryKey)).toEqual(staff)
})

test('쓰는 도중에 세션이 끊기면(401) 로그인 화면으로 보내고, 다시 로그인하면 보던 화면으로 돌아온다', async () => {
  mockApi({
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/login': () => jsonResponse(staff),
  })
  const { router, queryClient } = renderApp('/desk/dongtanpass', { me: staff })
  await screen.findByRole('navigation', { name: '직원 메뉴' })

  // 어느 화면의 요청이든 401을 받으면
  await queryClient
    .fetchQuery({
      queryKey: ['dongtanpass', 'search'],
      queryFn: () => Promise.reject(new ApiError({ kind: 'http', status: 401 })),
    })
    .catch(() => {})

  expect(await screen.findByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')

  await fillAndSubmit('desk1', 'correct-password')
  await waitFor(() => expect(router.state.location.pathname).toBe('/desk/dongtanpass'))
})

test('401이 아닌 에러로는 로그아웃되지 않는다', async () => {
  const { router, queryClient } = renderApp('/desk/dongtanpass', { me: staff })
  await screen.findByRole('navigation', { name: '직원 메뉴' })

  await queryClient
    .fetchQuery({
      queryKey: ['dongtanpass', 'search'],
      queryFn: () => Promise.reject(new ApiError({ kind: 'http', status: 403 })),
    })
    .catch(() => {})

  expect(queryClient.getQueryData(meQueryKey)).toEqual(staff)
  expect(router.state.location.pathname).toBe('/desk/dongtanpass')
})
