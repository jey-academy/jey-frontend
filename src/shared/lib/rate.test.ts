import { expect, test } from 'vitest'
import { formatPercent, parsePercent } from './rate'

test.each([
  ['5', 0.05],
  ['5%', 0.05],
  [' 5 % ', 0.05],
  ['7.5', 0.075],
  ['7.25', 0.0725],
  ['0.01', 0.0001],
  ['10', 0.1],
  ['12.5', 0.125],
  ['33.33', 0.3333],
  ['100', 1],
  ['0', 0],
  ['05', 0.05],
  // 100%를 넘는 값도 형식은 맞다. 받을지는 서버가 판단한다.
  ['150', 1.5],
])('입력한 퍼센트 %s를 비율로 바꾼다', (text, rate) => {
  expect(parsePercent(text)).toBe(rate)
})

test('소수점 자리만 옮겨서 나눗셈 오차가 생기지 않는다', () => {
  // 나누면 어긋나는 값들이다. 서버는 소수 넷째 자리를 넘는 값을 거부한다.
  for (const text of ['7.25', '0.07', '1.1', '14.35', '57.55', '99.99']) {
    const rate = parsePercent(text)!
    expect(String(rate).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4)
    expect(formatPercent(rate)).toBe(`${Number(text)}%`)
  }
})

test.each([
  '',
  '   ',
  '%',
  '오',
  '5퍼센트',
  '-5',
  '+5',
  '5.',
  '.5',
  '5.123',
  '1e1',
  '0x5',
  '5,5',
  '1000',
  '５',
  '5 5',
])('퍼센트로 읽을 수 없는 입력(%s)은 null이다', (text) => {
  expect(parsePercent(text)).toBeNull()
})

test.each([
  [0.05, '5%'],
  [0.075, '7.5%'],
  [0.0725, '7.25%'],
  [0.1, '10%'],
  [0.3333, '33.33%'],
  [0.0001, '0.01%'],
  [1, '100%'],
  [0, '0%'],
  // 곱하면 7.000000000000001이 되는 값
  [0.07, '7%'],
  [0.57, '57%'],
])('비율 %s를 %s로 보여준다', (rate, text) => {
  expect(formatPercent(rate)).toBe(text)
})

test.each([
  ['소수 넷째 자리를 넘는 값', 0.05123],
  ['음수', -0.05],
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['문자열', '0.05'],
  ['null', null],
  ['undefined', undefined],
])('할인율로 쓸 수 없는 값이면 에러를 던진다 (%s)', (_label, rate) => {
  // 타입으로는 막혀 있지만, 서버 응답이 약속과 다르면 실제로 들어올 수 있다.
  expect(() => formatPercent(rate as number)).toThrow(RangeError)
})
