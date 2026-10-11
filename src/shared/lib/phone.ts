// 백엔드의 PhoneNumber와 같은 규칙이다(core/shared/PhoneNumber.java). 규칙이 바뀌면 같이 고친다.
// 서버는 전화번호 형식이 틀려도 어느 칸이 틀렸는지 알려 주지 않는다. 그래서 보내기 전에 칸별로 확인한다.
// 여기서 다루는 값은 전화번호 원문이다. 콘솔에 찍거나 에러 문구에 넣지 않는다.

// 번호 사이에 흔히 넣는 기호. 서버가 떼는 것과 같은 문자만 뗀다(전각 공백 등은 떼지 않는다).
const SEPARATORS = /[ \t\n\v\f\r.-]/g
const COUNTRY_CODE = '+82'
// 010은 11자리, 011·016·017·018·019는 10~11자리
const MOBILE = /^(?:010\d{8}|01[16789]\d{7,8})$/

/**
 * 입력한 휴대전화 번호를 숫자만 남긴 형태(`01012345678`)로 바꾼다. 휴대전화 번호가 아니면 null이다.
 * 두 입력이 같은 번호인지 비교할 때 쓴다. 서버로는 입력한 그대로 보낸다(정리는 서버가 한다).
 */
export function normalizeMobilePhone(text: string): string | null {
  let digits = text.replace(SEPARATORS, '')
  if (digits.startsWith(COUNTRY_CODE)) {
    const national = digits.slice(COUNTRY_CODE.length)
    digits = national.startsWith('0') ? national : `0${national}`
  }
  return MOBILE.test(digits) ? digits : null
}

/** 서버가 받는 휴대전화 번호 형식인지. 유선 전화와 대표 번호는 받지 않는다. */
export function isMobilePhone(text: string): boolean {
  return normalizeMobilePhone(text) !== null
}
