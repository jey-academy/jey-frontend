import { MutationObserver, type QueryClient } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { ApiError } from '@/shared/api'
import { meQueryKey } from '@/shared/auth'
import {
  expectNoRequests,
  jsonResponse,
  mockApi,
  noContent,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
  unauthenticated,
  unreadableResponse,
} from '@/test/mockApi'
import { admin, partner, renderApp, staff } from '@/test/renderApp'

setupMockApi()

// 연계 학원의 첫 화면(패스 발급)은 열리자마자 개인정보 고지 문구를 받는다.
beforeEach(() => {
  mockApi({
    'GET /api/v1/dongtanpass/consent-notice': () =>
      jsonResponse({ version: '2026-10-01', text: '수집하는 정보: 학생 이름, 학부모 휴대전화' }),
  })
})

async function fillAndSubmit(loginId: string, password: string) {
  await userEvent.type(await screen.findByLabelText('아이디'), loginId)
  await userEvent.type(screen.getByLabelText('비밀번호'), password)
  await userEvent.click(screen.getByRole('button', { name: '로그인' }))
}

/** 어느 화면의 조회 요청이 이 에러로 실패한 상황을 만든다. */
async function failQuery(queryClient: QueryClient, error: ApiError) {
  await queryClient
    .fetchQuery({
      queryKey: ['dongtanpass', 'search'],
      queryFn: () => Promise.reject(error),
      // 재시도 대기 없이 바로 실패하게 한다.
      retry: false,
    })
    .catch(() => {})
}

const sessionExpired = () =>
  new ApiError({ kind: 'http', status: 401, problem: { code: 'COMMON_UNAUTHENTICATED' } })

function tabLabels() {
  const nav = screen.getByRole('navigation', { name: '직원 메뉴' })
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent)
}

// ── 공개 화면 ────────────────────────────────────────────

test.each(['/', '/find', '/p/k7Qm2xVa9LpR4tWz', '/없는-주소'])(
  '%s는 로그인하지 않아도 열리고 로그인 상태를 묻지 않는다',
  async (path) => {
    const { router } = renderApp(path)

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(path)
    expect(screen.queryByRole('heading', { name: '로그인' })).not.toBeInTheDocument()
    expectNoRequests()
  },
)

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
  ['직원', '/desk/dongtanpass', '화면 준비 중이에요', staff],
  ['직원', '/desk/없는-화면', '찾는 화면이 없어요', staff],
  ['연계 학원', '/partner/passes/new', '패스 발급', partner],
  ['연계 학원', '/partner/passes', '화면 준비 중이에요', partner],
  ['관리자', '/desk/dongtanpass', '화면 준비 중이에요', admin],
  ['관리자', '/partner/passes/new', '패스 발급', admin],
  ['관리자', '/partner/passes', '화면 준비 중이에요', admin],
  ['관리자', '/admin/없는-화면', '찾는 화면이 없어요', admin],
])('%s 계정은 %s를 볼 수 있다', async (_name, path, heading, me) => {
  renderApp(path, { me })

  // 틀(탭)은 권한 안내 화면에서도 보인다. 가드를 통과했는지는 안쪽 화면으로 확인한다.
  expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '이 화면을 볼 권한이 없어요' })).toBeNull()
})

test.each([
  ['직원', '/partner/passes', '/desk/dongtanpass', staff],
  ['직원', '/admin/settings', '/desk/dongtanpass', staff],
  ['연계 학원', '/desk/dongtanpass', '/partner/passes/new', partner],
  ['연계 학원', '/admin/settings', '/partner/passes/new', partner],
])('%s 계정으로 %s에 가면 안내와 내 화면(%s) 링크를 보여준다', async (...args) => {
  const [, path, home, me] = args
  const { router } = renderApp(path, { me })

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '내 화면으로' })).toHaveAttribute('href', home)
  // 몰래 다른 화면으로 돌려보내지 않는다.
  expect(router.state.location.pathname).toBe(path)
})

