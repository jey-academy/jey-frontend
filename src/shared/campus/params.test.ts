import { expect, test } from 'vitest'
import { readCampusId } from './params'

test.each([
  ['1', 1],
  ['007', 7],
  ['999999999', 999999999],
])('숫자로 된 값 %s는 그대로 읽는다', (value, expected) => {
  expect(readCampusId(value)).toBe(expected)
})

test.each([
  ['값이 없음', null],
  ['빈 값', ''],
  ['0', '0'],
  ['글자', 'abc'],
  ['음수', '-1'],
  ['소수', '1.5'],
  ['지수 표기', '1e3'],
  ['앞뒤 공백', ' 2 '],
  ['열 자리', '1234567890'],
])('%s이면 전 지점으로 본다', (_name, value) => {
  expect(readCampusId(value)).toBeUndefined()
})
