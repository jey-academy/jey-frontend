import { expect, test } from 'vitest'
import { passwordError } from './password'

test.each([
  ['영문 10자', 'abcdefghij'],
  ['영문 72자(바이트 상한)', 'a'.repeat(72)],
  ['한글 24자(72바이트)', '가'.repeat(24)],
  ['공백이 든 문장(보이는 글자 19자)', 'correct horse battery'],
  ['앞뒤 공백이 붙었지만 보이는 글자가 10자', ' abcdefghij '],
  ['이모지 10개', '😀'.repeat(10)],
  ['아이디에 글자를 덧붙임', 'desk.dongtan1'],
])('받는 비밀번호: %s', (_name, password) => {
  expect(passwordError(password, 'desk.dongtan')).toBeUndefined()
})

const TOO_SHORT = '공백을 빼고 10자 이상으로 입력해 주세요.'
const TOO_LONG = '너무 길어요. 영문은 72자, 한글은 24자까지 쓸 수 있어요.'

test.each([
  ['빈 값', '', '비밀번호를 입력해 주세요.'],
  ['9자', 'abcdefghi', TOO_SHORT],
  // 이모지는 문자열 길이로는 2다. 글자 수로 세어 9자로 본다.
  ['이모지 9개', '😀'.repeat(9), TOO_SHORT],
  // 서버는 눈에 보이는 글자만 센다. 공백으로 길이를 채운 값은 서버가 거부한다.
  ['공백을 넣어 11자(보이는 글자 9자)', 'abc def gh1', TOO_SHORT],
  ['앞뒤 공백을 넣어 10자(보이는 글자 8자)', ' abcdefgh ', TOO_SHORT],
  ['공백만 10자', ' '.repeat(10), TOO_SHORT],
  ['전각 공백을 넣어 10자', 'abcdefgh　i', TOO_SHORT],
  ['폭 없는 공백을 넣어 10자', 'abcdefghi​', TOO_SHORT],
  ['영문 73자', 'a'.repeat(73), TOO_LONG],
  // 글자 수(25)로는 짧아 보이지만 75바이트다.
  ['한글 25자', '가'.repeat(25), TOO_LONG],
  ['줄바꿈', 'abcdefghij\nk', '줄바꿈이나 탭은 쓸 수 없어요.'],
  ['탭', 'abcde\tfghijk', '줄바꿈이나 탭은 쓸 수 없어요.'],
])('받지 않는 비밀번호: %s', (_name, password, message) => {
  expect(passwordError(password, 'desk.dongtan')).toBe(message)
})

// 서버는 앞뒤 공백과 대소문자를 가리지 않고 아이디와 견준다.
test.each([
  ['그대로', 'desk.dongtan'],
  ['대문자로', 'DESK.Dongtan'],
  ['앞뒤에 공백을 붙여', ' desk.dongtan '],
])('아이디를 %s 쓰면 받지 않는다', (_name, password) => {
  expect(passwordError(password, 'desk.dongtan')).toBe('아이디와 같은 비밀번호는 쓸 수 없어요.')
})

test('오류 문구에 입력한 비밀번호를 넣지 않는다', () => {
  const secret = 'short-pw'
  expect(passwordError(secret, 'desk.dongtan')).not.toContain(secret)
})
