/**
 * http: 서버가 에러 응답을 줌 · network: 서버에 닿지 못함 · timeout: 제한 시간 초과
 * parse: 성공 응답인데 본문을 읽을 수 없음(JSON이 아님)
 */
export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'parse'

/** 입력값 검증에 걸린 항목 하나. `field`는 요청 본문의 필드 이름이고, 특정 필드에 속하지 않으면 null이다. */
export type FieldError = {
  field: string | null
  message: string
}

/**
 * 서버 에러 응답(RFC 9457 Problem Details)에서 쓰는 필드. `code`는 백엔드가 덧붙이는 에러 코드다.
 * `errors`는 입력값 검증 실패(`COMMON_VALIDATION_FAILED`) 때 오는 필드별 목록이다.
 */
export type ProblemDetails = {
  detail?: string
  code?: string
  errors?: FieldError[]
}

// 종류마다 가질 수 있는 값이 다르다. "network인데 status가 있는" 조합은 컴파일 단계에서 막힌다.
type ApiErrorInit =
  | { kind: 'http'; status: number; problem?: ProblemDetails }
  | { kind: 'parse'; status: number }
  | { kind: 'network'; cause?: unknown }
  | { kind: 'timeout'; cause?: unknown }

const NETWORK_MESSAGE = '연결 상태를 확인해 주세요.'
const TIMEOUT_MESSAGE = '응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.'
const SERVER_MESSAGE = '일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'
const STATUS_MESSAGES: Partial<Record<number, string>> = {
  401: '로그인이 필요해요.',
  403: '이 작업을 할 권한이 없어요.',
  404: '요청한 내용을 찾을 수 없어요.',
}

function toUserMessage(init: ApiErrorInit): string {
  if (init.kind === 'network') return NETWORK_MESSAGE
  if (init.kind === 'timeout') return TIMEOUT_MESSAGE
  if (init.kind === 'parse') return SERVER_MESSAGE
  // title은 쓰지 않는다. 백엔드가 채우지 않아 Spring 기본값인 영어 문구("Not Found")가 들어온다.
  return init.problem?.detail ?? STATUS_MESSAGES[init.status] ?? SERVER_MESSAGE
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
  /** 입력칸 아래에 보여줄 필드별 오류. 없으면 빈 배열이다. */
  readonly fieldErrors: readonly FieldError[]

  constructor(init: ApiErrorInit) {
    super(toUserMessage(init), {
      // 원인은 디버깅용으로 메모리에만 둔다. 콘솔에 남기지 않는다.
      cause: init.kind === 'network' || init.kind === 'timeout' ? init.cause : undefined,
    })
    this.name = 'ApiError'
    this.kind = init.kind
    this.status = init.kind === 'http' || init.kind === 'parse' ? init.status : null
    this.code = init.kind === 'http' ? (init.problem?.code ?? null) : null
    this.fieldErrors = init.kind === 'http' ? (init.problem?.errors ?? []) : []
  }
}

/**
 * 다시 보내면 결과가 달라질 수 있는 에러인지. TanStack Query의 `retry` 옵션에서 쓴다.
 * 서버에 닿지 못했거나(network) 서버 쪽 문제(5xx)일 때만 재시도한다.
 * - 4xx, parse: 같은 요청을 다시 보내도 결과가 같다.
 * - timeout: 이미 오래 기다렸으므로 바로 안내하고 사용자가 다시 시도하게 한다.
 * - ApiError가 아닌 에러: 코드 오류다.
 */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if (error.kind === 'network') return true
  return error.kind === 'http' && error.status !== null && error.status >= 500
}

/**
 * 서버가 요청을 처리했는지 알 수 없는 실패인지. 응답을 받지 못했거나 읽지 못했을 때, 그리고 서버 오류(5xx)다.
 * 중간 서버가 끊었을 뿐(502·504) 처리는 끝났을 수 있다. 4xx는 서버가 거부한 것이라 처리되지 않았다.
 */
export function isOutcomeUnknown(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if (error.kind !== 'http') return true
  return error.status !== null && error.status >= 500
}
