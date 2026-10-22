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

/**
 * 시작일 + 1년. 서버(Java `LocalDate.plusYears`)와 같이 2월 29일은 다음 해 2월 28일이 된다.
 * `from`은 달력에 있는 날짜여야 한다(`isPeriodDate`로 거른 값).
 */
export function oneYearAfter(from: string): string {
  const year = String(Number(from.slice(0, 4)) + 1).padStart(4, '0')
  const monthDay = from.slice(5) === '02-29' ? '02-28' : from.slice(5)
  return `${year}-${monthDay}`
}

/**
 * 기간이 1년(시작일 + 1년)을 넘는지. 패스 사용 내역·결제 목록처럼 서버가 1년까지만 받는 화면이 쓴다.
 * YYYY-MM-DD는 글자 순서가 날짜 순서와 같다.
 */
export function isPeriodTooLong(from: string, to: string): boolean {
  return to > oneYearAfter(from)
}

/** 기간 칸 두 개의 값. 빈 글자는 그 칸을 비운 것이다. */
export type Period = { from: string; to: string }
export type PeriodErrors = Partial<Record<keyof Period, string>>

/**
 * 기간 칸의 오류 문구. 목록 화면들(감사 로그, 패스 발급 장부, 패스 사용 내역)이 같이 쓴다.
 * `badInput`은 칸에 글자는 있는데 날짜로 읽히지 않는지다. 날짜 칸은 달력에 없는 날짜(02-30)나 넣다 만 날짜를 빈 값으로 준다.
 * 그대로 두면 칸에는 글자가 보이는데 그 조건 없이 조회된다.
 * `required`면 빈 칸도 오류다(서버가 기간을 반드시 받는 화면).
 */
export function periodErrors(
  period: Period,
  badInput: Record<keyof Period, boolean>,
  { required = false }: { required?: boolean } = {},
): PeriodErrors {
  const errors: PeriodErrors = {}
  for (const key of ['from', 'to'] as const) {
    if (badInput[key] || (period[key] !== '' && !isPeriodDate(period[key]))) {
      errors[key] = '날짜를 확인해 주세요.'
    } else if (required && period[key] === '') {
      errors[key] = '날짜를 넣어 주세요.'
    }
  }
  // YYYY-MM-DD는 글자 순서가 날짜 순서와 같다.
  if (
    !errors.from &&
    !errors.to &&
    period.from !== '' &&
    period.to !== '' &&
    period.from > period.to
  ) {
    errors.to = '끝일이 시작일보다 앞이에요.'
  }
  return errors
}
