const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(T.+)?$/
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i

// 학원이 있는 한국 시간 기준으로 날짜를 정한다. 기기 시간대가 달라도 같은 날짜가 보인다.
const seoulDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function invalidDate(): RangeError {
  return new RangeError('날짜 형식이 올바르지 않아요.')
}

/**
 * 서버가 준 날짜 문자열(ISO 형식)을 `2026.11.05` 모양으로 바꾼다.
 * - `2026-11-05`, `2026-11-05T09:00:00`: 적힌 날짜를 그대로 쓴다. Date로 바꾸지 않아 하루씩 밀리지 않는다.
 * - `2026-11-05T15:30:00Z`처럼 시간대가 붙은 값: 한국 시간으로 바꾼 날짜를 쓴다.
 * 형식이 틀리면 에러를 던진다.
 */
export function formatDate(value: string): string {
  const match = ISO_DATE.exec(value)
  if (!match) throw invalidDate()
  const [, year, month, day, time] = match

  if (time && Number.isNaN(new Date(value).getTime())) throw invalidDate()

  if (time && HAS_OFFSET.test(time)) {
    // en-CA 형식은 2026-11-06 모양으로 나온다.
    return seoulDateFormatter.format(new Date(value)).replaceAll('-', '.')
  }

  // 02-30처럼 달력에 없는 날짜를 걸러낸다.
  const utc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (utc.getUTCMonth() !== Number(month) - 1 || utc.getUTCDate() !== Number(day)) {
    throw invalidDate()
  }
  return `${year}.${month}.${day}`
}
