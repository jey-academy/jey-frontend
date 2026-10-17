import { afterEach, expect, test, vi } from 'vitest'
import { daysBetween, formatDate, todayInSeoul } from './date'

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
    expect(todayInSeoul(new Date('2026-10-11T15:00:00Z'))).toBe('2026-10-12')
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

test.each([
  // 한국 시간은 UTC보다 9시간 빠르다.
  ['2026-10-11T14:59:59Z', '2026-10-11'],
  ['2026-10-11T15:00:00Z', '2026-10-12'],
  ['2026-12-31T15:00:00Z', '2027-01-01'],
  ['2026-03-01T00:00:00+09:00', '2026-03-01'],
])('todayInSeoul: %s은 한국 날짜로 %s이다', (instant, date) => {
  expect(todayInSeoul(new Date(instant))).toBe(date)
})

test('daysBetween: 두 날짜 사이의 일수를 센다', () => {
  expect(daysBetween('2026-10-16', '2026-10-16')).toBe(0)
  expect(daysBetween('2026-10-16', '2026-10-17')).toBe(1)
  expect(daysBetween('2026-10-17', '2026-10-16')).toBe(-1)
  // 패스 기간: 발급일 + 1개월
  expect(daysBetween('2026-10-16', '2026-11-16')).toBe(31)
  expect(daysBetween('2026-11-16', '2026-12-16')).toBe(30)
})

test('daysBetween: 월말과 해 넘김을 넘어 센다', () => {
  expect(daysBetween('2026-01-31', '2026-02-28')).toBe(28)
  expect(daysBetween('2026-04-30', '2026-05-01')).toBe(1)
  expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
  expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365)
})

test('daysBetween: 윤년의 2월 29일을 센다', () => {
  expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
  expect(daysBetween('2028-01-29', '2028-02-29')).toBe(31)
  expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366)
  // 2000년은 윤년, 2100년은 윤년이 아니다.
  expect(daysBetween('2000-02-28', '2000-03-01')).toBe(2)
  expect(daysBetween('2100-02-28', '2100-03-01')).toBe(1)
})

test('daysBetween: 기기 시간대가 달라도 같은 일수가 나온다', () => {
  // 서머타임이 있는 곳에서도 하루가 23·25시간이 되어 어긋나지 않는다.
  vi.stubEnv('TZ', 'America/New_York')
  expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
  expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
})

test.each([
  ['2026-02-30', '2026-03-01'],
  ['2026-11-05', '2026-13-01'],
  ['2026/11/05', '2026-11-06'],
  ['2026-11-05T09:00:00', '2026-11-06'],
  ['0999-01-01', '2026-11-06'],
  ['', '2026-11-06'],
])('daysBetween: 날짜만 있는 바른 값이 아니면 에러를 던진다 (%s ~ %s)', (from, to) => {
  expect(() => daysBetween(from, to)).toThrow(RangeError)
  expect(() => daysBetween(to, from)).toThrow(RangeError)
})
