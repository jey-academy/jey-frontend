// 서버가 받는 아이디의 꼴: 영문 소문자, 숫자, 점, 밑줄, 하이픈으로 3~50자이고 첫 글자는 영문이나 숫자다.
// 계정 관리와 연계 학원 계정 만들기가 같은 규칙을 쓴다. 서버 규칙이 바뀌면 같이 고친다.
const LOGIN_ID = /^[a-z0-9][a-z0-9._-]{2,49}$/

/** 서버가 받는 아이디의 최대 길이 */
export const LOGIN_ID_MAX_LENGTH = 50

/** 아이디 칸 밑에 미리 적어 두는 규칙. 쓰는 쪽이 예를 덧붙인다. */
export const LOGIN_ID_RULE_HINT =
  '영문 소문자, 숫자, 점(.), 밑줄(_), 하이픈(-)으로 3~50자. 만든 뒤에는 바꿀 수 없어요.'

/** 아이디 입력값(앞뒤 공백을 뗀 값)의 오류 문구. 문제가 없으면 undefined다. */
export function loginIdError(loginId: string): string | undefined {
  if (loginId === '') return '아이디를 입력해 주세요.'
  if (!LOGIN_ID.test(loginId)) {
    return '영문 소문자, 숫자, 점(.), 밑줄(_), 하이픈(-)으로 3~50자여야 해요. 첫 글자는 영문이나 숫자예요.'
  }
  return undefined
}
