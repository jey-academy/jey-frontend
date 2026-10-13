import { expect, test } from 'vitest'
import { isMobilePhone, normalizeMobilePhone } from './phone'

// 받는 모양과 받지 않는 모양의 예시는 백엔드 PhoneNumberTest에서 가져왔다(맨 아래 공백 테스트는 여기에만 있다). 서버가 받는 것을 화면이 막거나, 서버가 막는 것을 화면이 통과시키지 않게 한다.

test.each([
  '01012345678',
  '010-1234-5678',
  '010 1234 5678',
  ' 010-1234-5678 ',
  '010.1234.5678',
  '+82 10-1234-5678',
  '+821012345678',
  '+82 010-1234-5678',
])('서버가 받는 모양(%s)을 같은 번호로 읽는다', (input) => {
  expect(normalizeMobilePhone(input)).toBe('01012345678')
  expect(isMobilePhone(input)).toBe(true)
})

test('010이 아닌 휴대전화 번호도 받는다', () => {
  expect(normalizeMobilePhone('011-234-5678')).toBe('0112345678')
  expect(normalizeMobilePhone('016-1234-5678')).toBe('01612345678')
})

test.each([
  // 유선 전화, 대표 번호, 인터넷 전화
  '02-123-4567',
  '031-123-4567',
  '1588-1234',
  '070-1234-5678',
  // 자릿수가 맞지 않음
  '0101234567',
  '010123456789',
  '010-1234-56789',
  // 숫자가 아닌 글자, 없는 국번, 전각 숫자
  '010-1234-567a',
  '012-1234-5678',
  '010-12３4-5678',
  // 국가 번호가 틀림
  '8210-1234-5678',
  '+1 10-1234-5678',
  '++821012345678',
  // 서버가 준 가린 번호를 그대로 넣은 경우
  '010-****-5678',
  '-',
  '',
  ' ',
  '\t',
])('서버가 받지 않는 모양(%s)은 휴대전화 번호가 아니다', (input) => {
  expect(normalizeMobilePhone(input)).toBeNull()
  expect(isMobilePhone(input)).toBe(false)
})

test('서버가 떼지 않는 공백(전각 공백 등)은 여기서도 떼지 않는다', () => {
  // 화면만 통과시키면 서버가 거부한다. 화면에서 걸러야 모든 칸의 오류를 한 번에 볼 수 있다.
  expect(isMobilePhone('010\u30001234\u30005678')).toBe(false)
  expect(isMobilePhone('010\u00a01234\u00a05678')).toBe(false)
})
