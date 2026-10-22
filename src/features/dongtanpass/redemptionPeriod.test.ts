import { expect, test } from 'vitest'
import {
  defaultRedemptionPeriod,
  isPeriodTooLong,
  oneYearAfter,
  REDEMPTION_PERIOD_ERROR_CODES,
  redemptionPeriodErrorText,
} from './redemptionPeriod'

test('기간을 거절한 답은 안내로 바꾸고, 그 코드들만 다시 불러오기를 숨기는 코드다', () => {
  expect(REDEMPTION_PERIOD_ERROR_CODES).toEqual([
    'DONGTANPASS_INVALID_PERIOD',
    'DONGTANPASS_PERIOD_TOO_LONG',
  ])
  expect(redemptionPeriodErrorText('DONGTANPASS_PERIOD_TOO_LONG')).toBe(
    '기간은 1년까지 볼 수 있어요. 기간 칸을 고친 뒤 조회해 주세요.',
  )
  expect(redemptionPeriodErrorText('DONGTANPASS_PASS_NOT_FOUND')).toBeNull()
  expect(redemptionPeriodErrorText(null)).toBeNull()
  // 객체에 원래 있는 이름(toString 등)을 안내로 읽지 않는다.
  expect(redemptionPeriodErrorText('toString')).toBeNull()
})

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