test.each([
  ['관리자', admin, ['패스 확인', '학생', '패스 발급', '패스 목록', '기록', '설정']],
  ['직원', staff, ['패스 확인', '학생']],
  ['연계 학원', partner, ['패스 발급', '패스 목록']],
])('%s에게는 볼 수 있는 탭만 보여준다', async (_name, me, labels) => {
  renderApp(me.role === 'PARTNER' ? '/partner/passes/new' : '/desk/dongtanpass', { me })

  await screen.findByRole('navigation', { name: '직원 메뉴' })
  expect(tabLabels()).toEqual(labels)
})

test('로그인 상태를 확인하다 서버 쪽 문제가 나면 문의할 때 쓸 요청 번호를 보여주고 콘솔에도 남긴다', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  // 서버 오류(5xx)는 몇 번 다시 보낸 뒤에야 실패로 보인다. 다시 보내지 않는 "읽지 못한 응답"으로 같은 길을 본다.
  mockApi({ 'GET /api/v1/auth/me': () => unreadableResponse('2d6a6e90a9d04a16bb607aa43840f2d7') })
  renderApp('/desk/students')

  expect(
    await screen.findByRole('heading', { level: 1, name: '로그인 상태를 확인하지 못했어요' }),
  ).toBeInTheDocument()
  expect(screen.getByText(/문의할 때 이 번호를 알려 주세요/)).toHaveTextContent(
    '문의할 때 이 번호를 알려 주세요: 2d6a6e90a9d04a16bb607aa43840f2d7',
  )
  // 화면의 번호는 창을 닫으면 사라진다. 콘솔에도 한 줄 남는다.
  expect(consoleError).toHaveBeenCalledExactlyOnceWith(
    '[API 에러] ApiError parse 200 - 2d6a6e90a9d04a16bb607aa43840f2d7',
  )
  consoleError.mockRestore()
})

