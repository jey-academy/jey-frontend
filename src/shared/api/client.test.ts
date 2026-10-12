import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api } from './client'
import { ApiError, isRetryable } from './error'

const fetchMock = vi.fn<typeof fetch>()

const SERVER_MESSAGE = '일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function problemResponse(status: number, problem: Record<string, unknown>) {
  return new Response(JSON.stringify(problem), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

/** 마지막 fetch 호출의 URL과 옵션. 헤더는 구현이 객체든 Headers든 같은 방식으로 읽는다. */
function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!
  return { url, init: init!, headers: new Headers(init!.headers) }
}

async function catchError(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

function clearCsrfCookie() {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  clearCsrfCookie()
})

// ── 요청 만들기 ──────────────────────────────────────────

test('쿠키를 함께 보내고 JSON 응답을 돌려준다', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ name: '김도윤' }))

  const result = await api.get<{ name: string }>('/api/v1/auth/me')

  expect(result).toEqual({ name: '김도윤' })
  expect(lastCall().url).toBe('/api/v1/auth/me')
  expect(lastCall().init).toMatchObject({ method: 'GET', credentials: 'include' })
})

test('query는 쿼리 문자열로 붙이고 null·undefined는 뺀다', async () => {
  fetchMock.mockResolvedValue(jsonResponse([]))

  await api.get('/api/v1/dongtanpass/passes', {
    query: { status: 'VALID', page: 0, campus: undefined, keyword: null },
  })

  expect(lastCall().url).toBe('/api/v1/dongtanpass/passes?status=VALID&page=0')
})

test('query 값은 인코딩하고 false는 남긴다', async () => {
  fetchMock.mockResolvedValue(jsonResponse([]))

  await api.get('/api/v1/dongtanpass/passes', { query: { keyword: '김 도윤&a=b', used: false } })

  const params = new URL(String(lastCall().url), 'http://localhost').searchParams
  expect(params.get('keyword')).toBe('김 도윤&a=b')
  expect(params.get('used')).toBe('false')
})

test.each([
  ['끝에 /가 없는 주소', 'https://api.example.com'],
  ['끝에 /가 있는 주소', 'https://api.example.com/'],
])('VITE_API_BASE_URL이 있으면 경로 앞에 붙인다 (%s)', async (_label, baseUrl) => {
  // BASE_URL은 모듈을 불러올 때 정해지므로, 환경변수를 바꾼 뒤 모듈을 새로 불러온다.
  vi.stubEnv('VITE_API_BASE_URL', baseUrl)
  vi.resetModules()
  const { api: apiWithBaseUrl } = await import('./client')
  fetchMock.mockResolvedValue(jsonResponse({}))

  await apiWithBaseUrl.get('/api/v1/auth/me')

  expect(lastCall().url).toBe('https://api.example.com/api/v1/auth/me')
})

test('본문은 JSON으로 보낸다', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ id: 1 }))

  await api.post('/api/v1/dongtanpass/passes', { studentName: '김도윤' })

  expect(lastCall().init.body).toBe('{"studentName":"김도윤"}')
  expect(lastCall().headers.get('Content-Type')).toBe('application/json')
})

test('본문이 없으면 Content-Type을 붙이지 않는다', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

  await api.post('/api/v1/auth/logout')

  expect(lastCall().init.body).toBeUndefined()
  expect(lastCall().headers.get('Content-Type')).toBeNull()
})

test('호출한 쪽 헤더를 함께 보내되 CSRF 헤더는 덮어쓰지 못한다', async () => {
  document.cookie = 'XSRF-TOKEN=token'
  fetchMock.mockResolvedValue(jsonResponse({}))

  await api.post(
    '/api/v1/billing/payments',
    {},
    { headers: { 'Idempotency-Key': 'key-1', 'X-XSRF-TOKEN': 'forged' } },
  )

  expect(lastCall().headers.get('Accept')).toBe('application/json')
  expect(lastCall().headers.get('Idempotency-Key')).toBe('key-1')
  expect(lastCall().headers.get('X-XSRF-TOKEN')).toBe('token')
})

test('직렬화할 수 없는 본문은 network 에러로 바꾸지 않고 요청도 보내지 않는다', async () => {
  const circular: Record<string, unknown> = {}
  circular.self = circular

  const error: unknown = await api.post('/api/v1/dongtanpass/passes', circular).catch((e) => e)

  expect(error).toBeInstanceOf(TypeError)
  expect(error).not.toBeInstanceOf(ApiError)
  expect(fetchMock).not.toHaveBeenCalled()
})

