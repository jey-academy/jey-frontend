/** http: 서버가 에러 응답을 줌 · network: 서버에 닿지 못함 · timeout: 제한 시간 초과 */
export type ApiErrorKind = 'http' | 'network' | 'timeout'

/** 서버 에러 응답(RFC 9457 Problem Details)에서 쓰는 필드. `code`는 백엔드가 덧붙이는 에러 코드다. */
export type ProblemDetails = {
  title?: string
  detail?: string
  code?: string
}

type ApiErrorInit = {
  kind: ApiErrorKind
  status?: number
  problem?: ProblemDetails
}

const NETWORK_MESSAGE = '연결 상태를 확인해 주세요.'
const TIMEOUT_MESSAGE = '응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.'
const SERVER_MESSAGE = '일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'
const STATUS_MESSAGES: Record<number, string> = {
  401: '로그인이 필요해요.',
  403: '이 작업을 할 권한이 없어요.',
  404: '요청한 내용을 찾을 수 없어요.',
}

function toUserMessage({ kind, status, problem }: ApiErrorInit): string {
  if (kind === 'network') return NETWORK_MESSAGE
  if (kind === 'timeout') return TIMEOUT_MESSAGE
  return (
    problem?.detail ??
    problem?.title ??
    (status !== undefined ? STATUS_MESSAGES[status] : undefined) ??
    SERVER_MESSAGE
  )
}

/**
 * API 호출 실패를 나타내는 에러. `message`는 사용자에게 그대로 보여줄 수 있는 문구다.
 * 분기는 문구가 아니라 `status`나 `code`로 한다.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind
  /** HTTP 상태 코드. 서버에 닿지 못했으면 null. */
  readonly status: number | null
  readonly code: string | null

  constructor(init: ApiErrorInit) {
    super(toUserMessage(init))
    this.name = 'ApiError'
    this.kind = init.kind
    this.status = init.status ?? null
    this.code = init.problem?.code ?? null
  }
}

/**
 * 다시 시도해 볼 만한 에러인지. 4xx는 같은 요청을 다시 보내도 결과가 같으므로 재시도하지 않는다.
 * TanStack Query의 `retry` 옵션에서 쓴다.
 */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true
  return error.status === null || error.status >= 500
}
