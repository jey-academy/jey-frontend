import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { tooManyRequests } from '@/test/mockApi'
import { api } from './client'
import { ApiError, isOutcomeUnknown, isRetryable } from './error'

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
  // 로그인한 브라우저처럼 CSRF 토큰 쿠키를 둔다. 없으면 변경 요청마다 토큰을 받으러 가는 요청이 먼저 나간다.
  document.cookie = 'XSRF-TOKEN=token'
})

const CSRF_URL = '/api/v1/auth/csrf'

/** 나간 요청들의 "메서드 주소". */
function calls() {
  return fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url)}`)
}

/**
 * 토큰을 받으러 온 요청에는 쿠키를 심고(`issued`가 null이면 심지 않는다), 나머지에는 `{}`로 답한다.
 * 실제 서버는 Set-Cookie로 심는다. jsdom의 fetch 흉내는 그 헤더를 쿠키로 옮기지 않아 직접 심는다.
 */
function issueCsrfCookie(issued: string | null) {
  fetchMock.mockImplementation(async (url) => {
    if (String(url) !== CSRF_URL) return jsonResponse({})
    if (issued !== null) document.cookie = `XSRF-TOKEN=${issued}`
    return new Response(null, { status: 204 })
  })
}

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

test('CSRF 쿠키가 있으면 토큰을 받으러 가지 않는다', async () => {
  issueCsrfCookie('other')

  await api.post('/api/v1/students/search', {})

  expect(calls()).toEqual(['POST /api/v1/students/search'])
})

test('CSRF 쿠키가 없으면 토큰을 먼저 받아 와 그 값을 헤더에 싣는다', async () => {
  clearCsrfCookie()
  issueCsrfCookie('fresh%2B1')

  await api.post('/api/v1/students/search', {})

  // 세션은 살아 있는데 토큰 쿠키만 없는 경우다. 그대로 보내면 403이다.
  expect(calls()).toEqual([`GET ${CSRF_URL}`, 'POST /api/v1/students/search'])
  expect(lastCall().headers.get('X-XSRF-TOKEN')).toBe('fresh+1')
  // 토큰을 받는 요청도 쿠키를 함께 보내야 서버가 심은 쿠키를 브라우저가 받는다.
  expect(fetchMock.mock.calls[0][1]?.credentials).toBe('include')
})

test('GET은 CSRF 쿠키가 없어도 토큰을 받으러 가지 않는다', async () => {
  clearCsrfCookie()
  issueCsrfCookie('fresh')

  await api.get('/api/v1/auth/me')

  expect(calls()).toEqual(['GET /api/v1/auth/me'])
})

test('동시에 나가는 변경 요청들은 토큰을 한 번만 받아 와 같은 값을 싣는다', async () => {
  clearCsrfCookie()
  // 받을 때마다 다른 토큰이 온다. 따로따로 받으면 먼저 읽은 요청의 토큰이 쿠키와 어긋난다.
  let issued = 0
  fetchMock.mockImplementation(async (url) => {
    if (String(url) !== CSRF_URL) return jsonResponse({})
    await Promise.resolve()
    document.cookie = `XSRF-TOKEN=token-${++issued}`
    return new Response(null, { status: 204 })
  })

  await Promise.all([api.post('/api/v1/a', {}), api.put('/api/v1/b', {}), api.delete('/api/v1/c')])

  expect(calls().filter((call) => call === `GET ${CSRF_URL}`)).toHaveLength(1)
  const sent = fetchMock.mock.calls
    .filter(([url]) => String(url) !== CSRF_URL)
    .map(([, init]) => new Headers(init?.headers).get('X-XSRF-TOKEN'))
  expect(sent).toEqual(['token-1', 'token-1', 'token-1'])
})

test('한 번 받아 오지 못했어도 다음 변경 요청에서 다시 받으러 간다', async () => {
  clearCsrfCookie()
  issueCsrfCookie(null)
  await api.post('/api/v1/a', {})

  issueCsrfCookie('later')
  await api.post('/api/v1/b', {})

  expect(calls()).toEqual([
    `GET ${CSRF_URL}`,
    'POST /api/v1/a',
    `GET ${CSRF_URL}`,
    'POST /api/v1/b',
  ])
  expect(lastCall().headers.get('X-XSRF-TOKEN')).toBe('later')
})

test('토큰 요청은 성공했는데 쿠키가 오지 않으면 헤더 없이 본 요청을 보내고, 그 결과를 돌려준다', async () => {
  clearCsrfCookie()
  fetchMock.mockImplementation(async (url) =>
    String(url) === CSRF_URL ? new Response(null, { status: 204 }) : jsonResponse({ ok: true }),
  )

  // 본 요청의 결과(실제 서버라면 403)가 화면에 보인다.
  await expect(api.post('/api/v1/students/search', {})).resolves.toEqual({ ok: true })

  expect(calls()).toEqual([`GET ${CSRF_URL}`, 'POST /api/v1/students/search'])
  expect(lastCall().headers.get('X-XSRF-TOKEN')).toBeNull()
})

test('토큰을 받으러 갔는데 서버 오류로 끝나면, 본 요청을 보내지 않고 그 오류를 요청 번호와 함께 던진다', async () => {
  clearCsrfCookie()
  fetchMock.mockImplementation(async (url) =>
    String(url) === CSRF_URL
      ? problemResponse(500, { detail: '서버 오류', requestId: 'req-csrf-failed' })
      : jsonResponse({ ok: true }),
  )

  // 토큰 없이 보내면 서버가 403으로 답해 "권한이 없어요"가 보이고, 진짜 원인의 번호는 남지 않는다.
  const error = await catchError(api.post('/api/v1/students/search', {}))

  expect(error.status).toBe(500)
  expect(error.requestId).toBe('req-csrf-failed')
  expect(calls()).toEqual([`GET ${CSRF_URL}`])
  // 본 요청은 보내지 않았다. 서버 오류(5xx)여도 "저장됐을 수도"로 보이면 안 된다.
  expect(error.notSent).toBe(true)
  expect(isOutcomeUnknown(error)).toBe(false)
})

test('토큰을 받으러 갔는데 연결이 끊기면, 본 요청을 보내지 않고 연결 오류를 던진다', async () => {
  clearCsrfCookie()
  fetchMock.mockImplementation(async (url) => {
    if (String(url) === CSRF_URL) throw new TypeError('Failed to fetch')
    return jsonResponse({ ok: true })
  })

  const error = await catchError(api.post('/api/v1/students/search', {}))

  expect(error.kind).toBe('network')
  expect(calls()).toEqual([`GET ${CSRF_URL}`])
  expect(error.notSent).toBe(true)
  expect(isOutcomeUnknown(error)).toBe(false)
})

test('토큰 요청이 실패한 뒤에도 다음 변경 요청에서 다시 받으러 가고, 받으면 본 요청을 보낸다', async () => {
  clearCsrfCookie()
  let csrfFails = true
  fetchMock.mockImplementation(async (url) => {
    if (String(url) !== CSRF_URL) return jsonResponse({ ok: true })
    if (csrfFails) return problemResponse(503, { detail: '점검 중' })
    document.cookie = 'XSRF-TOKEN=recovered'
    return new Response(null, { status: 204 })
  })
  await catchError(api.post('/api/v1/a', {}))

  csrfFails = false
  // 실패한 토큰 요청을 계속 붙들고 있으면, 화면을 새로 열 때까지 모든 변경 요청이 같은 옛 에러로 끝난다.
  await expect(api.post('/api/v1/a', {})).resolves.toEqual({ ok: true })

  expect(calls()).toEqual([`GET ${CSRF_URL}`, `GET ${CSRF_URL}`, 'POST /api/v1/a'])
  expect(lastCall().headers.get('X-XSRF-TOKEN')).toBe('recovered')
})

test('토큰을 기다리는 사이 호출한 쪽이 취소했으면, 토큰 요청이 실패해도 취소로 끝난다', async () => {
  clearCsrfCookie()
  const controller = new AbortController()
  fetchMock.mockImplementation(async (url) => {
    if (String(url) !== CSRF_URL) return jsonResponse({ ok: true })
    controller.abort()
    return problemResponse(500, { detail: '서버 오류' })
  })

  const result = api.post('/api/v1/students/search', {}, { signal: controller.signal })

  await expect(result).rejects.toHaveProperty('name', 'AbortError')
  expect(calls()).toEqual([`GET ${CSRF_URL}`])
})

test('본 요청이 서버에 닿지 못한 실패는 보낸 것으로 보고 결과를 알 수 없다고 본다', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

  const error = await catchError(api.post('/api/v1/a', {}))

  expect(error.notSent).toBe(false)
  expect(isOutcomeUnknown(error)).toBe(true)
})

test('토큰을 기다리던 변경 요청들은 토큰 요청이 실패하면 모두 그 오류를 받는다', async () => {
  clearCsrfCookie()
  let fail!: () => void
  fetchMock.mockImplementation(async (url) => {
    if (String(url) !== CSRF_URL) return jsonResponse({ ok: true })
    await new Promise<void>((resolve) => (fail = resolve))
    return problemResponse(503, { detail: '점검 중', requestId: 'req-csrf-shared' })
  })

  const first = catchError(api.post('/api/v1/a', {}))
  const second = catchError(api.put('/api/v1/b', {}))
  await vi.waitFor(() => expect(calls()).toEqual([`GET ${CSRF_URL}`]))
  fail()

  expect((await first).requestId).toBe('req-csrf-shared')
  expect((await second).requestId).toBe('req-csrf-shared')
  expect(calls()).toEqual([`GET ${CSRF_URL}`])
})

test('CSRF 쿠키 값이 깨져 있으면 없는 것으로 보고 새로 받아 온다', async () => {
  document.cookie = 'XSRF-TOKEN=%E0%A4%A'
  issueCsrfCookie('fresh')

  await api.post('/api/v1/dongtanpass/passes', {})

  expect(lastCall().headers.get('X-XSRF-TOKEN')).toBe('fresh')
})

test('토큰을 받는 동안 호출한 쪽이 취소하면 취소로 끝난다', async () => {
  clearCsrfCookie()
  const controller = new AbortController()
  fetchMock.mockImplementation(async (url, init) => {
    if (String(url) === CSRF_URL) {
      controller.abort()
      return new Response(null, { status: 204 })
    }
    // 실제 fetch처럼, 이미 취소된 signal로 부르면 거부한다.
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return jsonResponse({})
  })

  const result = api.post('/api/v1/students/search', {}, { signal: controller.signal })

  await expect(result).rejects.toHaveProperty('name', 'AbortError')
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
  // 서버는 길어야 3600을 준다. 하루까지는 받고, 넘으면 없는 것으로 본다.
  ['하루', '86400', 86400],
  ['하루를 넘는 값', '86401', null],
  ['숫자로 다 담지 못하는 긴 값', '9'.repeat(400), null],
])('429의 Retry-After(%s)를 초로 읽는다', async (_name, header, expected) => {
  fetchMock.mockResolvedValue(
    tooManyRequests({ detail: '요청이 너무 많습니다.', code: 'X_LIMITED' }, header),
  )

  const error = await catchError(api.post('/api/v1/students', {}))

  expect(error.status).toBe(429)
  expect(error.code).toBe('X_LIMITED')
  expect(error.retryAfterSeconds).toBe(expected)
})

// ── 요청 번호 ────────────────────────────────────────────

const BODY_ID = '2d6a6e90a9d04a16bb607aa43840f2d7'
const HEADER_ID = 'ffffffffffffffffffffffffffffffff'

function failed(body: Record<string, unknown> | null, headerId?: string) {
  return new Response(body === null ? '<html>Bad Gateway</html>' : JSON.stringify(body), {
    status: 500,
    headers: {
      'Content-Type': body === null ? 'text/html' : 'application/problem+json',
      ...(headerId === undefined ? {} : { 'X-Request-Id': headerId }),
    },
  })
}

test('오류 본문의 requestId를 읽는다. 헤더의 번호와 다르면 본문의 것을 쓴다', async () => {
  fetchMock.mockResolvedValue(failed({ detail: '서버 오류', requestId: BODY_ID }, HEADER_ID))

  const error = await catchError(api.post('/api/v1/students', {}))

  expect(error.requestId).toBe(BODY_ID)
})

test('본문에 번호가 없거나 본문을 읽지 못하면 X-Request-Id 헤더의 번호를 쓴다', async () => {
  fetchMock.mockResolvedValueOnce(failed({ detail: '서버 오류' }, HEADER_ID))
  expect((await catchError(api.get('/api/v1/students'))).requestId).toBe(HEADER_ID)

  fetchMock.mockResolvedValueOnce(failed(null, HEADER_ID))
  expect((await catchError(api.get('/api/v1/students'))).requestId).toBe(HEADER_ID)

  fetchMock.mockResolvedValueOnce(failed({ detail: '서버 오류' }))
  expect((await catchError(api.get('/api/v1/students'))).requestId).toBeNull()
})

test('성공 응답을 읽지 못한 에러에도 헤더의 번호를 담는다', async () => {
  fetchMock.mockResolvedValue(
    new Response('<!doctype html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html', 'X-Request-Id': HEADER_ID },
    }),
  )

  const error = await catchError(api.get('/api/v1/auth/me'))

  expect(error).toMatchObject({ kind: 'parse', requestId: HEADER_ID })
})

test.each([
  ['8자', 'abcd1234', 'abcd1234'],
  ['64자', 'a'.repeat(64), 'a'.repeat(64)],
  ['밑줄과 하이픈', 'req_2026-10-12', 'req_2026-10-12'],
  ['7자', 'abcd123', null],
  ['65자', 'a'.repeat(65), null],
  ['공백이 든 값', 'abcd 1234', null],
  ['태그가 든 값', '<b>abcd1234</b>', null],
  ['한글', '요청번호요청번호', null],
  ['숫자', 12345678, null],
  ['빈 값', '', null],
])('요청 번호는 정해진 모양(%s)일 때만 받는다', async (_name, value, expected) => {
  // 본문과 헤더 양쪽에 같은 규칙을 쓴다.
  fetchMock.mockResolvedValueOnce(failed({ detail: '서버 오류', requestId: value }))
  expect((await catchError(api.get('/api/v1/students'))).requestId).toBe(expected)

  // 헤더에 실을 수 없는 값(숫자, 빈 값, 한글)은 본문으로만 확인한다.
  if (typeof value === 'string' && value !== '' && /^[\x20-\x7e]+$/.test(value)) {
    fetchMock.mockResolvedValueOnce(failed({ detail: '서버 오류' }, value))
    expect((await catchError(api.get('/api/v1/students'))).requestId).toBe(expected)
  }
})

test('모양이 틀린 본문의 번호는 버리고 헤더의 번호를 쓴다', async () => {
  fetchMock.mockResolvedValue(failed({ detail: '서버 오류', requestId: '<script>' }, HEADER_ID))

  expect((await catchError(api.get('/api/v1/students'))).requestId).toBe(HEADER_ID)
})

test('요청에는 X-Request-Id를 싣지 않는다', async () => {
  fetchMock.mockResolvedValue(jsonResponse({}))

  await api.post('/api/v1/students', {})

  expect(lastCall().headers.get('X-Request-Id')).toBeNull()
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

test('헤더가 온 뒤 본문이 멈춰 시간 초과가 되어도 헤더의 요청 번호를 담는다', async () => {
  vi.useFakeTimers()
  fetchMock.mockImplementation(async (_url, init) => {
    const body = new ReadableStream({
      start(controller) {
        init!.signal!.addEventListener('abort', () =>
          controller.error(new DOMException('Aborted', 'AbortError')),
        )
      },
    })
    return new Response(body, {
      status: 500,
      headers: { 'Content-Type': 'application/problem+json', 'X-Request-Id': 'req-slow-body' },
    })
  })

  const pending = catchError(api.post('/api/v1/students/search', {}, { timeoutMs: 3_000 }))
  await vi.advanceTimersByTimeAsync(3_000)

  const error = await pending
  expect(error.kind).toBe('timeout')
  expect(error.requestId).toBe('req-slow-body')
})

test('본문을 읽다가 연결이 끊겨도 헤더의 요청 번호를 담는다', async () => {
  fetchMock.mockImplementation(async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.error(new TypeError('terminated'))
      },
    })
    return new Response(body, { headers: { 'X-Request-Id': 'req-cut-body' } })
  })

  const error = await catchError(api.get('/api/v1/auth/me'))
  expect(error.kind).toBe('network')
  expect(error.requestId).toBe('req-cut-body')
})

test('서버에 닿지 못한 연결 오류에는 요청 번호가 없다', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

  expect((await catchError(api.get('/api/v1/auth/me'))).requestId).toBeNull()
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

// ── 파일 내려받기 ──────────────────────────────────────────

function fileResponse(disposition?: string) {
  return new Response('a,b\n', {
    headers: {
      'Content-Type': 'text/csv',
      ...(disposition === undefined ? {} : { 'Content-Disposition': disposition }),
    },
  })
}

test('download: 쿠키를 싣고 모든 형식을 받는다고 보내, 본문을 Blob으로 이름과 함께 돌려준다', async () => {
  fetchMock.mockResolvedValueOnce(fileResponse('attachment; filename="passes.csv"'))

  const file = await api.download('/api/v1/files', { query: { from: '2026-10-01' } })

  expect(await file.blob.text()).toBe('a,b\n')
  expect(file.filename).toBe('passes.csv')
  const { url, init, headers } = lastCall()
  expect(url).toBe('/api/v1/files?from=2026-10-01')
  expect(init.method).toBe('GET')
  expect(init.credentials).toBe('include')
  expect(headers.get('Accept')).toBe('*/*')
})

test.each([
  ["attachment; filename*=UTF-8''%ED%8C%A8%EC%8A%A4.csv", '패스.csv'],
  ['attachment; filename="a.csv"; filename*=UTF-8\'\'b.csv', 'b.csv'],
  ['attachment; filename=plain.csv', 'plain.csv'],
  ['attachment; filename="../etc/passwd"', null],
  ["attachment; filename*=UTF-8''%E0%A4%A", null],
  ['attachment', null],
  [undefined, null],
])('download: Content-Disposition %s의 파일 이름은 %s', async (disposition, expected) => {
  fetchMock.mockResolvedValueOnce(fileResponse(disposition))

  const file = await api.download('/api/v1/files')

  expect(file.filename).toBe(expected)
})

test('download: 오류 응답은 다른 요청처럼 Problem Details를 읽은 ApiError다', async () => {
  fetchMock.mockResolvedValueOnce(
    problemResponse(400, {
      detail: '기간이 올바르지 않습니다.',
      code: 'DONGTANPASS_INVALID_PERIOD',
    }),
  )

  const error = await catchError(api.download('/api/v1/files'))

  expect(error.status).toBe(400)
  expect(error.code).toBe('DONGTANPASS_INVALID_PERIOD')
  expect(error.message).toBe('기간이 올바르지 않습니다.')
})
