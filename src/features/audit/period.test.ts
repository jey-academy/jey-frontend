import { expect, test } from 'vitest'
import { formatOccurredAt, isPeriodDate, periodQuery } from './period'

test.each([
  ['2026-10-12', true],
  ['2024-02-29', true],
  ['2000-01-01', true],
  ['2099-12-31', true],
  // 달력에 없는 날짜
  ['2026-02-30', false],
  ['2025-02-29', false],
  ['2026-13-01', false],
  // 받는 범위 밖
  ['1999-12-31', false],
  ['2100-01-01', false],
  // 모양이 다른 값
  ['0026-10-12', false],
  ['2026-10-12T00:00:00', false],
  ['20261012', false],
  ['', false],
])('isPeriodDate(%s)는 %s', (value, expected) => {
  expect(isPeriodDate(value)).toBe(expected)
})

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
])('끝일 %s의 다음 날은 달과 해를 넘어간다', (to, expected) => {
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
