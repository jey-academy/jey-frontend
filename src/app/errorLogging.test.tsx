import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { ApiError } from '@/shared/api'
import { createErrorLogging, logRequestError } from './errorLogging'
import { RouteErrorPage } from './pages/RouteErrorPage'
import { createQueryClient } from './queryClient'

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
  vi.unstubAllEnvs()
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

// ── 실패한 API 요청 ─────────────────────────────────────────────

test('예상하지 못한 API 오류는 종류·상태 코드·에러 코드·요청 번호 한 줄로 남기고 문구는 남기지 않는다', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  logRequestError(
    new ApiError({
      kind: 'http',
      status: 500,
      problem: {
        detail: '김도윤 학생을 저장하지 못했습니다.',
        code: 'COMMON_INTERNAL_ERROR',
        requestId: '2d6a6e90a9d04a16bb607aa43840f2d7',
      },
    }),
  )

  expect(consoleError).toHaveBeenCalledExactlyOnceWith(
    '[API 에러] ApiError http 500 COMMON_INTERNAL_ERROR 2d6a6e90a9d04a16bb607aa43840f2d7',
  )
  expect(printed(consoleError)).not.toContain('김도윤')
})

test.each([
  [
    '사용자가 고칠 수 있는 오류',
    new ApiError({
      kind: 'http',
      status: 409,
      problem: {
        code: 'CAMPUS_CLASS_NAME_DUPLICATED',
        requestId: '2d6a6e90a9d04a16bb607aa43840f2d7',
      },
    }),
  ],
  ['번호가 없는 서버 오류', new ApiError({ kind: 'http', status: 500 })],
  ['연결 실패', new ApiError({ kind: 'network' })],
])('%s는 API 에러로 남기지 않는다', (_name, error) => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  logRequestError(error)

  expect(consoleError).not.toHaveBeenCalled()
})

// ── 화면 코드의 버그로 난 에러 ──────────────────────────────────

test('배포 환경에서 API 오류가 아닌 에러는 종류 한 줄로 남긴다. 문구와 스택은 남기지 않는다', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  // 저장(변경 요청)에서 난 에러. 캐시 키가 없어 종류만 남는다.
  logRequestError(new TypeError(SECRET_MESSAGE), { isDev: false })

  expect(consoleError).toHaveBeenCalledExactlyOnceWith('[코드 에러] TypeError')
  expect(printed(consoleError)).not.toContain('5521')
})

test.each([
  ['목록', ['students', 'list', { name: '김도윤', page: 0 }], 'students/list'],
  ['상세', ['students', 'detail', 9], 'students/detail'],
  ['청구 단건', ['billing', 'invoices', 'detail', 501], 'billing/invoices'],
  ['장부 미반영', ['billing', 'ledger-sync', { page: 0 }], 'billing/ledger-sync'],
  ['두 마디짜리 키', ['auth', 'me'], 'auth/me'],
  ['조건이 뒤에 붙은 키', ['audit-logs', 'list', { actorId: 2 }], 'audit-logs/list'],
])(
  '배포 환경에서 조회의 코드 에러(%s)는 어느 조회인지 이름으로 남긴다',
  (_name, queryKey, source) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    logRequestError(new TypeError('x is not a function'), { queryKey, isDev: false })

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(`[코드 에러] TypeError @ ${source}`)
    expect(printed(consoleError)).not.toContain('김도윤')
  },
)

