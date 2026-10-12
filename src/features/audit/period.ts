/**
 * 기간으로 받는 날짜의 범위. 서버의 제한이 아니라 연도를 잘못 넣은 값(0026년 등)을 거르려고 화면이 둔 것이다.
 * 날짜 입력칸의 min·max로도 쓴다.
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

// UTC로 하루를 더한다. 기기 시간대와 상관없이 달력 날짜만 넘어간다.
function nextDay(date: string): string {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

/**
 * 화면의 기간(시작일, 끝일. 둘 다 그날을 포함)을 서버가 받는 시각으로 바꾼다. 날짜는 한국 날짜다.
 * 서버는 `from` 이상 `to` 미만으로 찾는다. 끝일의 기록까지 나오도록 `to`는 끝일 다음 날 0시로 준다.
 * `+`는 요청을 보낼 때 클라이언트가 `%2B`로 바꿔 싣는다.
 */
export function periodQuery(from?: string, to?: string): { from?: string; to?: string } {
  return {
    from: from ? `${from}T00:00:00+09:00` : undefined,
    to: to ? `${nextDay(to)}T00:00:00+09:00` : undefined,
  }
}

const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i

// 학원이 있는 한국 시간으로 보여준다. 기기 시간대가 달라도 같은 시각이 보인다.
// 조각만 꺼내 쓰므로 언어는 상관없다. 달력(서기)과 숫자(0-9)를 못 박아 기기 설정에 따라 달라지지 않게 한다.
// h23은 자정이 24:00이 아니라 00:00으로 나오게 한다.
const seoulDateTimeFormatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/**
 * 서버가 준 시각(UTC, `2026-10-11T15:38:00Z`)을 한국 시각 `2026.10.12 00:38:00`으로 바꾼다.
 * 읽지 못하는 값은 받은 그대로 돌려준다. 기록을 보는 화면이라 한 줄의 시각 때문에 화면 전체를 막지 않는다.
 * 시간대가 붙지 않은 값도 그대로 돌려준다. 브라우저가 기기 시간으로 읽어 틀린 시각이 맞는 것처럼 보이기 때문이다.
 */
export function formatOccurredAt(value: string): string {
  if (!HAS_OFFSET.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  // 로케일의 표시 형식에 기대지 않도록 조각을 따로 꺼내 조립한다.
  const parts = seoulDateTimeFormatter.formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')}.${pick('month')}.${pick('day')} ${pick('hour')}:${pick('minute')}:${pick('second')}`
}
