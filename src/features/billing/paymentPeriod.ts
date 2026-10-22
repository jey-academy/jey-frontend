/**
 * 결제 목록의 기간. 날짜는 서버가 받는 모양(`2026-10-23`, 한국 날짜)이다.
 * 서버는 기간을 반드시 받고, 2000-01-01~2099-12-31 안에서 시작일 + 1년까지만 받는다.
 * 1년을 넘는지는 공용 `isPeriodTooLong`(shared/lib), 날짜 범위는 `isPeriodDate`로 본다.
 */

/** 처음 열 때의 기간: 오늘 하루. 하루 정산 때 포스기 매출과 맞춰 보는 화면이다. */
export function defaultPaymentPeriod(today: string): { from: string; to: string } {
  return { from: today, to: today }
}

/**
 * 서버가 기간이 틀렸다고 거절하는 답과 그 안내. 화면의 기간 칸이 막지만 주소를 손으로 고치면 온다.
 * 다시 불러와도 같은 답이라, 이 코드면 다시 불러오기 대신 기간 칸을 고치게 한다(`usePeriodSearch`).
 */
const PAYMENT_PERIOD_ERRORS: Readonly<Record<string, string>> = {
  BILLING_INVALID_PERIOD: '기간이 맞지 않아요. 기간 칸을 고친 뒤 조회해 주세요.',
  BILLING_PERIOD_TOO_LONG: '기간은 1년까지 볼 수 있어요. 기간 칸을 고친 뒤 조회해 주세요.',
}

export const PAYMENT_PERIOD_ERROR_CODES = Object.keys(PAYMENT_PERIOD_ERRORS)

/** 서버가 기간을 거절한 답이면 그 안내, 아니면 null */
export function paymentPeriodErrorText(code: string | null): string | null {
  return code !== null && Object.hasOwn(PAYMENT_PERIOD_ERRORS, code)
    ? PAYMENT_PERIOD_ERRORS[code]
    : null
}
