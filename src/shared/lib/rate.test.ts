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
  ['100.00', 1],
  ['0', 0],
  ['0.00', 0],
  ['05', 0.05],
  ['5.10', 0.051],
  ['5\t%', 0.05],
  ['999.99', 9.9999],
  // 100%를 넘는 값도 형식은 맞다. 받을지는 서버가 판단한다.
  ['150', 1.5],
])('입력한 퍼센트 %s를 비율로 바꾼다', (text, rate) => {
  expect(parsePercent(text)).toBe(rate)
})

// 100으로 나누면 어긋나는 값들이다(1.1 / 100 === 0.011000000000000001). 서버는 소수 넷째 자리를 넘는 값을 거부한다.
test.each([
  ['0.07', 0.0007],
  ['1.1', 0.011],
  ['2.2', 0.022],
  ['5.6', 0.056],
  ['8.2', 0.082],
  ['12.3', 0.123],
  ['33.3', 0.333],
  ['99.99', 0.9999],
])('나누면 오차가 생기는 %s도 정확한 비율 %s로 바꾼다', (text, rate) => {
  expect(Number(text) / 100).not.toBe(rate)
  expect(parsePercent(text)).toBe(rate)
})

// 예시 몇 개로는 놓치는 값이 있다. 입력할 수 있는 퍼센트를 전부 돌려 본다(0.00~100.00, 10,001개).
function everyPercent() {
  return Array.from({ length: 10_001 }, (_, i) => ({
    i,
    // 정수 연산으로만 만든 기준값. 검사하려는 함수와 같은 방식으로 틀리지 않게 한다.
    text: `${Math.floor(i / 100)}.${String(i % 100).padStart(2, '0')}`,
    rate: Number(`${i}e-4`),
  }))
}

function expectedPercentText(i: number) {
  const fraction = String(i % 100)
    .padStart(2, '0')
    .replace(/0+$/, '')
  return fraction ? `${Math.floor(i / 100)}.${fraction}%` : `${Math.floor(i / 100)}%`
}

test('입력할 수 있는 모든 퍼센트(0.00~100.00)가 소수 넷째 자리까지의 정확한 비율로 바뀐다', () => {
  const wrong = everyPercent().filter(({ text, rate }) => {
    const parsed = parsePercent(text)
    const sent = JSON.stringify(parsed)
    return parsed !== rate || (sent.split('.')[1]?.length ?? 0) > 4 || sent.includes('e')
  })

  expect(wrong.slice(0, 5)).toEqual([])
})

test('서버가 줄 수 있는 모든 비율(0~1, 소수 넷째 자리)을 맞는 퍼센트로 보여준다', () => {
  const wrong = everyPercent().filter(
    ({ i, rate }) => formatPercent(rate) !== expectedPercentText(i),
  )

  expect(wrong.slice(0, 5)).toEqual([])
})

test('받은 비율을 입력칸에 보여줬다가 그대로 저장해도 값이 바뀌지 않는다', () => {
  // 수정 창은 formatPercent에서 %를 뗀 글자로 입력칸을 채우고, 저장할 때 parsePercent로 되돌린다.
  const wrong = everyPercent().filter(
    ({ rate }) => parsePercent(formatPercent(rate).replace('%', '')) !== rate,
  )

  expect(wrong.slice(0, 5)).toEqual([])
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
  '5％',
  '5%%',
  '% 5',
  '0.001',
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
  // 계산 과정에서 잡음이 낀 값도 같은 비율로 본다.
  [0.1 + 0.2, '30%'],
])('비율 %s를 %s로 보여준다', (rate, text) => {
  expect(formatPercent(rate)).toBe(text)
})

test.each([
  ['소수 넷째 자리를 넘는 값', 0.05123],
  // 조용히 반올림하면 틀린 할인율을 보여주게 된다.
  ['소수 다섯째 자리가 1인 값', 0.05001],
  ['넷째 자리의 절반', 0.00005],
  ['바로 아래 값', 0.04999999],
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