// ── CSRF ────────────────────────────────────────────────

test('상태를 바꾸는 요청에는 CSRF 쿠키 값을 헤더로 복사한다', async () => {
  document.cookie = 'XSRF-TOKEN=abc%2B123'
  fetchMock.mockImplementation(async () => jsonResponse({}))

  await api.post('/api/v1/dongtanpass/passes', {})
  expect(lastCall().headers.get('X-XSRF-TOKEN')).toBe('abc+123')

  await api.get('/api/v1/dongtanpass/passes')
  expect(lastCall().headers.get('X-XSRF-TOKEN')).toBeNull()
})

test.each([
  ['PUT', () => api.put('/api/v1/dongtanpass/passes/1', { a: 1 })],
  ['PATCH', () => api.patch('/api/v1/dongtanpass/passes/1', { a: 1 })],
  ['DELETE', () => api.delete('/api/v1/dongtanpass/passes/1')],
])('%s 요청에도 CSRF 헤더를 붙인다', async (method, call) => {
  document.cookie = 'XSRF-TOKEN=token'
  fetchMock.mockResolvedValue(jsonResponse({}))

  await call()

  expect(lastCall().init.method).toBe(method)
  expect(lastCall().headers.get('X-XSRF-TOKEN')).toBe('token')
})

test('CSRF 쿠키가 없으면 헤더를 붙이지 않는다', async () => {
  fetchMock.mockResolvedValue(jsonResponse({}))

  await api.post('/api/v1/dongtanpass/passes', {})

  expect(lastCall().headers.get('X-XSRF-TOKEN')).toBeNull()
})

test('CSRF 쿠키 값이 깨져 있으면 헤더 없이 보낸다', async () => {
  document.cookie = 'XSRF-TOKEN=%E0%A4%A'
  fetchMock.mockResolvedValue(jsonResponse({}))

  await api.post('/api/v1/dongtanpass/passes', {})

  expect(lastCall().headers.get('X-XSRF-TOKEN')).toBeNull()
})

// ── 응답 읽기 ────────────────────────────────────────────

test('본문이 없는 응답(204)은 undefined를 돌려준다', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

  await expect(api.post('/api/v1/auth/logout')).resolves.toBeUndefined()
})

test('성공 응답 본문이 JSON이 아니면 parse 에러로 바꾸고 본문 내용은 담지 않는다', async () => {
  fetchMock.mockResolvedValue(
    new Response('<!doctype html><title>JEY</title>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }),
  )

  const error = await catchError(api.get('/api/v1/auth/me'))

  expect(error).toMatchObject({ kind: 'parse', status: 200, code: null, message: SERVER_MESSAGE })
  expect(error.cause).toBeUndefined()
  expect(isRetryable(error)).toBe(false)
})

// ── 에러 응답 ────────────────────────────────────────────

test('Problem Details의 detail을 사용자 메시지로 쓴다', async () => {
  fetchMock.mockResolvedValue(
    problemResponse(409, {
      title: 'Conflict',
      detail: '이미 사용한 패스예요.',
      code: 'DONGTANPASS_PASS_ALREADY_USED',
    }),
  )

  const error = await catchError(api.post('/api/v1/dongtanpass/passes/1/redeem'))

  expect(error).toMatchObject({
    kind: 'http',
    status: 409,
    code: 'DONGTANPASS_PASS_ALREADY_USED',
    message: '이미 사용한 패스예요.',
  })
})

test('검증 실패의 필드별 오류를 fieldErrors에 담고, 모양이 틀린 항목은 버린다', async () => {
  fetchMock.mockResolvedValue(
    problemResponse(400, {
      detail: '입력값이 올바르지 않습니다.',
      code: 'COMMON_VALIDATION_FAILED',
      errors: [
        { field: 'name', message: '공백일 수 없습니다' },
        { field: null, message: '수강료와 교재비를 확인해 주세요.' },
        { field: 'baseFee8' },
        { field: 'bookFee', message: 42 },
        '문자열',
        null,
      ],
    }),
  )

  const error = await catchError(api.post('/api/v1/classes', {}))

  expect(error.fieldErrors).toEqual([
    { field: 'name', message: '공백일 수 없습니다' },
    { field: null, message: '수강료와 교재비를 확인해 주세요.' },
  ])
})

test.each([
  ['errors가 없을 때', { detail: '없는 지점입니다.' }],
  ['errors가 배열이 아닐 때', { detail: '없는 지점입니다.', errors: '오류' }],
])('%s fieldErrors는 빈 배열이다', async (_name, problem) => {
  fetchMock.mockResolvedValue(problemResponse(400, problem))

  expect((await catchError(api.post('/api/v1/classes', {}))).fieldErrors).toEqual([])
})

test.each([
  ['초로 온 값', '900', 900],
  ['앞뒤 공백이 붙은 값', ' 60 ', 60],
  ['0', '0', 0],
  ['헤더가 없을 때', undefined, null],
  // 표준은 날짜도 허용하지만 서버는 초로만 준다. 읽지 못하는 값은 없는 것으로 본다.
  ['날짜로 온 값', 'Wed, 21 Oct 2026 07:28:00 GMT', null],
  ['숫자가 아닌 값', 'soon', null],
  ['소수', '1.5', null],
  ['음수', '-5', null],
  ['빈 값', '', null],
])('429의 Retry-After(%s)를 초로 읽는다', async (_name, header, expected) => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ detail: '요청이 너무 많습니다.', code: 'X_LIMITED' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/problem+json',
        ...(header === undefined ? {} : { 'Retry-After': header }),
      },
    }),
  )

  const error = await catchError(api.post('/api/v1/students', {}))

  expect(error.status).toBe(429)
  expect(error.code).toBe('X_LIMITED')
  expect(error.retryAfterSeconds).toBe(expected)
})