// 키를 그대로 찍지 않는다. 아는 이름이 아니면 값일 수 있다.
test.each([
  ['토큰이 둘째 마디', ['pass', SECRET_TOKEN]],
  ['전화번호 뒷자리가 둘째 마디', ['find', '4821']],
  ['검색어가 둘째 마디', ['students', '김도윤']],
  ['아는 이름 뒤가 아니라 앞에 값', ['김도윤', 'list']],
  ['모르는 이름', ['billing', 'nothing']],
  ['한 마디짜리 키', ['students']],
  ['둘째 마디가 숫자', ['students', 9, 'detail']],
  ['첫 마디가 객체', [{ name: '김도윤' }, 'list']],
  ['빈 키', []],
  // 글자로 바꾸면 아는 이름과 같아지는 값도 이름으로 치지 않는다. 마디가 문자열일 때만 본다.
  ['둘째 마디가 배열', ['students', ['list']]],
  // 객체의 기본 속성 이름과 겹쳐도 아는 이름으로 치지 않는다.
  ['기본 속성 이름', ['constructor', 'prototype']],
])('배포 환경에서 아는 조회가 아니면(%s) 종류만 남긴다', (_name, queryKey) => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  logRequestError(new TypeError('x is not a function'), { queryKey, isDev: false })

  expect(consoleError).toHaveBeenCalledExactlyOnceWith('[코드 에러] TypeError')
})

test('배포 환경에서 Error가 아닌 값이 던져져도 값 자체는 남기지 않는다(요청)', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  logRequestError('010-5521-4821', { isDev: false })

  expect(consoleError).toHaveBeenCalledExactlyOnceWith('[코드 에러] string')
})

test('개발 서버에서는 원인을 볼 수 있게 코드 에러를 그대로 남긴다', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const error = new TypeError('x is not a function')

  logRequestError(error, { queryKey: ['students', 'list'], isDev: true })

  // 스택이 있어야 어디서 났는지 찾는다.
  expect(consoleError).toHaveBeenCalledExactlyOnceWith(error)
})

test('API 오류는 개발 서버에서도 한 줄로 남긴다. 어느 조회인지는 요청 번호로 찾는다', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  logRequestError(
    new ApiError({
      kind: 'http',
      status: 500,
      problem: { code: 'COMMON_INTERNAL_ERROR', requestId: '2d6a6e90a9d04a16bb607aa43840f2d7' },
    }),
    { queryKey: ['students', 'list'], isDev: true },
  )

  expect(consoleError).toHaveBeenCalledExactlyOnceWith(
    '[API 에러] ApiError http 500 COMMON_INTERNAL_ERROR 2d6a6e90a9d04a16bb607aa43840f2d7',
  )
})

// ── QueryClient와의 연결 ────────────────────────────────────────

test('조회의 코드 에러는 QueryClient가 어느 조회인지와 함께 남긴다. 키의 조건(이름)은 남기지 않는다', async () => {
  vi.stubEnv('DEV', false)
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const client = createQueryClient()

  await client
    .fetchQuery({
      queryKey: ['students', 'list', { name: '김도윤', page: 0 }],
      queryFn: () => {
        throw new TypeError(SECRET_MESSAGE)
      },
    })
    .catch(() => {})

  // 코드 에러는 다시 보내지 않는다. 한 번만 남는다.
  expect(consoleError).toHaveBeenCalledExactlyOnceWith('[코드 에러] TypeError @ students/list')
  expect(printed(consoleError)).not.toContain('김도윤')
})

test('저장에 성공한 뒤 화면 코드에서 난 에러도 QueryClient가 남긴다. 요청에 실은 값은 남기지 않는다', async () => {
  vi.stubEnv('DEV', false)
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const client = createQueryClient()
  const saved = vi.fn<(body: { password: string }) => Promise<string>>(async () => 'saved')
  const mutation = client.getMutationCache().build(client, {
    mutationFn: saved,
    // 서버에는 저장됐다. 그 뒤 응답을 다루는 화면 코드가 깨졌다.
    onSuccess: () => {
      throw new TypeError(SECRET_MESSAGE)
    },
  })

  await mutation.execute({ password: 'first-password-1' }).catch(() => {})

  expect(saved).toHaveBeenCalledOnce()
  expect(consoleError).toHaveBeenCalledExactlyOnceWith('[코드 에러] TypeError')
  expect(printed(consoleError)).not.toContain('first-password-1')
})

