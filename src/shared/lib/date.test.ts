import { afterEach, expect, test, vi } from 'vitest'
import { formatDate } from './date'

afterEach(() => {
  vi.unstubAllEnvs()
})

test('날짜만 있는 값은 점으로 구분해 보여준다', () => {
  expect(formatDate('2026-11-05')).toBe('2026.11.05')
  expect(formatDate('2026-01-01')).toBe('2026.01.01')
  expect(formatDate('2026-12-31')).toBe('2026.12.31')
  expect(formatDate('2028-02-29')).toBe('2028.02.29')
  expect(formatDate('2000-02-29')).toBe('2000.02.29')
})

test('시간대 없는 날짜·시각은 적힌 날짜를 그대로 쓴다', () => {
  expect(formatDate('2026-11-05T00:00:00')).toBe('2026.11.05')
  expect(formatDate('2026-11-05T23:59:59.999')).toBe('2026.11.05')
  expect(formatDate('2026-11-05T09:00')).toBe('2026.11.05')
})

test('시간대가 붙은 값은 한국 시간 기준 날짜로 바꾼다', () => {
  // UTC 15:00이 한국 시간으로 다음 날 00:00이다.
  expect(formatDate('2026-11-05T14:59:59Z')).toBe('2026.11.05')
  expect(formatDate('2026-11-05T15:00:00Z')).toBe('2026.11.06')
  expect(formatDate('2026-11-05T15:30:00Z')).toBe('2026.11.06')
  expect(formatDate('2026-11-05T00:00:00+09:00')).toBe('2026.11.05')
  expect(formatDate('2026-11-04T23:30:00+09:00')).toBe('2026.11.04')
  expect(formatDate('2026-12-31T20:00:00-05:00')).toBe('2027.01.01')
})

test('서버가 보낼 수 있는 소수점 초 표기를 받는다', () => {
  expect(formatDate('2026-11-05T15:30:00.123456789Z')).toBe('2026.11.06')
  expect(formatDate('2026-11-05T15:30:00.123+00:00')).toBe('2026.11.06')
})

test('시간대를 바꾸는 방법이 이 테스트 환경에서 실제로 적용된다', () => {
  // 아래 시간대 테스트가 믿는 전제다. 이 테스트가 깨지면 아래 테스트는 아무것도 확인하지 못한다.
  vi.stubEnv('TZ', 'America/Los_Angeles')

  expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(480)
})

test.each(['America/Los_Angeles', 'UTC', 'Asia/Seoul', 'Pacific/Kiritimati'])(
  '기기 시간대가 %s여도 같은 날짜를 보여준다',
  (timeZone) => {
    vi.stubEnv('TZ', timeZone)

    expect(formatDate('2026-11-05')).toBe('2026.11.05')
    expect(formatDate('2026-01-01')).toBe('2026.01.01')
    expect(formatDate('2026-11-05T00:00:00')).toBe('2026.11.05')
    expect(formatDate('2026-11-05T23:59:59.999')).toBe('2026.11.05')
    expect(formatDate('2026-11-05T15:30:00Z')).toBe('2026.11.06')
    expect(formatDate('2026-11-04T23:30:00+09:00')).toBe('2026.11.04')
  },
)

test.each([
  ['빈 문자열', ''],
  ['다른 구분자', '2026.11.05'],
  ['자릿수가 모자란 값', '2026-1-5'],
  ['없는 달', '2026-13-01'],
  ['0월', '2026-00-10'],
  ['0일', '2026-10-00'],
  ['없는 날', '2026-02-30'],
  ['31일이 없는 달', '2026-04-31'],
  ['윤년이 아닌 해의 2월 29일', '2026-02-29'],
  ['100년 단위 평년의 2월 29일', '2100-02-29'],
  ['시각이 붙은 없는 날', '2026-02-30T10:00:00'],
  ['시간대가 붙은 없는 날', '2026-02-30T10:00:00Z'],
  ['시간대가 붙은 평년 2월 29일', '2026-02-29T12:00:00+09:00'],
  ['시간대가 붙은 31일 없는 달', '2026-11-31T10:00:00+09:00'],
  ['시각이 깨진 값', '2026-11-05T25:99:00Z'],
  ['날짜 뒤에 다른 글자가 붙은 값', '2026-11-05 오후'],
  ['1000년 이전', '0099-12-31'],
])('형식이 틀리거나 없는 날짜면 에러를 던진다 (%s)', (_label, value) => {
  expect(() => formatDate(value)).toThrow(RangeError)
})

test.each([
  ['null', null],
  ['undefined', undefined],
  ['숫자', 20261105],
])('문자열이 아닌 값이면 에러를 던진다 (%s)', (_label, value) => {
  // 타입으로는 막혀 있지만, 서버 응답이 약속과 다르면 실제로 들어올 수 있다.
  expect(() => formatDate(value as unknown as string)).toThrow(RangeError)
})

test('에러 메시지에 받은 값의 종류만 담고 값 자체는 담지 않는다', () => {
  expect(() => formatDate('010-5521-4821')).toThrow('받은 값: 문자열 13자')
  expect(() => formatDate('010-5521-4821')).not.toThrow(/5521/)
})
