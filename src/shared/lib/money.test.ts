import { expect, test } from 'vitest'
import { formatWon, parseWon } from './money'

test('천 단위 쉼표와 원을 붙인다', () => {
  expect(formatWon(299250)).toBe('299,250원')
  expect(formatWon(280000)).toBe('280,000원')
  expect(formatWon(1234567890)).toBe('1,234,567,890원')
})

test('천 원 미만과 0원도 그대로 보여준다', () => {
  expect(formatWon(999)).toBe('999원')
  expect(formatWon(0)).toBe('0원')
  expect(formatWon(-0)).toBe('0원')
})

test('음수는 앞에 -를 붙인다', () => {
  expect(formatWon(-14750)).toBe('-14,750원')
  expect(formatWon(-999)).toBe('-999원')
})

test.each([
  ['소수 한 자리', 299250.5],
  ['반올림하면 정수가 되는 소수', 1000.9999],
  ['0에 가까운 양수', 0.0004],
  ['0에 가까운 음수', -0.0004],
])('정수가 아닌 금액은 반올림해 보여주지 않고 에러를 던진다 (%s)', (_label, amount) => {
  expect(() => formatWon(amount)).toThrow(RangeError)
})

test.each([
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['-Infinity', Number.NEGATIVE_INFINITY],
  ['정확히 표현할 수 없는 큰 숫자', Number.MAX_SAFE_INTEGER + 1],
  ['문자열 숫자', '299250'],
  ['빈 문자열', ''],
  ['null', null],
  ['undefined', undefined],
])('금액으로 쓸 수 없는 값이면 에러를 던진다 (%s)', (_label, amount) => {
  // 타입으로는 막혀 있지만, 서버 응답이 약속과 다르면 실제로 들어올 수 있다.
  expect(() => formatWon(amount as number)).toThrow(RangeError)
})

test('에러 메시지에 받은 값의 종류만 담고 값 자체는 담지 않는다', () => {
  expect(() => formatWon('01055214821' as unknown as number)).toThrow('받은 값: string')
  expect(() => formatWon('01055214821' as unknown as number)).not.toThrow(/0105521/)
  expect(() => formatWon(299250.5)).toThrow('받은 값: 소수')
})

test.each([
  ['280000', 280000],
  ['280,000', 280000],
  [' 280,000원 ', 280000],
  ['0', 0],
  ['015000', 15000],
])('입력한 금액 %s을 원 단위 정수로 읽는다', (text, amount) => {
  expect(parseWon(text)).toBe(amount)
})

test.each(['', '   ', '삼십만원', '280000.5', '-1000', '28만', '1e5', '99999999999999999999'])(
  '금액으로 읽을 수 없는 입력(%s)은 null이다',
  (text) => {
    expect(parseWon(text)).toBeNull()
  },
)
