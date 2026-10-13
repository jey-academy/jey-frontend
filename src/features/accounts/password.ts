// 서버의 비밀번호 규칙(백엔드 ADR-0030, PasswordPolicy)을 보내기 전에 미리 본다. 규칙이 바뀌면 같이 고친다.
// 서버는 어긴 까닭을 가르지 않고 AUTH_PASSWORD_NOT_ACCEPTABLE 하나로 답한다. 그래서 여기서 까닭을 짚어 알린다.
// 여기서 다루는 값은 비밀번호 원문이다. 콘솔에 찍거나 에러 문구에 넣지 않는다.

const MIN_LENGTH = 10
// 서버의 해시(bcrypt)는 앞 72바이트만 읽고 나머지를 조용히 버린다. 그래서 넘으면 받지 않는다. 글자 수가 아니라 바이트다.
const MAX_BYTES = 72
// 줄바꿈, 탭 같은 제어 문자
const CONTROL_CHARACTERS = /\p{Cc}/u
// 눈에 보이는 글자 하나. 공백류(\p{Z})와 제어·서식 문자(\p{C}, 폭 없는 공백 포함)가 아닌 것. 서버와 같은 식이다.
const VISIBLE = /[^\p{Z}\p{C}]/gu

/** 비밀번호 칸 밑에 미리 적어 두는 규칙. */
export const PASSWORD_RULE_HINT =
  '공백을 빼고 10자 이상이고 아이디와 달라야 해요. 글자 종류는 가리지 않아요.'

/**
 * 비밀번호 입력값의 오류 문구. 문제가 없으면 undefined다.
 * 값은 다듬지 않고 그대로 보낸다(앞뒤 공백도 비밀번호의 일부다). 다만 서버와 같이, 최소 길이에는 눈에 보이는 글자만 세고
 * 아이디와 같은지는 앞뒤 공백과 대소문자를 가리지 않고 본다.
 */
export function passwordError(password: string, loginId: string): string | undefined {
  if (password === '') return '비밀번호를 입력해 주세요.'
  if (CONTROL_CHARACTERS.test(password)) return '줄바꿈이나 탭은 쓸 수 없어요.'
  // 이모지처럼 문자열 길이로는 2인 글자도 한 글자로 센다. 공백으로 길이를 채운 값은 받지 않는다.
  if ((password.match(VISIBLE)?.length ?? 0) < MIN_LENGTH) {
    return `공백을 빼고 ${MIN_LENGTH}자 이상으로 입력해 주세요.`
  }
  if (new TextEncoder().encode(password).length > MAX_BYTES) {
    return '너무 길어요. 영문은 72자, 한글은 24자까지 쓸 수 있어요.'
  }
  if (password.trim().toLowerCase() === loginId.trim().toLowerCase()) {
    return '아이디와 같은 비밀번호는 쓸 수 없어요.'
  }
  return undefined
}
