import { expect, test } from 'vitest'
import { ApiError, isOutcomeUnknown } from './error'

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
