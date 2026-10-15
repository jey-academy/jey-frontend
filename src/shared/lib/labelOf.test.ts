import { expect, test } from 'vitest'
import { labelOf } from './labelOf'

const labels = { MOTHER: '어머니', FATHER: '아버지' }

test('아는 값은 표시 이름을 돌려준다', () => {
  expect(labelOf(labels, 'MOTHER')).toBe('어머니')
})

test('모르는 값은 받은 값을 그대로 돌려준다', () => {
  expect(labelOf(labels, 'UNCLE')).toBe('UNCLE')
})

test.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
  '객체에 원래 있는 이름(%s)도 받은 값 그대로다',
  (value) => {
    expect(labelOf(labels, value)).toBe(value)
  },
)
