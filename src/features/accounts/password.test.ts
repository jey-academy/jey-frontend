import { expect, test } from 'vitest'
import { passwordError } from './password'

test.each([
  ['영문 10자', 'abcdefghij'],
  ['영문 72자(바이트 상한)', 'a'.repeat(72)],
  ['한글 24자(72바이트)', '가'.repeat(24)],
  ['공백이 든 문장', 'correct horse battery'],
  ['앞뒤 공백도 글자로 센다', ' abcdefgh '],
  ['아이디에 글자를 덧붙임', 'desk.dongtan1'],
])('받는 비밀번호: %s', (_name, password) => {
  expect(passwordError(password, 'desk.dongtan')).toBeUndefined()
})

test.each([
  ['빈 값', '', '비밀번호를 입력해 주세요.'],
  ['9자', 'abcdefghi', '10자 이상으로 입력해 주세요.'],
  // 이모지는 문자열 길이로는 2다. 글자 수로 세어 9자로 본다.
  ['이모지 9개', '😀'.repeat(9), '10자 이상으로 입력해 주세요.'],
  ['영문 73자', 'a'.repeat(73), '너무 길어요. 영문은 72자, 한글은 24자까지 쓸 수 있어요.'],
  // 글자 수(25)로는 짧아 보이지만 75바이트다.
  ['한글 25자', '가'.repeat(25), '너무 길어요. 영문은 72자, 한글은 24자까지 쓸 수 있어요.'],
  ['줄바꿈', 'abcdefghij\nk', '줄바꿈이나 탭은 쓸 수 없어요.'],
  ['탭', 'abcde\tfghijk', '줄바꿈이나 탭은 쓸 수 없어요.'],
])('받지 않는 비밀번호: %s', (_name, password, message) => {
  expect(passwordError(password, 'desk.dongtan')).toBe(message)
})

test('아이디와 같으면 받지 않는다', () => {
  expect(passwordError('desk.dongtan', 'desk.dongtan')).toBe(
    '아이디와 같은 비밀번호는 쓸 수 없어요.',
  )
})

test('오류 문구에 입력한 비밀번호를 넣지 않는다', () => {
  const secret = 'short-pw'
  expect(passwordError(secret, 'desk.dongtan')).not.toContain(secret)
})
