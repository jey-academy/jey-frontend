import { ApiError, type FieldError, type ProblemDetails } from './error'

// 개발 서버에서는 비워 두고 Vite 프록시(/api → localhost:8080)를 쓴다. 배포 환경에서만 값을 넣는다.
// 끝의 /는 뗀다. 경로가 //api/... 가 되면 백엔드가 요청을 거부한다.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

const DEFAULT_TIMEOUT_MS = 10_000

// Spring Security 기본 이름. 백엔드 구현이 다르면 여기만 고친다.
const CSRF_COOKIE = 'XSRF-TOKEN'
const CSRF_HEADER = 'X-XSRF-TOKEN'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type QueryValue = string | number | boolean | null | undefined

export type RequestOptions = {
  query?: Record<string, QueryValue>
  headers?: Record<string, string>
  /** 호출한 쪽에서 요청을 취소할 때 쓴다. TanStack Query가 queryFn에 넘겨주는 signal을 그대로 넣으면 된다. */
  signal?: AbortSignal
  timeoutMs?: number
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) params.set(key, String(value))
  }
  const search = params.toString()
  return `${BASE_URL}${path}${search ? `?${search}` : ''}`
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`
  const found = document.cookie.split('; ').find((cookie) => cookie.startsWith(prefix))
  if (!found) return null
  try {
    return decodeURIComponent(found.slice(prefix.length))
  } catch {
    // 값이 깨진 쿠키는 없는 것으로 본다. 서버가 403으로 답한다.
    return null
  }
}

// 응답에 실려 오는 요청 번호. 읽기만 하고 요청에는 싣지 않는다. 번호는 서버(또는 앞단의 프록시)가 정한다.
// 다른 출처에서 실으면 CORS 사전 요청에서 막힌다. 서버 자체는 모양이 맞는 값을 그대로 쓰므로(백엔드 ADR-0028),
// 같은 출처인 개발 서버에서 실으면 화면이 고른 값이 서버 로그에 남는다.
const REQUEST_ID_HEADER = 'X-Request-Id'

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

// 모양이 맞는 항목만 남긴다. 서버가 준 문구는 그대로 화면에 보여주므로 문자열인지 확인한다.
function pickFieldErrors(value: unknown): FieldError[] | undefined {
  if (!Array.isArray(value)) return undefined
  const errors: FieldError[] = []
  for (const item of value as unknown[]) {
    if (typeof item !== 'object' || item === null) continue
    const { field, message } = item as Record<string, unknown>
    const text = pickString(message)
    if (text) errors.push({ field: pickString(field) ?? null, message: text })
  }
  return errors.length > 0 ? errors : undefined
}

// 에러 응답이 Problem Details가 아닐 수도 있다(프록시 502의 HTML 등). 그때는 undefined.
async function readProblem(response: Response): Promise<ProblemDetails | undefined> {
  if (!response.headers.get('Content-Type')?.includes('json')) return undefined
  try {
    const body: unknown = await response.json()
    if (typeof body !== 'object' || body === null) return undefined
    const fields = body as Record<string, unknown>
    return {
      detail: pickString(fields.detail),
      code: pickString(fields.code),
      errors: pickFieldErrors(fields.errors),
      requestId: pickRequestId(fields.requestId),
    }
  } catch (error) {
    // JSON이 아닌 본문만 무시한다. 타임아웃·취소·연결 끊김은 위로 넘긴다.
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

// 서버가 요청에 붙이는 번호의 모양(영문자·숫자·_·- 8~64자, 백엔드 ADR-0028과 같은 규칙). 서버가 만든 것은 16진수 32자다.
// 받은 글자를 화면과 콘솔에 그대로 남기므로(app/errorLogging.ts) 이 모양이 아닌 값은 없는 것으로 본다.
// 서버가 아닌 곳(프록시, 잘못된 주소)의 응답에는 무엇이든 실려 올 수 있다. 백엔드가 모양을 바꾸면 여기도 고친다.
function pickRequestId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : undefined
}

// 서버가 주는 값보다 넉넉한 상한(하루). 서버는 길어야 1시간(3600)을 준다.
const MAX_RETRY_AFTER_SECONDS = 86_400

// 서버는 429에 Retry-After를 초(정수)로 준다(예: 900). 그 꼴이 아닌 값(날짜, 소수, 음수)은 없는 것으로 본다.
// 터무니없이 큰 값도 없는 것으로 본다. 그대로 쓰면 "약 Infinity분 뒤" 같은 안내가 된다.
function readRetryAfter(response: Response): number | undefined {
  const value = response.headers.get('Retry-After')?.trim() ?? ''
  if (!/^\d+$/.test(value)) return undefined
  const seconds = Number(value)
  return seconds <= MAX_RETRY_AFTER_SECONDS ? seconds : undefined
}

// 토큰 쿠키를 받아 오는 중인 요청. 동시에 나가는 요청들이 같이 기다린다.
// 따로따로 받으면 서버가 저마다 다른 토큰을 내려, 먼저 읽은 요청의 토큰이 쿠키와 어긋난다.
let csrfCookieFetch: Promise<void> | null = null

/**
 * CSRF 토큰 쿠키를 서버에서 받아 온 뒤 읽는다(GET /auth/csrf, 백엔드 ADR-0019). 변경 요청을 보내려는데 쿠키가 없을 때 쓴다.
 * 토큰 쿠키는 보통 로그인 때 받은 것이 있다. 세션은 살아 있는데 토큰 쿠키만 없는 경우를 위한 것이다
 * (두 쿠키는 따로 놓여 한쪽만 사라질 수 있다). 그대로 보내면 403이다.
 * 화면을 새로 열면 서버가 내 정보(/auth/me)의 응답에 쿠키를 다시 주므로, 화면을 열어 둔 채 사라진 경우에만 여기에 온다.
 * 요청이 실패하면 그 에러를 던진다(기다리던 요청들이 모두 같은 에러를 받는다). 토큰 없이 본 요청을 보내면 서버가 반드시 403으로
 * 답해 "권한이 없어요"가 보이고, 진짜 원인(시간 초과, 서버 오류)과 그 요청 번호는 어디에도 남지 않는다.
 * 요청은 성공했는데 쿠키가 오지 않았으면 null이다. 그때는 본 요청의 결과(403)가 화면에 보인다.
 */
async function fetchCsrfToken(): Promise<string | null> {
  csrfCookieFetch ??= request<void>('GET', '/api/v1/auth/csrf', undefined).finally(() => {
    csrfCookieFetch = null
  })
  await csrfCookieFetch
  return readCookie(CSRF_COOKIE)
}

async function request<T>(
  method: Method,
  path: string,
  body: unknown,
  { query, headers, signal, timeoutMs = DEFAULT_TIMEOUT_MS }: RequestOptions = {},
): Promise<T> {
  // 주소와 본문은 try 밖에서 만든다. 여기서 나는 에러는 코드 오류라서 network 에러로 바꾸면 안 된다.
  const url = buildUrl(path, query)
  const payload = body === undefined ? undefined : JSON.stringify(body)

  const requestHeaders: Record<string, string> = { Accept: 'application/json', ...headers }
  if (payload !== undefined) requestHeaders['Content-Type'] = 'application/json'

  // 타임아웃과 호출한 쪽의 취소를 하나의 signal로 합친다.
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abortFromCaller = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', abortFromCaller)

  // 응답 헤더의 요청 번호. 헤더를 받은 뒤 본문을 읽다 끊겨도(시간 초과, 연결 끊김) 이 번호는 에러에 싣는다.
  let headerRequestId: string | undefined

  // 본문을 다 읽을 때까지 타임아웃과 취소가 걸리도록, 본문 읽기도 try 안에서 한다.
  try {
    if (method !== 'GET') {
      // 쿠키에 있으면 기다리지 않고 바로 보낸다. 받으러 갔다가 실패하면 그 에러가 그대로 나간다(fetchCsrfToken).
      const csrfToken = readCookie(CSRF_COOKIE) ?? (await fetchCsrfToken())
      // 요청은 됐는데 쿠키가 오지 않았으면 싣지 않고 보낸다. 서버가 403으로 답한다.
      if (csrfToken) requestHeaders[CSRF_HEADER] = csrfToken
    }
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: payload,
      credentials: 'include',
      signal: controller.signal,
    })
    headerRequestId = pickRequestId(response.headers.get(REQUEST_ID_HEADER))

    if (!response.ok) {
      throw new ApiError({
        kind: 'http',
        status: response.status,
        problem: await readProblem(response),
        retryAfterSeconds: readRetryAfter(response),
        // 본문에 번호가 없어도(본문이 Problem Details가 아니거나 비어 있는 오류) 헤더에는 있을 수 있다.
        // 본문의 번호가 있으면 그쪽을 쓴다(ApiError).
        headerRequestId,
      })
    }

    // 204처럼 본문이 없는 응답은 undefined로 돌려준다.
    const text = await response.text()
    if (!text) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      // 성공 응답인데 JSON이 아니다(주소가 틀려 HTML이 돌아온 경우 등). 본문 내용은 에러에 담지 않는다.
      throw new ApiError({
        kind: 'parse',
        status: response.status,
        // 성공 응답의 본문에는 번호가 없다. 헤더에서만 읽는다.
        headerRequestId,
      })
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (timedOut) throw new ApiError({ kind: 'timeout', cause: error, headerRequestId })
    // 호출한 쪽이 취소한 경우는 실패가 아니므로 그대로 넘긴다.
    if (signal?.aborted) throw error
    throw new ApiError({ kind: 'network', cause: error, headerRequestId })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

/**
 * 백엔드 호출 통로. 쿠키 전송, CSRF 헤더(토큰 쿠키가 없으면 받아 온다), 타임아웃, 에러 변환을 여기서 처리한다.
 * 실패하면 `ApiError`를 던진다. 단, 호출한 쪽이 `signal`로 취소하면 AbortError가 그대로 나간다.
 * 본문은 JSON으로만 보낸다.
 */
export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, options),
}
