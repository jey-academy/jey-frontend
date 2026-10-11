/** 등록일로 받는 범위. 날짜 입력칸의 min·max로도 쓴다. */
export const REGISTERED_AT_MIN = '2000-01-01'
export const REGISTERED_AT_MAX = '2099-12-31'

/**
 * 등록일 입력값의 오류 문구. 문제가 없으면 undefined다.
 * 날짜 입력칸은 연도를 치는 도중의 값(`0026-10-12`)이나 다섯 자리 연도도 값으로 준다.
 * 서버는 앞의 것을 그대로 받고(그러면 상세 화면이 날짜를 읽지 못한다), 뒤의 것은 어느 칸인지 알려 주지 않고 거부한다.
 */
export function registeredAtError(value: string): string | undefined {
  if (value === '') return '등록일을 골라 주세요.'
  // YYYY-MM-DD는 글자 순서가 날짜 순서와 같다.
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < REGISTERED_AT_MIN ||
    value > REGISTERED_AT_MAX
  ) {
    return '등록일의 연도를 확인해 주세요.'
  }
  return undefined
}