test('서버에 닿지 못한 에러에는 Retry-After가 없다', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

  expect((await catchError(api.get('/api/v1/auth/me'))).retryAfterSeconds).toBeNull()
})

test('detail이 없으면 영어 title 대신 상태 코드에 맞는 한국어 문구를 쓴다', async () => {
  fetchMock.mockResolvedValueOnce(problemResponse(404, { title: 'Not Found' }))
  const notFound = await catchError(api.get('/api/v1/dongtanpass/passes/1'))
  expect(notFound.message).toBe('요청한 내용을 찾을 수 없어요.')
  expect(notFound.code).toBeNull()

  fetchMock.mockResolvedValueOnce(problemResponse(400, { title: 'Bad Request', detail: '' }))
  expect((await catchError(api.post('/api/v1/dongtanpass/passes', {}))).message).toBe(
    SERVER_MESSAGE,
  )
})

test('Problem Details 형식이 아닌 에러 응답은 상태 코드에 맞는 기본 문구를 쓴다', async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
  expect((await catchError(api.get('/api/v1/auth/me'))).message).toBe('로그인이 필요해요.')

  fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Forbidden' }, { status: 403 }))
  expect((await catchError(api.get('/api/v1/auth/me'))).message).toBe('이 작업을 할 권한이 없어요.')

  fetchMock.mockResolvedValueOnce(jsonResponse(['배열'], { status: 500 }))
  expect((await catchError(api.get('/api/v1/auth/me'))).message).toBe(SERVER_MESSAGE)

  fetchMock.mockResolvedValueOnce(
    new Response('<html>Bad Gateway</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    }),
  )
  const error = await catchError(api.get('/api/v1/auth/me'))
  expect(error.status).toBe(502)
  expect(error.message).toBe(SERVER_MESSAGE)
})

test('에러 응답의 JSON이 깨져 있어도 상태 코드는 유지한다', async () => {
  fetchMock.mockResolvedValue(
    new Response('{broken', { status: 400, headers: { 'Content-Type': 'application/json' } }),
  )

  const error = await catchError(api.post('/api/v1/dongtanpass/passes', {}))

  expect(error).toMatchObject({ kind: 'http', status: 400 })
})

// ── 네트워크, 타임아웃, 취소 ──────────────────────────────

test('서버에 닿지 못하면 연결 상태 안내로 바꾸고 원인을 cause에 담는다', async () => {
  const cause = new TypeError('Failed to fetch')
  fetchMock.mockRejectedValue(cause)

  const error = await catchError(api.get('/api/v1/auth/me'))

  expect(error).toMatchObject({
    kind: 'network',
    status: null,
    message: '연결 상태를 확인해 주세요.',
  })
  expect(error.cause).toBe(cause)
})

/** signal이 취소될 때까지 끝나지 않는 fetch (헤더도 오지 않는 상황) */
function hangUntilAborted() {
  fetchMock.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        const abort = () => reject(new DOMException('Aborted', 'AbortError'))
        if (init!.signal!.aborted) abort()
        init!.signal!.addEventListener('abort', abort)
      }),
  )
}

