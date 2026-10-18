/**
 * 패스 사용 내역의 기간. 날짜는 모두 서버가 받는 모양(`2026-10-18`, 한국 날짜)이다.
 * 서버는 기간을 반드시 받고, 시작일 + 1년까지만 받는다(넘으면 400 DONGTANPASS_PERIOD_TOO_LONG).
 */

/** 처음 열 때의 기간: 이번 달 1일부터 오늘까지. `today`는 한국의 오늘(`todayInSeoul`)이다. */
export function defaultRedemptionPeriod(today: string): { from: string; to: string } {
  return { from: `${today.slice(0, 8)}01`, to: today }
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

/** 기간이 1년을 넘는지. YYYY-MM-DD는 글자 순서가 날짜 순서와 같다. */
export function isPeriodTooLong(from: string, to: string): boolean {
  return to > oneYearAfter(from)
}
