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
    }
  } catch (error) {
    // JSON이 아닌 본문만 무시한다. 타임아웃·취소·연결 끊김은 위로 넘긴다.
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

// 서버는 429에 Retry-After를 초로 준다(예: 900). 날짜 형식이나 숫자가 아닌 값은 없는 것으로 본다.
function readRetryAfter(response: Response): number | undefined {
  const value = response.headers.get('Retry-After')?.trim() ?? ''
  return /^\d+$/.test(value) ? Number(value) : undefined
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
  if (method !== 'GET') {
    const csrfToken = readCookie(CSRF_COOKIE)
    if (csrfToken) requestHeaders[CSRF_HEADER] = csrfToken
  }

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

  // 본문을 다 읽을 때까지 타임아웃과 취소가 걸리도록, 본문 읽기도 try 안에서 한다.
  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: payload,
      credentials: 'include',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new ApiError({
        kind: 'http',
        status: response.status,
        problem: await readProblem(response),
        retryAfterSeconds: readRetryAfter(response),
      })
    }

    // 204처럼 본문이 없는 응답은 undefined로 돌려준다.
    const text = await response.text()
    if (!text) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      // 성공 응답인데 JSON이 아니다(주소가 틀려 HTML이 돌아온 경우 등). 본문 내용은 에러에 담지 않는다.
      throw new ApiError({ kind: 'parse', status: response.status })
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (timedOut) throw new ApiError({ kind: 'timeout', cause: error })
    // 호출한 쪽이 취소한 경우는 실패가 아니므로 그대로 넘긴다.
    if (signal?.aborted) throw error
    throw new ApiError({ kind: 'network', cause: error })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

/**
 * 백엔드 호출 통로. 쿠키 전송, CSRF 헤더, 타임아웃, 에러 변환을 여기서 처리한다.
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