/** 헤더는 바로 오지만 본문이 signal 취소 전까지 끝나지 않는 fetch */
function hangBodyUntilAborted() {
  fetchMock.mockImplementation(async (_url, init) => {
    const body = new ReadableStream({
      start(controller) {
        init!.signal!.addEventListener('abort', () =>
          controller.error(new DOMException('Aborted', 'AbortError')),
        )
      },
    })
    return new Response(body, { headers: { 'Content-Type': 'application/json' } })
  })
}

test('제한 시간이 지나면 요청을 끊고 timeout 에러를 던진다', async () => {
  vi.useFakeTimers()
  hangUntilAborted()

  const pending = catchError(api.get('/api/v1/auth/me', { timeoutMs: 3_000 }))
  await vi.advanceTimersByTimeAsync(3_000)

  expect((await pending).kind).toBe('timeout')
})

test('timeoutMs를 주지 않으면 10초 뒤에 끊는다', async () => {
  vi.useFakeTimers()
  hangUntilAborted()
  let settled = false
  const pending = catchError(api.get('/api/v1/auth/me')).finally(() => {
    settled = true
  })

  await vi.advanceTimersByTimeAsync(9_999)
  expect(settled).toBe(false)

  await vi.advanceTimersByTimeAsync(1)
  expect((await pending).kind).toBe('timeout')
})

test('헤더가 온 뒤 본문이 멈춰도 제한 시간이 지나면 timeout 에러를 던진다', async () => {
  vi.useFakeTimers()
  hangBodyUntilAborted()

  const pending = catchError(api.get('/api/v1/auth/me', { timeoutMs: 3_000 }))
  await vi.advanceTimersByTimeAsync(3_000)

  expect((await pending).kind).toBe('timeout')
})

test('본문을 읽다가 연결이 끊기면 network 에러로 바꾼다', async () => {
  fetchMock.mockImplementation(async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.error(new TypeError('terminated'))
      },
    })
    return new Response(body)
  })

  expect((await catchError(api.get('/api/v1/auth/me'))).kind).toBe('network')
})

test('요청이 끝나면 타이머를 남기지 않는다', async () => {
  vi.useFakeTimers()
  fetchMock.mockResolvedValue(jsonResponse({}))

  await api.get('/api/v1/auth/me')

  expect(vi.getTimerCount()).toBe(0)
})

test('호출한 쪽이 취소하면 ApiError로 바꾸지 않고 그대로 넘긴다', async () => {
  hangUntilAborted()
  const controller = new AbortController()

  const pending = api.get('/api/v1/auth/me', { signal: controller.signal })
  controller.abort()

  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  await expect(pending).rejects.not.toBeInstanceOf(ApiError)
})

test('본문을 읽는 중에 호출한 쪽이 취소해도 요청을 끊는다', async () => {
  hangBodyUntilAborted()
  const controller = new AbortController()

  const pending = api.get('/api/v1/auth/me', { signal: controller.signal })
  // fetch가 응답을 돌려주고 본문 읽기가 시작될 때까지 기다린다.
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
  await Promise.resolve()
  controller.abort()

  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
})

test('이미 취소된 signal이면 요청을 바로 끊는다', async () => {
  hangUntilAborted()

  const pending = api.get('/api/v1/auth/me', { signal: AbortSignal.abort() })

  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
})

// ── 재시도 판단 ──────────────────────────────────────────

test('isRetryable: 서버에 닿지 못했거나 5xx일 때만 재시도한다', () => {
  expect(isRetryable(new ApiError({ kind: 'network' }))).toBe(true)
  expect(isRetryable(new ApiError({ kind: 'http', status: 500 }))).toBe(true)
  expect(isRetryable(new ApiError({ kind: 'http', status: 503 }))).toBe(true)

  expect(isRetryable(new ApiError({ kind: 'http', status: 400 }))).toBe(false)
  expect(isRetryable(new ApiError({ kind: 'http', status: 404 }))).toBe(false)
  expect(isRetryable(new ApiError({ kind: 'http', status: 499 }))).toBe(false)
  expect(isRetryable(new ApiError({ kind: 'timeout' }))).toBe(false)
  expect(isRetryable(new ApiError({ kind: 'parse', status: 200 }))).toBe(false)
  expect(isRetryable(new Error('코드 오류'))).toBe(false)
})
