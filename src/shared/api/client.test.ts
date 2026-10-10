import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api } from './client'
import { ApiError, isRetryable } from './error'

const fetchMock = vi.fn<typeof fetch>()

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

/** 마지막 fetch 호출의 URL과 옵션 */
function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!
  return { url, init: init!, headers: init!.headers as Record<string, string> }
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
  vi.useRealTimers()
  clearCsrfCookie()
})

test('쿠키를 함께 보내고 JSON 응답을 돌려준다', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ name: '김도윤' }))

  const result = await api.get<{ name: string }>('/api/v1/auth/me')

  expect(result).toEqual({ name: '김도윤' })
  expect(lastCall().url).toBe('/api/v1/auth/me')
  expect(lastCall().init).toMatchObject({ method: 'GET', credentials: 'include' })
})

test('query는 쿼리 문자열로 붙이고 빈 값은 뺀다', async () => {
  fetchMock.mockResolvedValue(jsonResponse([]))

  await api.get('/api/v1/gopass/passes', {
    query: { status: 'VALID', page: 0, campus: undefined, keyword: null },
  })

  expect(lastCall().url).toBe('/api/v1/gopass/passes?status=VALID&page=0')
})

test('본문은 JSON으로 보낸다', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ id: 1 }))

  await api.post('/api/v1/gopass/passes', { studentName: '김도윤' })

  expect(lastCall().init.body).toBe('{"studentName":"김도윤"}')
  expect(lastCall().headers['Content-Type']).toBe('application/json')
})

test('상태를 바꾸는 요청에는 CSRF 쿠키 값을 헤더로 복사한다', async () => {
  document.cookie = 'XSRF-TOKEN=abc%2B123'
  fetchMock.mockImplementation(async () => jsonResponse({}))

  await api.post('/api/v1/gopass/passes', {})
  expect(lastCall().headers['X-XSRF-TOKEN']).toBe('abc+123')

  await api.get('/api/v1/gopass/passes')
  expect(lastCall().headers).not.toHaveProperty('X-XSRF-TOKEN')
})

test('CSRF 쿠키가 없으면 헤더를 붙이지 않는다', async () => {
  fetchMock.mockResolvedValue(jsonResponse({}))

  await api.delete('/api/v1/gopass/passes/1')

  expect(lastCall().headers).not.toHaveProperty('X-XSRF-TOKEN')
})

test('본문이 없는 응답(204)은 undefined를 돌려준다', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

  await expect(api.post('/api/v1/auth/logout')).resolves.toBeUndefined()
})

test('Problem Details의 detail을 사용자 메시지로 쓴다', async () => {
  fetchMock.mockResolvedValue(
    problemResponse(409, {
      title: '이미 사용한 패스',
      detail: '이미 사용한 패스예요.',
      code: 'GOPASS_ALREADY_USED',
    }),
  )

  const error = await catchError(api.post('/api/v1/gopass/passes/1/redeem'))

  expect(error).toMatchObject({
    kind: 'http',
    status: 409,
    code: 'GOPASS_ALREADY_USED',
    message: '이미 사용한 패스예요.',
  })
})

test('detail이 없으면 title을 쓴다', async () => {
  fetchMock.mockResolvedValue(problemResponse(400, { title: '입력값을 확인해 주세요.' }))

  const error = await catchError(api.post('/api/v1/gopass/passes', {}))

  expect(error.message).toBe('입력값을 확인해 주세요.')
  expect(error.code).toBeNull()
})

test('Problem Details가 아닌 에러 응답은 상태 코드에 맞는 기본 문구를 쓴다', async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))
  expect((await catchError(api.get('/api/v1/auth/me'))).message).toBe('로그인이 필요해요.')

  fetchMock.mockResolvedValueOnce(
    new Response('<html>Bad Gateway</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    }),
  )
  const error = await catchError(api.get('/api/v1/auth/me'))
  expect(error.status).toBe(502)
  expect(error.message).toBe('일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.')
})

test('서버에 닿지 못하면 연결 상태 안내로 바꾼다', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

  const error = await catchError(api.get('/api/v1/auth/me'))

  expect(error).toMatchObject({ kind: 'network', status: null, message: '연결 상태를 확인해 주세요.' })
})

/** signal이 취소될 때까지 끝나지 않는 fetch */
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

test('제한 시간이 지나면 요청을 끊고 timeout 에러를 던진다', async () => {
  vi.useFakeTimers()
  hangUntilAborted()

  const pending = catchError(api.get('/api/v1/auth/me', { timeoutMs: 3_000 }))
  await vi.advanceTimersByTimeAsync(3_000)

  expect((await pending).kind).toBe('timeout')
})

test('호출한 쪽이 취소하면 ApiError로 바꾸지 않고 그대로 넘긴다', async () => {
  hangUntilAborted()
  const controller = new AbortController()

  const pending = api.get('/api/v1/auth/me', { signal: controller.signal })
  controller.abort()

  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  await expect(pending).rejects.not.toBeInstanceOf(ApiError)
})

test('isRetryable: 4xx만 재시도하지 않는다', () => {
  expect(isRetryable(new ApiError({ kind: 'http', status: 404 }))).toBe(false)
  expect(isRetryable(new ApiError({ kind: 'http', status: 503 }))).toBe(true)
  expect(isRetryable(new ApiError({ kind: 'network' }))).toBe(true)
  expect(isRetryable(new ApiError({ kind: 'timeout' }))).toBe(true)
  expect(isRetryable(new Error('알 수 없는 에러'))).toBe(true)
})
