import { expect, test } from 'vitest'
import { ApiError, isOutcomeUnknown, retryAfterPhrase } from './error'

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
