import { expect, test } from 'vitest'
import { isPeriodDate } from './period'

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
  // 모양은 맞지만 연도를 잘못 친 값
  ['0026-10-12', false],
  ['2026-04-31', false],
  ['2026-00-10', false],
  // 모양이 다른 값
  ['2026-10-12T00:00:00', false],
  ['20261012', false],
  ['', false],
])('isPeriodDate(%s)는 %s', (value, expected) => {
  expect(isPeriodDate(value)).toBe(expected)
})
