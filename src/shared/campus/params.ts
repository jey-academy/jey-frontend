/**
 * 주소의 campusId 값을 읽는다. 지점으로 거르는 목록 화면들이 같이 쓴다.
 * 1 이상의 숫자(9자리까지)가 아니면 전 지점으로 본다(주소를 손으로 고친 경우).
 * 자릿수를 막아, 터무니없이 큰 값을 서버에 보내지 않는다.
 */
export function readCampusId(value: string | null): number | undefined {
  const id = value !== null && /^\d{1,9}$/.test(value) ? Number(value) : 0
  return id > 0 ? id : undefined
}
