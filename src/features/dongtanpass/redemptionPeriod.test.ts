import { expect, test } from 'vitest'
import { defaultRedemptionPeriod, isPeriodTooLong, oneYearAfter } from './redemptionPeriod'

test('처음 기간은 이번 달 1일부터 오늘까지다', () => {
  expect(defaultRedemptionPeriod('2026-10-18')).toEqual({ from: '2026-10-01', to: '2026-10-18' })
  expect(defaultRedemptionPeriod('2026-11-01')).toEqual({ from: '2026-11-01', to: '2026-11-01' })
})

test('시작일 + 1년은 같은 날짜의 다음 해이고, 2월 29일은 다음 해 2월 28일이다(서버와 같다)', () => {
  expect(oneYearAfter('2026-10-18')).toEqual('2027-10-18')
  expect(oneYearAfter('2028-02-29')).toEqual('2029-02-28')
  expect(oneYearAfter('2027-02-28')).toEqual('2028-02-28')
})

test('시작일 + 1년까지는 받고, 하루라도 넘으면 너무 길다', () => {
  expect(isPeriodTooLong('2026-10-18', '2027-10-18')).toBe(false)
  expect(isPeriodTooLong('2026-10-18', '2027-10-19')).toBe(true)
  expect(isPeriodTooLong('2028-02-29', '2029-02-28')).toBe(false)
  expect(isPeriodTooLong('2028-02-29', '2029-03-01')).toBe(true)
})
