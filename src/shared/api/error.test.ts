import { expect, test } from 'vitest'
import {
  ApiError,
  isOutcomeUnknown,
  isRateLimited,
  retryAfterPhrase,
  supportRequestId,
} from './error'

test.each([
  ['연결 끊김', new ApiError({ kind: 'network' })],
  ['시간 초과', new ApiError({ kind: 'timeout' })],
  ['읽지 못한 성공 응답', new ApiError({ kind: 'parse', status: 200 })],
  ['서버 오류(500)', new ApiError({ kind: 'http', status: 500 })],
  ['중간 서버 오류(502)', new ApiError({ kind: 'http', status: 502 })],
  ['중간 서버 시간 초과(504)', new ApiError({ kind: 'http', status: 504 })],
])('%s: 서버가 처리했는지 알 수 없는 실패다', (_name, error) => {
  expect(isOutcomeUnknown(error)).toBe(true)
})

test.each([
  ['입력값 오류(400)', new ApiError({ kind: 'http', status: 400 })],
  ['로그인 필요(401)', new ApiError({ kind: 'http', status: 401 })],
  ['중복(409)', new ApiError({ kind: 'http', status: 409 })],
  ['요청이 너무 많음(429)', new ApiError({ kind: 'http', status: 429 })],
  ['서버 오류 바로 앞(499)', new ApiError({ kind: 'http', status: 499 })],
  ['코드 오류', new TypeError('x is not a function')],
  ['취소', new DOMException('aborted', 'AbortError')],
])('%s: 서버가 처리했는지 알 수 없는 실패가 아니다', (_name, error) => {
  expect(isOutcomeUnknown(error)).toBe(false)
})

test.each([
  [900, '약 15분 뒤'],
  [3600, '약 60분 뒤'],
  // 분으로 올린다. 덜 기다리고 다시 눌러 또 막히지 않게 한다.
  [901, '약 16분 뒤'],
  [61, '약 2분 뒤'],
  [60, '약 1분 뒤'],
  [1, '약 1분 뒤'],
  [0, '약 1분 뒤'],
])('retryAfterPhrase: %i초는 "%s"', (seconds, phrase) => {
  const error = new ApiError({ kind: 'http', status: 429, retryAfterSeconds: seconds })

  expect(retryAfterPhrase(error)).toBe(phrase)
})

test.each([
  ['서버가 시간을 주지 않은 429', new ApiError({ kind: 'http', status: 429 })],
  ['서버에 닿지 못한 에러', new ApiError({ kind: 'network' })],
])('retryAfterPhrase: %s는 "잠시 뒤"', (_name, error) => {
  expect(error.retryAfterSeconds).toBeNull()
  expect(retryAfterPhrase(error)).toBe('잠시 뒤')
})

test('isRateLimited: 요청이 너무 많다는 답(429)만 참이다', () => {
  expect(isRateLimited(new ApiError({ kind: 'http', status: 429 }))).toBe(true)
  expect(isRateLimited(new ApiError({ kind: 'http', status: 409 }))).toBe(false)
  expect(isRateLimited(new ApiError({ kind: 'http', status: 503 }))).toBe(false)
  expect(isRateLimited(new ApiError({ kind: 'network' }))).toBe(false)
  expect(isRateLimited(new TypeError('x is not a function'))).toBe(false)
  expect(isRateLimited({ status: 429 })).toBe(false)
})

// ── 요청 번호 ─────────────────────────────────────────────

const BODY_ID = '2d6a6e90a9d04a16bb607aa43840f2d7'
const HEADER_ID = 'ffffffffffffffffffffffffffffffff'

function httpError(status: number, code?: string) {
  return new ApiError({
    kind: 'http',
    status,
    problem: code ? { code } : undefined,
    headerRequestId: HEADER_ID,
  })
}

test('본문의 번호를 헤더의 번호보다 먼저 쓴다. 다시 받은 응답은 본문의 번호가 일을 한 요청의 것이다', () => {
  const both = new ApiError({
    kind: 'http',
    status: 500,
    problem: { requestId: BODY_ID },
    headerRequestId: HEADER_ID,
  })

  expect(both.requestId).toBe(BODY_ID)
  expect(httpError(502).requestId).toBe(HEADER_ID)
})

test('서버에 닿지 못했거나 응답에 번호가 없으면 요청 번호는 null이다', () => {
  expect(new ApiError({ kind: 'network' }).requestId).toBeNull()
  expect(new ApiError({ kind: 'timeout' }).requestId).toBeNull()
  expect(new ApiError({ kind: 'http', status: 500 }).requestId).toBeNull()
  expect(new ApiError({ kind: 'parse', status: 200 }).requestId).toBeNull()
})

test.each([
  ['500', httpError(500, 'COMMON_INTERNAL_ERROR')],
  ['503', httpError(503)],
  ['읽지 못한 응답', new ApiError({ kind: 'parse', status: 200, headerRequestId: HEADER_ID })],
  // 서버와 화면이 어긋났다는 코드. 입력을 고쳐서 풀 수 없다.
  ['요청 형식이 틀림(400)', httpError(400, 'COMMON_BAD_REQUEST')],
  ['틀린 메서드(405)', httpError(405, 'COMMON_METHOD_NOT_ALLOWED')],
  ['멱등 키 누락(400)', httpError(400, 'COMMON_IDEMPOTENCY_KEY_REQUIRED')],
  // 우리 서버는 늘 코드를 싣는다. 코드가 없으면 앞단이 만든 답이다.
  ['코드 없는 400', httpError(400)],
  ['코드 없는 413', httpError(413)],
  ['코드 없는 403', httpError(403)],
])('supportRequestId: 예상하지 못한 오류(%s)는 번호를 보여준다', (_name, error) => {
  expect(supportRequestId(error)).toBe(HEADER_ID)
})

test.each([
  ['입력 오류(400)', httpError(400, 'COMMON_VALIDATION_FAILED')],
  ['로그인 필요(401)', httpError(401, 'COMMON_UNAUTHENTICATED')],
  ['권한 없음(403)', httpError(403, 'COMMON_FORBIDDEN')],
  ['없는 주소(404)', httpError(404, 'COMMON_NOT_FOUND')],
  ['없는 학생(404)', httpError(404, 'MEMBER_STUDENT_NOT_FOUND')],
  ['이름 중복(409)', httpError(409, 'CAMPUS_CLASS_NAME_DUPLICATED')],
  ['한도 초과(429)', httpError(429, 'MEMBER_PHONE_CHANGE_LIMITED')],
  ['아직 처리 중인 멱등 키(409)', httpError(409, 'COMMON_IDEMPOTENCY_IN_PROGRESS')],
  ['다시 쓴 멱등 키(422)', httpError(422, 'COMMON_IDEMPOTENCY_KEY_REUSED')],
  // 객체에 원래 있는 이름과 겹치는 코드
  ['코드가 constructor', httpError(400, 'constructor')],
  ['번호가 없는 500', new ApiError({ kind: 'http', status: 500 })],
  ['연결 실패', new ApiError({ kind: 'network' })],
  ['ApiError가 아닌 에러', new TypeError('x')],
  ['null', null],
])('supportRequestId: %s에는 번호를 보여주지 않는다', (_name, error) => {
  expect(supportRequestId(error)).toBeNull()
})
