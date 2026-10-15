import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { onlineManager } from '@tanstack/react-query'
import { expect, test, vi } from 'vitest'
import { PASSWORD_RULE_HINT, type Me } from '@/shared/auth'
import {
  jsonResponse,
  mockApi,
  noContent,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
  tooManyRequests,
  unauthenticated,
} from '@/test/mockApi'
import { admin, partner, renderApp, staff } from '@/test/renderApp'

setupMockApi()

const PATH = '/account/password'
const CHANGE = 'POST /api/v1/auth/password'
const CURRENT = 'old-password-1'
const NEXT = 'new-password-2'
const CHANGED = '비밀번호를 바꿨어요. 이 계정으로 로그인된 다른 기기는 로그아웃됐어요.'

// 아이디가 열 자가 넘는 직원. 아이디를 그대로 비밀번호로 쓰는 경우를 볼 때 쓴다.
const dongtan: Me = { ...staff, loginId: 'desk.dongtan' }

function count(key: string) {
  return requests().filter((request) => request === key).length
}

function current() {
  return screen.getByLabelText('지금 비밀번호')
}

function next() {
  return screen.getByLabelText('새 비밀번호')
}

async function fill(input: HTMLElement, value: string) {
  await userEvent.clear(input)
  if (value) await userEvent.type(input, value)
}

async function fillBoth(currentPassword = CURRENT, newPassword = NEXT) {
  await screen.findByRole('heading', { level: 1, name: '비밀번호 변경' })
  await fill(current(), currentPassword)
  await fill(next(), newPassword)
}

function submit() {
  return userEvent.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }))
}

/** 비밀번호를 너무 많이 틀렸다는 답. retryAfter를 주면 실제 서버처럼 Retry-After(초)를 싣는다. */
function tooMany(retryAfter?: string) {
  return tooManyRequests(
    { detail: '비밀번호를 너무 많이 틀렸습니다.', code: 'AUTH_TOO_MANY_PASSWORD_ATTEMPTS' },
    retryAfter,
  )
}

// ── 들어가기 ─────────────────────────────────────────────

