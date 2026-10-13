// 서버가 받는 목록의 page 상한. 넘으면 400(COMMON_VALIDATION_FAILED, field는 page)이 온다.
const MAX_PAGE = 10_000

/**
 * 주소의 page 값을 0 이상의 정수로 읽는다. 목록 화면들이 같이 쓴다.
 * 숫자만으로 된 값이 아니거나 서버의 상한을 넘으면 첫 페이지로 본다(주소를 손으로 고친 경우).
 */
export function readPage(value: string | null): number {
  if (value === null || !/^\d{1,5}$/.test(value)) return 0
  const page = Number(value)
  return page <= MAX_PAGE ? page : 0
}
