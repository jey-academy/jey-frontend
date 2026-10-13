import { describe, expect, it } from 'vitest'
import { readPage } from './page'

describe('readPage', () => {
  it.each([
    ['0', 0],
    ['3', 3],
    ['007', 7],
    ['10000', 10000],
  ])('숫자로 된 값 %s는 그대로 읽는다', (value, expected) => {
    expect(readPage(value)).toBe(expected)
  })

  it.each([
    ['값이 없음', null],
    ['빈 값', ''],
    ['글자', 'abc'],
    ['음수', '-1'],
    ['소수', '1.5'],
    ['지수 표기', '1e3'],
    ['앞뒤 공백', ' 3'],
    ['서버의 상한을 넘음', '10001'],
    ['다섯 자리의 가장 큰 값', '99999'],
    ['여섯 자리', '100000'],
  ])('%s이면 첫 페이지로 본다', (_, value) => {
    expect(readPage(value)).toBe(0)
  })
})