test('로그인 상태를 확인하지 못하면 안내와 다시 시도를 보여준다', async () => {
  let fail = true
  mockApi({
    // 실제로는 연결 실패나 5xx다. 여기서는 재시도 대기를 피하려고 재시도하지 않는 상태 코드를 쓴다.
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

test('로그인한 뒤 로그인 상태 재확인이 실패해도 보던 화면은 유지한다', async () => {
  mockApi({ 'GET /api/v1/auth/me': () => problemResponse(403, { detail: '권한이 없습니다.' }) })
  const { router, queryClient } = renderApp('/desk/dongtanpass', { me: staff })
  await screen.findByRole('navigation', { name: '직원 메뉴' })

  // 시간이 지나 창으로 돌아왔을 때 일어나는 재확인
  await queryClient.invalidateQueries({ queryKey: meQueryKey })

  expect(requests()).toEqual(['GET /api/v1/auth/me'])
  expect(await screen.findByRole('navigation', { name: '직원 메뉴' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '화면 준비 중이에요' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '로그인 상태를 확인하지 못했어요' })).toBeNull()
  expect(router.state.location.pathname).toBe('/desk/dongtanpass')
})

test('로그인 상태를 다시 확인했을 때 세션이 없으면(401) 로그인 화면으로 보낸다', async () => {
  mockApi({ 'GET /api/v1/auth/me': unauthenticated })
  const { router, queryClient } = renderApp('/desk/dongtanpass', { me: staff })
  await screen.findByRole('navigation', { name: '직원 메뉴' })

  await queryClient.invalidateQueries({ queryKey: meQueryKey })

  expect(await screen.findByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
})

// ── 로그인 ───────────────────────────────────────────────

test('로그인하면 CSRF 토큰을 받아 로그인 요청에 싣고, 가려던 화면으로 돌아간다', async () => {
  mockApi({
    'GET /api/v1/auth/me': unauthenticated,
    'GET /api/v1/auth/csrf': () => {
      document.cookie = 'XSRF-TOKEN=token-from-server'
      return noContent()
    },
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
  const login = requestOf('POST /api/v1/auth/login')
  expect(login.body).toEqual({ loginId: 'partner1', password: 'correct-password' })
  expect(login.headers.get('X-XSRF-TOKEN')).toBe('token-from-server')
  expect(login.init.credentials).toBe('include')
})

test('가려던 주소의 쿼리 문자열도 로그인 후 그대로 돌아온다', async () => {
  mockApi({
    'GET /api/v1/auth/me': unauthenticated,
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/login': () => jsonResponse(partner),
  })
  const { router } = renderApp('/partner/passes?status=USED&page=2')

  await fillAndSubmit('partner1', 'correct-password')

  await waitFor(() => expect(router.state.location.pathname).toBe('/partner/passes'))
  expect(router.state.location.search).toBe('?status=USED&page=2')
})

test.each([
  ['직원', staff, '/desk/dongtanpass'],
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

test('비밀번호 변경 화면에서 왔으면 어느 역할이든 로그인 뒤 그 화면으로 돌아간다', async () => {
  // 누구에게나 열린 주소다. 비밀번호 변경의 응답을 놓쳐 로그아웃된 사람이 새 비밀번호로 로그인하면 여기로 돌아온다.
  const { router } = renderApp('/login', { me: partner, state: { from: '/account/password' } })

  expect(
    await screen.findByRole('heading', { level: 1, name: '비밀번호 변경' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/account/password')
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

test('로그인 요청을 보내는 동안에는 다시 누를 수 없다', async () => {
  let respond!: (response: Response) => void
  mockApi({
    'GET /api/v1/auth/me': unauthenticated,
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/login': () => new Promise<Response>((resolve) => (respond = resolve)),
  })
  const { router } = renderApp('/login')

  await fillAndSubmit('desk1', 'correct-password')

  const button = await screen.findByRole('button', { name: '로그인하는 중' })
  expect(button).toBeDisabled()
  await waitFor(() => expect(requests()).toContain('POST /api/v1/auth/login'))
  await userEvent.click(button)
  expect(requests().filter((key) => key === 'POST /api/v1/auth/login')).toHaveLength(1)

  respond(jsonResponse(staff))
  await waitFor(() => expect(router.state.location.pathname).toBe('/desk/dongtanpass'))
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

test('로그인 중 서버 오류가 나면 문의할 때 쓸 요청 번호를 보여준다. 비밀번호가 틀린 것에는 붙이지 않는다', async () => {
  let status = 500
  mockApi({
    'GET /api/v1/auth/me': unauthenticated,
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/login': () =>
      problemResponse(status, {
        detail: status === 500 ? '서버 오류' : '아이디 또는 비밀번호가 올바르지 않습니다.',
        code: status === 500 ? 'COMMON_INTERNAL_ERROR' : 'AUTH_INVALID_CREDENTIALS',
        requestId: '2d6a6e90a9d04a16bb607aa43840f2d7',
      }),
  })
  renderApp('/login')

  await fillAndSubmit('desk1', 'correct-password')

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '문의할 때 이 번호를 알려 주세요: 2d6a6e90a9d04a16bb607aa43840f2d7',
  )

  status = 401
  await userEvent.click(screen.getByRole('button', { name: '로그인' }))

  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      '아이디 또는 비밀번호가 올바르지 않습니다.',
    ),
  )
  expect(screen.getByRole('alert')).not.toHaveTextContent('문의할 때')
})

// ── 로그아웃 ─────────────────────────────────────────────

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
  expect(queryClient.getQueryData(['billing', 'payments'])).toBeUndefined()
  expect(queryClient.getQueryData(meQueryKey)).toBeNull()
  // 변경 요청이라 CSRF 토큰을 먼저 받는다.
  expect(requests()).toEqual(['GET /api/v1/auth/csrf', 'POST /api/v1/auth/logout'])
})

test('로그아웃한 뒤 같은 역할로 로그인하면 보던 화면으로 돌아온다', async () => {
  mockApi({
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/logout': noContent,
    'POST /api/v1/auth/login': () => jsonResponse(admin),
  })
  const { router } = renderApp('/partner/passes', { me: admin })

  await userEvent.click(await screen.findByRole('button', { name: '로그아웃' }))
  await fillAndSubmit('admin', 'correct-password')

  await waitFor(() => expect(router.state.location.pathname).toBe('/partner/passes'))
})

test('로그아웃한 뒤 다른 역할로 로그인하면 앞사람이 보던 화면이 아니라 그 계정의 첫 화면으로 간다', async () => {
  mockApi({
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/logout': noContent,
    'POST /api/v1/auth/login': () => jsonResponse(partner),
  })
  const { router } = renderApp('/desk/dongtanpass', { me: staff })

  await userEvent.click(await screen.findByRole('button', { name: '로그아웃' }))
  await fillAndSubmit('partner1', 'correct-password')

  await waitFor(() => expect(router.state.location.pathname).toBe('/partner/passes/new'))
  expect(await screen.findByText('박연계')).toBeInTheDocument()
  expect(screen.queryByText('이데스크')).not.toBeInTheDocument()
  expect(tabLabels()).toEqual(['패스 발급', '패스 목록'])
})

test('로그아웃 요청이 실패하면 로그인한 상태로 남고 실패를 알린다', async () => {
  mockApi({
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/logout': () =>
      problemResponse(500, { detail: '서버 오류', requestId: '2d6a6e90a9d04a16bb607aa43840f2d7' }),
  })
  const { router, queryClient } = renderApp('/desk/dongtanpass', { me: staff })
  queryClient.setQueryData(['billing', 'payments'], [{ id: 1 }])

  await userEvent.click(await screen.findByRole('button', { name: '로그아웃' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '로그아웃하지 못했어요. 아직 로그인된 상태예요.',
  )
  // 서버 오류라 문의할 때 쓸 요청 번호도 보여준다.
  expect(screen.getByRole('alert')).toHaveTextContent(
    '문의할 때 이 번호를 알려 주세요: 2d6a6e90a9d04a16bb607aa43840f2d7',
  )
  expect(screen.getByRole('button', { name: '로그아웃' })).toBeEnabled()
  expect(router.state.location.pathname).toBe('/desk/dongtanpass')
  expect(queryClient.getQueryData(meQueryKey)).toEqual(staff)
  expect(queryClient.getQueryData(['billing', 'payments'])).toEqual([{ id: 1 }])
})

test('CSRF 토큰을 다시 받지 못해도 쿠키가 남아 있으면 로그아웃 요청은 보낸다', async () => {
  mockApi({
    'GET /api/v1/auth/csrf': () => problemResponse(500, {}),
    'POST /api/v1/auth/logout': noContent,
  })
  const { router } = renderApp('/desk/dongtanpass', { me: staff })

  await userEvent.click(await screen.findByRole('button', { name: '로그아웃' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  expect(requests()).toContain('POST /api/v1/auth/logout')
})

test('CSRF 쿠키가 없고 토큰도 받지 못하면, 토큰 요청의 실패를 요청 번호와 함께 알린다', async () => {
  mockApi({
    'GET /api/v1/auth/csrf': () =>
      problemResponse(500, { detail: '서버 오류', requestId: 'f3b1c2d4e5f60718293a4b5c6d7e8f90' }),
    'POST /api/v1/auth/logout': noContent,
  })
  const { router } = renderApp('/desk/dongtanpass', { me: staff })
  await screen.findByRole('button', { name: '로그아웃' })
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'

  await userEvent.click(screen.getByRole('button', { name: '로그아웃' }))

  // 토큰 없이 보내면 서버가 403으로 답해, 진짜 원인(토큰 요청의 서버 오류)의 번호가 어디에도 남지 않는다.
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('로그아웃하지 못했어요. 아직 로그인된 상태예요.')
  expect(alert).toHaveTextContent(
    '문의할 때 이 번호를 알려 주세요: f3b1c2d4e5f60718293a4b5c6d7e8f90',
  )
  expect(requests()).not.toContain('POST /api/v1/auth/logout')
  expect(router.state.location.pathname).toBe('/desk/dongtanpass')
})

test('로그아웃할 때 세션이 이미 없었어도(401) 로그아웃한 것으로 보고 로그인 화면으로 간다', async () => {
  mockApi({
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/logout': unauthenticated,
  })
  const { router, queryClient } = renderApp('/desk/dongtanpass', { me: staff })
  queryClient.setQueryData(['billing', 'payments'], [{ id: 1 }])

  await userEvent.click(await screen.findByRole('button', { name: '로그아웃' }))

  expect(await screen.findByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
  expect(queryClient.getQueryData(['billing', 'payments'])).toBeUndefined()
})

// ── 세션 만료 ────────────────────────────────────────────

test('쓰는 도중에 세션이 끊기면(401) 로그인 화면으로 보내고, 다시 로그인하면 보던 화면으로 돌아온다', async () => {
  mockApi({
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/login': () => jsonResponse(staff),
  })
  const { router, queryClient } = renderApp('/desk/dongtanpass', { me: staff })
  await screen.findByRole('navigation', { name: '직원 메뉴' })

  await failQuery(queryClient, sessionExpired())

  expect(await screen.findByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')

  await fillAndSubmit('desk1', 'correct-password')
  await waitFor(() => expect(router.state.location.pathname).toBe('/desk/dongtanpass'))
})

test('변경 요청이 401을 받아도 로그인 화면으로 보낸다', async () => {
  const { router, queryClient } = renderApp('/desk/dongtanpass', { me: staff })
  await screen.findByRole('navigation', { name: '직원 메뉴' })

  // 패스 사용 처리 같은 변경 요청이 세션 만료로 실패한 상황
  await new MutationObserver(queryClient, { mutationFn: () => Promise.reject(sessionExpired()) })
    .mutate()
    .catch(() => {})

  expect(await screen.findByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
})

test('세션이 끊긴 뒤 다른 사람이 로그인하면 앞사람이 받아 둔 자료를 쓰지 않는다', async () => {
  mockApi({
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/login': () => jsonResponse(partner),
  })
  const { router, queryClient } = renderApp('/desk/dongtanpass', { me: staff })
  queryClient.setQueryData(['billing', 'payments'], [{ id: 1 }])
  await screen.findByRole('navigation', { name: '직원 메뉴' })

  await failQuery(queryClient, sessionExpired())
  await fillAndSubmit('partner1', 'correct-password')

  expect(await screen.findByText('박연계')).toBeInTheDocument()
  expect(queryClient.getQueryData(['billing', 'payments'])).toBeUndefined()
  // 앞사람이 보던 화면은 볼 수 없는 계정이라 그 계정의 첫 화면으로 간다.
  expect(router.state.location.pathname).toBe('/partner/passes/new')
  expect(screen.queryByRole('heading', { name: '이 화면을 볼 권한이 없어요' })).toBeNull()
})

test.each([
  ['권한 없음(403)', new ApiError({ kind: 'http', status: 403 })],
  ['서버 오류(500)', new ApiError({ kind: 'http', status: 500 })],
  [
    '비밀번호 확인 실패(401 AUTH_INVALID_CREDENTIALS)',
    new ApiError({ kind: 'http', status: 401, problem: { code: 'AUTH_INVALID_CREDENTIALS' } }),
  ],
])('%s로는 로그아웃되지 않는다', async (_name, error) => {
  const { router, queryClient } = renderApp('/desk/dongtanpass', { me: staff })
  await screen.findByRole('navigation', { name: '직원 메뉴' })

  await failQuery(queryClient, error)

  // 화면이 다시 그려질 틈을 준 뒤에도 그대로인지 본다.
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(screen.getByRole('navigation', { name: '직원 메뉴' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '화면 준비 중이에요' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/desk/dongtanpass')
})