test('개발 서버에서는 QueryClient가 코드 에러를 그대로 남긴다', async () => {
  vi.stubEnv('DEV', true)
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const client = createQueryClient()
  const error = new TypeError('x is not a function')

  await client
    .fetchQuery({
      queryKey: ['students', 'list'],
      queryFn: () => {
        throw error
      },
    })
    .catch(() => {})

  expect(consoleError).toHaveBeenCalledExactlyOnceWith(error)
})

// 화면을 옮기거나 조건을 바꾸면 진행 중인 조회가 취소된다. 버그가 아니다.
// 지금은 TanStack Query가 취소를 onError로 넘기지 않아 남지 않는다. 라이브러리를 올렸을 때 달라지면 여기서 걸린다.
test.each([
  ['받아 둔 값이 없을 때 취소', false, 'cancel'],
  ['받아 둔 값이 있을 때 취소', true, 'cancel'],
  ['조회를 지움', false, 'remove'],
] as const)('조회를 취소한 것(%s)은 코드 에러로 남기지 않는다', async (_name, cached, how) => {
  vi.stubEnv('DEV', false)
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const client = createQueryClient()
  const queryKey = ['students', 'list', { page: 0 }]
  if (cached) client.setQueryData(queryKey, { items: [] })
  // 앱의 조회처럼, 취소되면 AbortError로 끝난다(shared/api/client.ts).
  const fetching = client
    .fetchQuery({
      queryKey,
      staleTime: 0,
      queryFn: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          )
        }),
    })
    .catch(() => {})

  if (how === 'cancel') await client.cancelQueries({ queryKey })
  else client.removeQueries({ queryKey })
  await fetching

  expect(consoleError).not.toHaveBeenCalled()
})

// ── 아무도 잡지 않은 에러 ───────────────────────────────────────

/** 브라우저가 잡히지 않은 Promise 거부를 알릴 때 보내는 이벤트. jsdom에는 전용 생성자가 없어 값만 붙인다. */
function rejectionEvent(reason: unknown) {
  return Object.assign(new Event('unhandledrejection', { cancelable: true }), { reason })
}

/** 브라우저가 잡히지 않은 에러를 알릴 때 보내는 이벤트. 브라우저는 문구와 파일 이름(주소일 수 있다)도 싣는다. */
function errorEvent(error: unknown, message = SECRET_MESSAGE) {
  return new ErrorEvent('error', {
    cancelable: true,
    error,
    message,
    filename: `https://jey.example/p/${SECRET_TOKEN}`,
    lineno: 12,
  })
}

/** 받기를 건다. 대상은 테스트마다 새로 만든다(다른 테스트로 새지 않게). */
function watch(isDev: boolean) {
  const target = new EventTarget() as unknown as Window
  const stop = createErrorLogging(isDev).watchUncaught(target)
  return { target, stop }
}

test('배포 환경에서 잡히지 않은 Promise 거부는 브라우저의 출력을 막고 종류 한 줄만 남긴다', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { target } = watch(false)
  const event = rejectionEvent(new TypeError(SECRET_MESSAGE))

  target.dispatchEvent(event)

  // 막지 않으면 브라우저가 "Uncaught (in promise)"로 문구와 스택을 통째로 찍는다.
  expect(event.defaultPrevented).toBe(true)
  expect(consoleError).toHaveBeenCalledExactlyOnceWith('[잡히지 않은 에러] TypeError')
  expect(printed(consoleError)).not.toContain('5521')
})

test('배포 환경에서 잡히지 않은 에러는 브라우저의 출력을 막고 종류 한 줄만 남긴다. 문구와 파일 이름은 남기지 않는다', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { target } = watch(false)
  const event = errorEvent(new RangeError(SECRET_MESSAGE))

  target.dispatchEvent(event)

  expect(event.defaultPrevented).toBe(true)
  expect(consoleError).toHaveBeenCalledExactlyOnceWith('[잡히지 않은 에러] RangeError')
  const output = printed(consoleError)
  expect(output).not.toContain('5521')
  // 파일 이름이 지금 페이지의 주소일 수 있다. 주소에는 패스 토큰이 들어간다.
  expect(output).not.toContain(SECRET_TOKEN)
})

