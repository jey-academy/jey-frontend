import { expect, test } from 'vitest'
import { formatOccurredAt, periodQuery } from './period'

test('하루치는 그날 0시부터 다음 날 0시 전까지로 보낸다', () => {
  expect(periodQuery('2026-10-12', '2026-10-12')).toEqual({
    from: '2026-10-12T00:00:00+09:00',
    to: '2026-10-13T00:00:00+09:00',
  })
})

test.each([
  ['2026-10-31', '2026-11-01T00:00:00+09:00'],
  ['2026-12-31', '2027-01-01T00:00:00+09:00'],
  ['2024-02-28', '2024-02-29T00:00:00+09:00'],
  ['2024-02-29', '2024-03-01T00:00:00+09:00'],
  ['2025-02-28', '2025-03-01T00:00:00+09:00'],
  ['2099-12-31', '2100-01-01T00:00:00+09:00'],
])('끝일 %s의 다음 날은 달·해·윤일을 맞게 넘긴다', (to, expected) => {
  expect(periodQuery(undefined, to)).toEqual({ from: undefined, to: expected })
})

test('주지 않은 쪽은 보내지 않는다', () => {
  expect(periodQuery('2026-10-01')).toEqual({ from: '2026-10-01T00:00:00+09:00', to: undefined })
  expect(periodQuery()).toEqual({ from: undefined, to: undefined })
})

test('UTC 시각을 한국 시각으로 바꾼다. 날짜가 넘어가는 시각도 맞게 나온다', () => {
  expect(formatOccurredAt('2026-10-11T15:38:00Z')).toBe('2026.10.12 00:38:00')
  expect(formatOccurredAt('2026-10-12T03:05:09Z')).toBe('2026.10.12 12:05:09')
  // 소수 초가 붙은 값
  expect(formatOccurredAt('2026-12-31T14:59:59.123Z')).toBe('2026.12.31 23:59:59')
})

test('읽지 못하는 시각은 받은 그대로 돌려준다', () => {
  expect(formatOccurredAt('어제')).toBe('어제')
  expect(formatOccurredAt('')).toBe('')
})

test('시간대가 붙은 값은 어느 시간대든 한국 시각으로 바꾼다', () => {
  expect(formatOccurredAt('2026-10-12T00:38:00+09:00')).toBe('2026.10.12 00:38:00')
  expect(formatOccurredAt('2026-10-11T10:38:00-05:00')).toBe('2026.10.12 00:38:00')
})

test('시간대가 없는 값은 기기 시간으로 읽지 않고 받은 그대로 돌려준다', () => {
  expect(formatOccurredAt('2026-10-11T15:38:00')).toBe('2026-10-11T15:38:00')
  expect(formatOccurredAt('2026-10-11')).toBe('2026-10-11')
})
