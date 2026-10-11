const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(T.+)?$/
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i

// 학원이 있는 한국 시간 기준으로 날짜를 정한다. 기기 시간대가 달라도 같은 날짜가 보인다.
const seoulDateFormatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// 에러 메시지에는 값의 종류만 넣는다. 잘못 넘어온 값(전화번호 등)이 화면이나 콘솔에 찍히지 않게 한다.
function invalidDate(value: unknown): RangeError {
  const kind =
    typeof value === 'string' ? `문자열 ${value.length}자` : value === null ? 'null' : typeof value
  return new RangeError(`날짜 형식이 올바르지 않아요. (받은 값: ${kind})`)
}

// 로케일의 표시 형식에 기대지 않도록 연·월·일을 따로 꺼내 조립한다.
function toSeoulDate(date: Date): string {
  const parts = seoulDateFormatter.formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year').padStart(4, '0')}.${pick('month')}.${pick('day')}`
}

/**
 * 오늘 날짜를 서버가 받는 모양(`2026-11-05`)으로 돌려준다. 학원이 있는 한국 시간 기준이다.
 * 날짜 입력칸의 기본값으로 쓴다. 기기 시간대가 달라도, 자정 무렵에도 한국의 오늘이 나온다.
 */
export function todayInSeoul(now: Date = new Date()): string {
  return toSeoulDate(now).replaceAll('.', '-')
}

/**
 * 서버가 준 날짜 문자열(ISO 형식)을 `2026.11.05` 모양으로 바꾼다.
 * - `2026-11-05`, `2026-11-05T09:00:00`: 적힌 날짜를 그대로 쓴다. Date로 바꾸지 않아 하루씩 밀리지 않는다.
 *   시간대가 없는 값은 서버가 한국 시간으로 적었다고 믿는다. 서버가 UTC로 적어 보내면 에러 없이 하루 전 날짜가 나온다.
 * - `2026-11-05T15:30:00Z`처럼 시간대가 붙은 값: 한국 시간으로 바꾼 날짜를 쓴다.
 * 형식이 틀리거나 달력에 없는 날짜면 에러를 던진다.
 * 에러를 던지므로 이 함수를 쓰는 화면은 에러 화면(errorElement)으로 감싸져 있어야 한다.
 */
export function formatDate(value: string): string {
  const match = ISO_DATE.exec(value)
  if (!match) throw invalidDate(value)
  const [, year, month, day, time] = match

  // 1000년 이전은 받지 않는다. Date가 0~99년을 1900년대로 바꿔 읽어 윤년 판단이 틀어진다.
  if (Number(year) < 1000) throw invalidDate(value)

  // 02-30처럼 달력에 없는 날짜를 걸러낸다. 시각이 붙은 값도 적힌 날짜부터 확인한다.
  // (확인하지 않으면 브라우저가 02-30을 03-02로 넘겨 읽는다.)
  const utc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (utc.getUTCMonth() !== Number(month) - 1 || utc.getUTCDate() !== Number(day)) {
    throw invalidDate(value)
  }
  if (!time) return `${year}.${month}.${day}`

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw invalidDate(value)

  return HAS_OFFSET.test(time) ? toSeoulDate(parsed) : `${year}.${month}.${day}`
}
