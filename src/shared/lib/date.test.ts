import { expect, test } from 'vitest'
import { formatDate } from './date'

test('날짜만 있는 값은 점으로 구분해 보여준다', () => {
  expect(formatDate('2026-11-05')).toBe('2026.11.05')
  expect(formatDate('2026-01-01')).toBe('2026.01.01')
  expect(formatDate('2028-02-29')).toBe('2028.02.29')
})

test('시간대 없는 날짜·시각은 적힌 날짜를 그대로 쓴다', () => {
  expect(formatDate('2026-11-05T00:00:00')).toBe('2026.11.05')
  expect(formatDate('2026-11-05T23:59:59.999')).toBe('2026.11.05')
})

test('시간대가 붙은 값은 한국 시간 기준 날짜로 바꾼다', () => {
  // UTC 15:30은 한국 시간으로 다음 날 00:30이다.
  expect(formatDate('2026-11-05T15:30:00Z')).toBe('2026.11.06')
  expect(formatDate('2026-11-05T14:59:59Z')).toBe('2026.11.05')
  expect(formatDate('2026-11-04T23:30:00+09:00')).toBe('2026.11.04')
  expect(formatDate('2026-12-31T20:00:00-05:00')).toBe('2027.01.01')
})

test.each([
  ['빈 문자열', ''],
  ['다른 구분자', '2026.11.05'],
  ['자릿수가 모자란 값', '2026-1-5'],
  ['없는 달', '2026-13-01'],
  ['없는 날', '2026-02-30'],
  ['윤년이 아닌 해의 2월 29일', '2026-02-29'],
  ['시각이 깨진 값', '2026-11-05T25:99:00Z'],
  ['날짜 뒤에 다른 글자가 붙은 값', '2026-11-05 오후'],
])('형식이 틀리면 에러를 던진다 (%s)', (_label, value) => {
  expect(() => formatDate(value)).toThrow(RangeError)
})
