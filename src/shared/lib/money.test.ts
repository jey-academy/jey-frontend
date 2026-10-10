import { expect, test } from 'vitest'
import { formatWon } from './money'

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
})

test('서버가 준 값을 반올림하지 않는다', () => {
  expect(formatWon(299250.5)).toBe('299,250.5원')
})

test('숫자가 아닌 값이면 틀린 금액을 보여주지 않고 에러를 던진다', () => {
  expect(() => formatWon(Number.NaN)).toThrow(RangeError)
  expect(() => formatWon(Number.POSITIVE_INFINITY)).toThrow(RangeError)
})
