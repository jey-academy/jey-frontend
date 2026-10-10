import { ApiError, type ProblemDetails } from './error'

// 개발 서버에서는 비워 두고 Vite 프록시(/api → localhost:8080)를 쓴다. 배포 환경에서만 값을 넣는다.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

const DEFAULT_TIMEOUT_MS = 10_000

// Spring Security 기본 이름. 백엔드 구현이 다르면 여기만 고친다.
const CSRF_COOKIE = 'XSRF-TOKEN'
const CSRF_HEADER = 'X-XSRF-TOKEN'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

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
  return found ? decodeURIComponent(found.slice(prefix.length)) : null
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

// 에러 응답이 Problem Details가 아닐 수도 있다(프록시 502의 HTML 등). 그때는 undefined.
async function readProblem(response: Response): Promise<ProblemDetails | undefined> {
  if (!response.headers.get('Content-Type')?.includes('json')) return undefined
  try {
    const body: unknown = await response.json()
    if (typeof body !== 'object' || body === null) return undefined
    const fields = body as Record<string, unknown>
    return {
      title: pickString(fields.title),
      detail: pickString(fields.detail),
      code: pickString(fields.code),
    }
  } catch {
    return undefined
  }
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  { query, headers, signal, timeoutMs = DEFAULT_TIMEOUT_MS }: RequestOptions = {},
): Promise<T> {
  const requestHeaders: Record<string, string> = { Accept: 'application/json', ...headers }
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json'
  if (!SAFE_METHODS.has(method)) {
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

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal: controller.signal,
    })
  } catch (error) {
    if (timedOut) throw new ApiError({ kind: 'timeout' })
    // 호출한 쪽이 취소한 경우는 실패가 아니므로 그대로 넘긴다.
    if (signal?.aborted) throw error
    throw new ApiError({ kind: 'network' })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abortFromCaller)
  }

  if (!response.ok) {
    throw new ApiError({
      kind: 'http',
      status: response.status,
      problem: await readProblem(response),
    })
  }

  // 204처럼 본문이 없는 응답은 undefined로 돌려준다.
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/**
 * 백엔드 호출 통로. 쿠키 전송, CSRF 헤더, 타임아웃, 에러 변환을 여기서 처리한다.
 * 실패하면 `ApiError`를 던진다.
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
