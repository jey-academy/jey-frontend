/**
 * 패스 사용 내역의 기간. 날짜는 모두 서버가 받는 모양(`2026-10-18`, 한국 날짜)이다.
 * 서버는 기간을 반드시 받고, 2000-01-01~2099-12-31 안에서 시작일 + 1년까지만 받는다
 * (밖이면 400 DONGTANPASS_INVALID_PERIOD, 넘으면 DONGTANPASS_PERIOD_TOO_LONG).
 */

/** 처음 열 때의 기간: 이번 달 1일부터 오늘까지. `today`는 한국의 오늘(`todayInSeoul`)이다. */
export function defaultRedemptionPeriod(today: string): { from: string; to: string } {
  return { from: `${today.slice(0, 8)}01`, to: today }
}

/**
 * 서버가 기간이 틀렸다고 거절하는 답과 그 안내. 화면의 기간 칸이 막지만 주소를 손으로 고치면 온다.
 * 다시 불러와도 같은 답이라, 사용 내역 화면은 이 코드면 다시 불러오기 대신 기간 칸을 고치게 한다(`usePeriodSearch`).
 */
export const REDEMPTION_PERIOD_ERRORS: Readonly<Record<string, string>> = {
  DONGTANPASS_INVALID_PERIOD: '기간이 맞지 않아요. 기간 칸을 고친 뒤 조회해 주세요.',
  DONGTANPASS_PERIOD_TOO_LONG: '기간은 1년까지 볼 수 있어요. 기간 칸을 고친 뒤 조회해 주세요.',
}

export const REDEMPTION_PERIOD_ERROR_CODES = Object.keys(REDEMPTION_PERIOD_ERRORS)

/** 서버가 기간을 거절한 답이면 그 안내, 아니면 null */
export function redemptionPeriodErrorText(code: string | null): string | null {
  return code !== null && Object.hasOwn(REDEMPTION_PERIOD_ERRORS, code)
    ? REDEMPTION_PERIOD_ERRORS[code]
    : null
}
