import { expect, test } from 'vitest'
import { isPeriodDate, isPeriodTooLong, oneYearAfter, periodErrors } from './period'

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

const readable = { from: false, to: false }

test.each([
  // 비워도 되는 화면
  [{ from: '', to: '' }, readable, false, {}],
  [{ from: '2026-10-01', to: '' }, readable, false, {}],
  [{ from: '2026-10-01', to: '2026-10-01' }, readable, false, {}],
  [
    { from: '2026-10-02', to: '2026-10-01' },
    readable,
    false,
    { to: '끝일이 시작일보다 앞이에요.' },
  ],
  [{ from: '2026-02-30', to: '' }, readable, false, { from: '날짜를 확인해 주세요.' }],
  [{ from: '', to: '2100-01-01' }, readable, false, { to: '날짜를 확인해 주세요.' }],
  // 값은 비었지만 칸에 날짜로 읽히지 않는 글자가 있다
  [{ from: '', to: '' }, { from: true, to: false }, false, { from: '날짜를 확인해 주세요.' }],
  [{ from: '', to: '' }, { from: false, to: true }, false, { to: '날짜를 확인해 주세요.' }],
  // 한쪽이 틀리면 앞뒤는 따지지 않는다
  [{ from: '2026-10-02', to: '2026-02-30' }, readable, false, { to: '날짜를 확인해 주세요.' }],
  // 비울 수 없는 화면
  [
    { from: '', to: '' },
    readable,
    true,
    { from: '날짜를 넣어 주세요.', to: '날짜를 넣어 주세요.' },
  ],
  [{ from: '2026-10-01', to: '' }, readable, true, { to: '날짜를 넣어 주세요.' }],
  [
    { from: '', to: '' },
    { from: true, to: false },
    true,
    { from: '날짜를 확인해 주세요.', to: '날짜를 넣어 주세요.' },
  ],
  [{ from: '2026-10-01', to: '2026-10-31' }, readable, true, {}],
])('periodErrors(%o, %o, required %s)', (period, badInput, required, expected) => {
  expect(periodErrors(period, badInput, { required })).toEqual(expected)
})

test('required를 주지 않으면 빈 칸을 받는다', () => {
  expect(periodErrors({ from: '', to: '' }, readable)).toEqual({})
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
