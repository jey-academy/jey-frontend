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

test('본문의 번호를 헤더의 번호보다 먼저 쓴다. 다시 받은 응답은 본문의 번호가 일을 한 요청의 것이다', () => {
  const both = new ApiError({
    kind: 'http',
    status: 500,
    problem: { requestId: BODY_ID },
    requestId: HEADER_ID,
  })
  const headerOnly = new ApiError({ kind: 'http', status: 502, requestId: HEADER_ID })

  expect(both.requestId).toBe(BODY_ID)
  expect(headerOnly.requestId).toBe(HEADER_ID)
})

test('서버에 닿지 못한 에러에는 요청 번호가 없다', () => {
  expect(new ApiError({ kind: 'network' }).requestId).toBeNull()
  expect(new ApiError({ kind: 'timeout' }).requestId).toBeNull()
  expect(new ApiError({ kind: 'http', status: 500 }).requestId).toBeNull()
})

test.each([
  ['500', new ApiError({ kind: 'http', status: 500, requestId: HEADER_ID })],
  ['503', new ApiError({ kind: 'http', status: 503, requestId: HEADER_ID })],
  ['읽지 못한 응답', new ApiError({ kind: 'parse', status: 200, requestId: HEADER_ID })],
  [
    '멱등 키 누락',
    new ApiError({
      kind: 'http',
      status: 400,
      problem: { code: 'COMMON_IDEMPOTENCY_KEY_REQUIRED' },
      requestId: HEADER_ID,
    }),
  ],
])('supportRequestId: 예상하지 못한 오류(%s)는 번호를 보여준다', (_name, error) => {
  expect(supportRequestId(error)).toBe(HEADER_ID)
})

test.each([
  ['400', new ApiError({ kind: 'http', status: 400, requestId: HEADER_ID })],
  ['401', new ApiError({ kind: 'http', status: 401, requestId: HEADER_ID })],
  ['403', new ApiError({ kind: 'http', status: 403, requestId: HEADER_ID })],
  ['404', new ApiError({ kind: 'http', status: 404, requestId: HEADER_ID })],
  ['409', new ApiError({ kind: 'http', status: 409, requestId: HEADER_ID })],
  ['429', new ApiError({ kind: 'http', status: 429, requestId: HEADER_ID })],
  [
    '다른 멱등 키 오류',
    new ApiError({
      kind: 'http',
      status: 409,
      problem: { code: 'COMMON_IDEMPOTENCY_IN_PROGRESS' },
      requestId: HEADER_ID,
    }),
  ],
  ['번호가 없는 500', new ApiError({ kind: 'http', status: 500 })],
  ['연결 실패', new ApiError({ kind: 'network' })],
  ['ApiError가 아닌 에러', new TypeError('x')],
  ['null', null],
])('supportRequestId: %s에는 번호를 보여주지 않는다', (_name, error) => {
  expect(supportRequestId(error)).toBeNull()
})
