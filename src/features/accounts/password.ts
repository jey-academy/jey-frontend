// 서버의 비밀번호 규칙과 같다(백엔드 PR #39). 규칙이 바뀌면 같이 고친다.
// 서버는 어긴 까닭을 가르지 않고 AUTH_PASSWORD_NOT_ACCEPTABLE 하나로 답한다. 그래서 보내기 전에 까닭을 짚어 알린다.
// 여기서 다루는 값은 비밀번호 원문이다. 콘솔에 찍거나 에러 문구에 넣지 않는다.

const MIN_LENGTH = 10
// 서버가 비밀번호를 바꿔 저장하는 방식(bcrypt)이 72바이트까지만 읽는다. 글자 수가 아니라 바이트다.
const MAX_BYTES = 72
// 줄바꿈, 탭 같은 제어 문자
const CONTROL_CHARACTERS = /\p{Cc}/u

/** 비밀번호 칸 밑에 미리 적어 두는 규칙. */
export const PASSWORD_RULE_HINT = '10자 이상이고 아이디와 달라야 해요. 글자 종류는 가리지 않아요.'

/**
 * 비밀번호 입력값의 오류 문구. 문제가 없으면 undefined다.
 * 앞뒤 공백을 떼지 않는다. 공백도 비밀번호의 글자다.
 */
export function passwordError(password: string, loginId: string): string | undefined {
  if (password === '') return '비밀번호를 입력해 주세요.'
  if (CONTROL_CHARACTERS.test(password)) return '줄바꿈이나 탭은 쓸 수 없어요.'
  // 이모지처럼 두 칸을 차지하는 글자도 한 글자로 센다. 서버가 어느 쪽으로 세든 여기서 통과한 값은 서버도 받는다.
  if ([...password].length < MIN_LENGTH) return `${MIN_LENGTH}자 이상으로 입력해 주세요.`
  if (new TextEncoder().encode(password).length > MAX_BYTES) {
    return '너무 길어요. 영문은 72자, 한글은 24자까지 쓸 수 있어요.'
  }
  if (password === loginId) return '아이디와 같은 비밀번호는 쓸 수 없어요.'
  return undefined
}
