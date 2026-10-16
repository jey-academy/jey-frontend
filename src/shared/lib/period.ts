/**
 * 기간 조건으로 받는 날짜의 범위. 날짜 입력칸의 min·max로도 쓴다. 목록 화면들(기록, 패스 발급 장부)이 같이 쓴다.
 * 감사 로그에는 서버의 제한이 없고 연도를 잘못 넣은 값(0026년 등)을 거르려고 화면이 둔 것이다.
 * 패스 발급 장부는 서버도 이 범위만 받는다(밖이면 400 DONGTANPASS_INVALID_PERIOD).
 */
export const PERIOD_MIN = '2000-01-01'
export const PERIOD_MAX = '2099-12-31'

/** `2026-10-12` 모양이고 달력에 있으며 받는 범위 안의 날짜인지. */
export function isPeriodDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  // YYYY-MM-DD는 글자 순서가 날짜 순서와 같다.
  if (value < PERIOD_MIN || value > PERIOD_MAX) return false
  // 달력에 없는 날짜(02-30, 13월)는 브라우저에 따라 다른 날짜로 넘어가거나 읽지 못하는 값이 된다.
  // 읽지 못하는 값은 toISOString이 에러를 던지므로 먼저 거르고, 넘어간 값은 다시 적었을 때 달라지는 것으로 거른다.
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