test.each([
  ['직원', staff, '/desk/students', 'POST /api/v1/students/search'],
  ['관리자', admin, '/admin/audit-logs', 'GET /api/v1/audit-logs'],
])('%s는 상단 바의 비밀번호 변경으로 들어온다', async (_name, me, from, list) => {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse([]),
    'GET /api/v1/classes': () => jsonResponse([]),
    [list]: () => jsonResponse({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
  })
  const { router } = renderApp(from, { me })

  await userEvent.click(await screen.findByRole('link', { name: '비밀번호 변경' }))

  expect(
    await screen.findByRole('heading', { level: 1, name: '비밀번호 변경' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe(PATH)
  // 누구의 비밀번호를 바꾸는지 보여준다.
  expect(
    screen.getByText(`${me.name}(${me.loginId}) 계정의 비밀번호를 바꿔요.`),
  ).toBeInTheDocument()
})

test('연계 학원도 이 화면을 쓸 수 있다', async () => {
  renderApp(PATH, { me: partner })

  expect(
    await screen.findByRole('heading', { level: 1, name: '비밀번호 변경' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '비밀번호 변경' })).toHaveAttribute('href', PATH)
})

test('로그인하지 않았으면 로그인 화면으로 보낸다', async () => {
  const { router } = renderApp(PATH, { me: null })

  expect(await screen.findByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument()
  expect(router.state.location.state).toEqual({ from: PATH })
})

test('두 칸은 가려져 있고, 브라우저가 지금 비밀번호와 새 비밀번호를 구분하게 알린다', async () => {
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '비밀번호 변경' })

  expect(current()).toHaveAttribute('type', 'password')
  expect(current()).toHaveAttribute('autocomplete', 'current-password')
  expect(next()).toHaveAttribute('type', 'password')
  expect(next()).toHaveAttribute('autocomplete', 'new-password')
  // 규칙은 칸 밑에 미리 적혀 있다.
  expect(next()).toHaveAccessibleDescription(PASSWORD_RULE_HINT)
  // 비밀번호 관리 프로그램이 어느 계정의 것인지 알게 하는, 보이지 않는 아이디 칸
  const username = document.querySelector('input[autocomplete="username"]')
  expect(username).toHaveValue(staff.loginId)
  expect(username).not.toBeVisible()
})

// ── 바꾸기 ───────────────────────────────────────────────

test('바꾸면 두 비밀번호를 보내고, 이 화면에 남아 바꿨다고 알리고 칸을 비운다', async () => {
  mockApi({ [CHANGE]: () => noContent() })
  const { router, queryClient } = renderApp(PATH, { me: staff })
  await fillBoth()

  await submit()

  expect(await screen.findByRole('status')).toHaveTextContent(CHANGED)
  const request = requestOf(CHANGE)
  expect(request.body).toEqual({ currentPassword: CURRENT, newPassword: NEXT })
  expect(request.headers.get('Idempotency-Key')).toBeNull()
  // 로그인 화면으로 보내지 않는다. 이 브라우저는 로그인된 채로 남는다.
  expect(router.state.location.pathname).toBe(PATH)
  expect(queryClient.getQueryData(['auth', 'me'])).toEqual(staff)
  // 입력한 비밀번호는 화면에도, 요청 기록에도, 주소에도 남지 않는다.
  expect(current()).toHaveValue('')
  expect(next()).toHaveValue('')
  await waitFor(() => expect(queryClient.getMutationCache().getAll()).toEqual([]))
  const cached = JSON.stringify(
    queryClient
      .getQueryCache()
      .getAll()
      .map((query) => [query.queryKey, query.state.data]),
  )
  expect(cached).not.toContain(NEXT)
  expect(JSON.stringify(router.state.location)).not.toContain(NEXT)
})

test('앞뒤 공백을 떼지 않고 입력한 그대로 보낸다', async () => {
  mockApi({ [CHANGE]: () => noContent() })
  renderApp(PATH, { me: staff })
  await fillBoth(' old-password-1', 'new password 22 ')

  await submit()

  await screen.findByRole('status')
  expect(requestOf(CHANGE).body).toEqual({
    currentPassword: ' old-password-1',
    newPassword: 'new password 22 ',
  })
})

test('바꿨다는 안내는 다시 내면 지운다', async () => {
  mockApi({ [CHANGE]: () => noContent() })
  renderApp(PATH, { me: staff })
  await fillBoth()
  await submit()
  await screen.findByRole('status')

  // 칸이 비어 있어 보내지 않는다.
  await submit()

  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(current()).toHaveAccessibleDescription('지금 비밀번호를 입력해 주세요.')
  expect(count(CHANGE)).toBe(1)
})

// ── 보내기 전에 확인 ─────────────────────────────────────

test.each([
  ['지금 비밀번호가 비었으면', '', NEXT, '지금 비밀번호', '지금 비밀번호를 입력해 주세요.'],
  ['새 비밀번호가 비었으면', CURRENT, '', '새 비밀번호', '비밀번호를 입력해 주세요.'],
  [
    '새 비밀번호가 공백을 빼고 열 자가 안 되면',
    CURRENT,
    'abc def gh1',
    '새 비밀번호',
    '공백을 빼고 10자 이상으로 입력해 주세요.',
  ],
  [
    '새 비밀번호가 대소문자만 다른 내 아이디면',
    CURRENT,
    'Desk.Dongtan',
    '새 비밀번호',
    '아이디와 같은 비밀번호는 쓸 수 없어요.',
  ],
  [
    '새 비밀번호가 지금 비밀번호와 같으면',
    CURRENT,
    CURRENT,
    '새 비밀번호',
    '지금 비밀번호와 다른 비밀번호를 입력해 주세요.',
  ],
])(
  '%s 그 칸에 알리고 보내지 않는다',
  async (_name, currentPassword, newPassword, label, message) => {
    renderApp(PATH, { me: dongtan })
    await fillBoth(currentPassword, newPassword)

    await submit()

    expect(screen.getByLabelText(label)).toHaveAccessibleDescription(message)
    // 보내면 지금 비밀번호를 틀린 횟수에 들 수 있다.
    expect(count(CHANGE)).toBe(0)
  },
)

// ── 서버가 거부할 때 ─────────────────────────────────────

test.each([
  ['AUTH_CURRENT_PASSWORD_MISMATCH', '지금 비밀번호가 일치하지 않습니다.', '지금 비밀번호'],
  ['AUTH_PASSWORD_UNCHANGED', '지금 비밀번호와 다른 비밀번호여야 합니다.', '새 비밀번호'],
  ['AUTH_PASSWORD_NOT_ACCEPTABLE', '사용할 수 없는 비밀번호입니다.', '새 비밀번호'],
])('%s는 서버 문구를 그 칸에 보여주고 입력을 남긴다', async (code, detail, label) => {
  mockApi({ [CHANGE]: () => problemResponse(400, { detail, code }) })
  const { router } = renderApp(PATH, { me: staff })
  await fillBoth()

  await submit()

  await waitFor(() => expect(screen.getByLabelText(label)).toHaveAccessibleDescription(detail))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  // 틀린 칸만 고쳐 다시 낼 수 있다.
  expect(current()).toHaveValue(CURRENT)
  expect(next()).toHaveValue(NEXT)
  expect(screen.getByRole('button', { name: '비밀번호 바꾸기' })).toBeEnabled()
  // 지금 비밀번호가 틀렸다는 답은 로그인이 풀렸다는 뜻이 아니다.
  expect(router.state.location.pathname).toBe(PATH)
})

test('서버가 칸을 짚어 거부하면 그 칸에 보여준다', async () => {
  mockApi({
    [CHANGE]: () =>
      problemResponse(400, {
        detail: '입력값이 올바르지 않습니다.',
        code: 'COMMON_VALIDATION_FAILED',
        errors: [{ field: 'newPassword', message: '100자 이하여야 합니다' }],
      }),
  })
  renderApp(PATH, { me: staff })
  await fillBoth()

  await submit()

  await waitFor(() => expect(next()).toHaveAccessibleDescription('100자 이하여야 합니다'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test.each([
  ['900', '약 15분 뒤'],
  ['61', '약 2분 뒤'],
  [undefined, '잠시 뒤'],
])(
  '지금 비밀번호를 여러 번 틀려 잠기면(Retry-After: %s) %s에 다시 하라고 알린다',
  async (retryAfter, phrase) => {
    mockApi({ [CHANGE]: () => tooMany(retryAfter) })
    renderApp(PATH, { me: staff })
    await fillBoth()

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `지금 비밀번호를 여러 번 틀렸어요. ${phrase}에 다시 시도해 주세요. 그동안은 맞는 비밀번호로도 바꿀 수 없어요.`,
    )
    // 입력이 틀린 것이 아니다. 칸에 표시하지 않는다.
    expect(current()).not.toBeInvalid()
    expect(next()).not.toBeInvalid()
  },
)

test('서버 오류가 떠 있어도, 고쳐서 다시 냈을 때 보내지 않았으면 지난 서버 오류는 지운다', async () => {
  mockApi({
    [CHANGE]: () =>
      problemResponse(400, {
        detail: '지금 비밀번호가 일치하지 않습니다.',
        code: 'AUTH_CURRENT_PASSWORD_MISMATCH',
      }),
  })
  renderApp(PATH, { me: staff })
  await fillBoth()
  await submit()
  await waitFor(() => expect(current()).toBeInvalid())

  // 지금 비밀번호는 고쳤는데 새 비밀번호를 지웠다. 보내지 않는다.
  await fill(current(), 'another-old-1')
  await fill(next(), '')
  await submit()

  expect(next()).toHaveAccessibleDescription('비밀번호를 입력해 주세요.')
  expect(current()).not.toBeInvalid()
  expect(count(CHANGE)).toBe(1)
})

// ── 응답을 받지 못했을 때, 보내는 동안 ───────────────────

test('응답을 받지 못하면 바뀌었을 수도 있다고 알리고, 다시 로그인하게 되면 새 비밀번호부터 써 보라고 한다', async () => {
  mockApi({
    [CHANGE]: () => {
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: staff })
  await fillBoth()

  await submit()

  // 바뀌었다면 이 브라우저는 새 세션을 받지 못해 곧 로그아웃된다.
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '연결 상태를 확인해 주세요. 바뀌었을 수도 있어요. 다시 로그인하라고 나오면 새 비밀번호로 먼저 로그인해 보세요.',
  )
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(current()).toHaveValue(CURRENT)
})

test('바꾸는 동안에는 입력을 고치거나 다시 누를 수 없다. 실패하면 풀린다', async () => {
  let respond!: (response: Response) => void
  mockApi({ [CHANGE]: () => new Promise<Response>((resolve) => (respond = resolve)) })
  renderApp(PATH, { me: staff })
  await fillBoth()

  await submit()

  expect(await screen.findByRole('button', { name: '바꾸는 중' })).toBeDisabled()
  expect(current()).toBeDisabled()
  expect(next()).toBeDisabled()
  expect(count(CHANGE)).toBe(1)

  respond(
    problemResponse(400, {
      detail: '지금 비밀번호가 일치하지 않습니다.',
      code: 'AUTH_CURRENT_PASSWORD_MISMATCH',
    }),
  )

  expect(await screen.findByRole('button', { name: '비밀번호 바꾸기' })).toBeEnabled()
  expect(current()).toBeEnabled()
  expect(next()).toHaveValue(NEXT)
})

test('오프라인이어도 바로 시도해 실패를 알린다. "바꾸는 중"으로 잠긴 채 멈추지 않는다', async () => {
  mockApi({
    [CHANGE]: () => {
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: staff })
  await fillBoth()
  // 브라우저가 오프라인이라고 알린 상태. 기본 설정이면 요청을 보내지 않고 연결이 돌아올 때까지 기다린다.
  onlineManager.setOnline(false)
  try {
    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('연결 상태를 확인해 주세요.')
    expect(screen.getByRole('button', { name: '비밀번호 바꾸기' })).toBeEnabled()
  } finally {
    onlineManager.setOnline(true)
  }
})

test('바꾸는 동안 세션이 끊기면(401) 로그인 화면으로 보낸다', async () => {
  mockApi({ [CHANGE]: unauthenticated })
  const { router } = renderApp(PATH, { me: staff })
  await fillBoth()

  await submit()

  expect(await screen.findByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument()
  expect(router.state.location.state).toEqual({ from: PATH })
})

test('실패한 뒤 화면을 떠나면 요청에 실은 비밀번호가 캐시에 남지 않는다', async () => {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse([]),
    'GET /api/v1/classes': () => jsonResponse([]),
    'POST /api/v1/students/search': () =>
      jsonResponse({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
    [CHANGE]: () =>
      problemResponse(400, {
        detail: '사용할 수 없는 비밀번호입니다.',
        code: 'AUTH_PASSWORD_NOT_ACCEPTABLE',
      }),
  })
  const { queryClient } = renderApp(PATH, { me: staff })
  await fillBoth()
  await submit()
  await waitFor(() => expect(next()).toBeInvalid())

  await userEvent.click(screen.getByRole('link', { name: '학생' }))

  await screen.findByRole('heading', { level: 1, name: '학생' })
  await waitFor(() => expect(queryClient.getMutationCache().getAll()).toEqual([]))
})

// ── 서버 오류, 고쳐서 다시 내기, 보기 상태 ───────────────

test('서버 오류(5xx)면 바뀌었을 수도 있다고 알리고 요청 번호를 보여준다. 콘솔에는 비밀번호를 남기지 않는다', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  mockApi({
    [CHANGE]: () =>
      problemResponse(500, {
        detail: '서버 오류',
        code: 'COMMON_INTERNAL_ERROR',
        requestId: '2d6a6e90a9d04a16bb607aa43840f2d7',
      }),
  })
  renderApp(PATH, { me: staff })
  await fillBoth()

  await submit()

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(
    '서버 오류 바뀌었을 수도 있어요. 다시 로그인하라고 나오면 새 비밀번호로 먼저 로그인해 보세요.',
  )
  expect(alert).toHaveTextContent(
    '문의할 때 이 번호를 알려 주세요: 2d6a6e90a9d04a16bb607aa43840f2d7',
  )
  expect(current()).toHaveValue(CURRENT)
  expect(next()).toHaveValue(NEXT)
  // 서버 오류는 콘솔에 한 줄을 남긴다. 거기에 요청에 실은 비밀번호가 딸려 가면 안 된다.
  expect(consoleError).toHaveBeenCalled()
  const printed = JSON.stringify([...consoleError.mock.calls, ...consoleWarn.mock.calls])
  expect(printed).toContain('2d6a6e90a9d04a16bb607aa43840f2d7')
  expect(printed).not.toContain(CURRENT)
  expect(printed).not.toContain(NEXT)
})

test('보내기 전에 걸린 오류를 고쳐 다시 내면, 지난 오류는 지우고 보낸다', async () => {
  mockApi({ [CHANGE]: () => noContent() })
  renderApp(PATH, { me: staff })
  await fillBoth('', NEXT)
  await submit()
  expect(current()).toBeInvalid()

  await fill(current(), CURRENT)
  await submit()

  expect(await screen.findByRole('status')).toHaveTextContent(CHANGED)
  expect(count(CHANGE)).toBe(1)
  // 지난 오류가 남으면 성공했는데도 칸이 틀린 것처럼 보이고, 다음에 서버가 준 오류도 가린다.
  expect(current()).not.toBeInvalid()
  expect(next()).not.toBeInvalid()
})

test('보기로 열어 둔 채 바꾸면, 바꾼 뒤에는 두 칸이 다시 가려진다', async () => {
  mockApi({ [CHANGE]: () => noContent() })
  renderApp(PATH, { me: staff })
  await fillBoth()
  await userEvent.click(screen.getByRole('button', { name: '지금 비밀번호 보기' }))
  await userEvent.click(screen.getByRole('button', { name: '새 비밀번호 보기' }))
  expect(next()).toHaveAttribute('type', 'text')

  await submit()

  await screen.findByRole('status')
  // 값만 비우고 열린 채로 두면, 이어서 치는 비밀번호가 그대로 보인다.
  expect(current()).toHaveAttribute('type', 'password')
  expect(next()).toHaveAttribute('type', 'password')
  expect(screen.getByRole('button', { name: '새 비밀번호 보기' })).toBeInTheDocument()
})

test('실패했을 때는 보기로 열어 둔 칸이 그대로다. 친 값을 보며 고칠 수 있다', async () => {
  mockApi({
    [CHANGE]: () =>
      problemResponse(400, {
        detail: '사용할 수 없는 비밀번호입니다.',
        code: 'AUTH_PASSWORD_NOT_ACCEPTABLE',
      }),
  })
  renderApp(PATH, { me: staff })
  await fillBoth()
  await userEvent.click(screen.getByRole('button', { name: '새 비밀번호 보기' }))

  await submit()

  await waitFor(() => expect(next()).toBeInvalid())
  expect(next()).toHaveAttribute('type', 'text')
  expect(next()).toHaveValue(NEXT)
})

test('/account로 들어오면 비밀번호 변경 화면으로 보낸다', async () => {
  const { router } = renderApp('/account', { me: staff })

  expect(
    await screen.findByRole('heading', { level: 1, name: '비밀번호 변경' }),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe(PATH)
})