test('배포 환경에서 잡히지 않은 API 오류는 다른 기록과 같은 모양으로 남긴다. 서버 문구는 남기지 않는다', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { target } = watch(false)

  target.dispatchEvent(
    rejectionEvent(
      new ApiError({
        kind: 'http',
        status: 409,
        problem: {
          detail: '김도윤 학생은 이미 등록돼 있습니다.',
          code: 'MEMBER_STUDENT_DUPLICATED',
          requestId: '2d6a6e90a9d04a16bb607aa43840f2d7',
        },
      }),
    ),
  )

  expect(consoleError).toHaveBeenCalledExactlyOnceWith(
    '[잡히지 않은 에러] ApiError http 409 MEMBER_STUDENT_DUPLICATED 2d6a6e90a9d04a16bb607aa43840f2d7',
  )
  expect(printed(consoleError)).not.toContain('김도윤')
})

test.each([
  ['문자열', '010-5521-4821', 'string'],
  ['객체', { phone: '010-5521-4821' }, 'object'],
  ['숫자', 5521, 'number'],
])(
  '배포 환경에서 Error가 아닌 값(%s)으로 거부돼도 값 자체는 남기지 않는다',
  (_name, reason, kind) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { target } = watch(false)

    target.dispatchEvent(rejectionEvent(reason))

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(`[잡히지 않은 에러] ${kind}`)
    expect(printed(consoleError)).not.toContain('5521')
  },
)

test.each([
  ['거부', () => rejectionEvent(undefined)],
  // 다른 출처의 스크립트에서 난 에러. 브라우저가 "Script error."만 주고 에러는 주지 않는다.
  ['에러', () => errorEvent(null, 'Script error.')],
])('배포 환경에서 던져진 값이 없는 %s도 한 줄로 남긴다', (_name, make) => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { target } = watch(false)
  const event = make()

  target.dispatchEvent(event)

  expect(event.defaultPrevented).toBe(true)
  expect(consoleError).toHaveBeenCalledExactlyOnceWith('[잡히지 않은 에러] 내용 없음')
})

test('개발 서버에서는 잡히지 않은 에러를 건드리지 않는다. 브라우저가 문구와 스택을 그대로 찍는다', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { target } = watch(true)
  const rejected = rejectionEvent(new TypeError('x is not a function'))
  const thrown = errorEvent(new TypeError('x is not a function'))

  target.dispatchEvent(rejected)
  target.dispatchEvent(thrown)

  // 막으면 개발 중에 원인을 볼 수 없다.
  expect(rejected.defaultPrevented).toBe(false)
  expect(thrown.defaultPrevented).toBe(false)
  expect(consoleError).not.toHaveBeenCalled()
})

test('받기를 그만두면 그 뒤의 에러는 건드리지 않는다', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { target, stop } = watch(false)

  stop()
  const rejected = rejectionEvent(new TypeError('x is not a function'))
  const thrown = errorEvent(new TypeError('x is not a function'))
  target.dispatchEvent(rejected)
  target.dispatchEvent(thrown)

  expect(rejected.defaultPrevented).toBe(false)
  expect(thrown.defaultPrevented).toBe(false)
  expect(consoleError).not.toHaveBeenCalled()
})

test('대상을 주지 않으면 window에서 받는다', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const stop = createErrorLogging(false).watchUncaught()
  try {
    const event = rejectionEvent(new TypeError('x is not a function'))

    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(consoleError).toHaveBeenCalledExactlyOnceWith('[잡히지 않은 에러] TypeError')
  } finally {
    stop()
  }
})
