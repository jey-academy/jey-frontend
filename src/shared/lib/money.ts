const wonFormatter = new Intl.NumberFormat('ko-KR')

/**
 * 서버가 준 금액(원)을 `299,250원` 모양으로 바꾼다.
 * 표시만 한다. 반올림·할인 같은 계산은 서버가 한 값을 그대로 쓴다.
 * 숫자가 아닌 값(NaN, Infinity)이 오면 틀린 금액을 보여주지 않도록 에러를 던진다.
 */
export function formatWon(amount: number): string {
  if (!Number.isFinite(amount)) {
    throw new RangeError('금액이 올바른 숫자가 아니에요.')
  }
  // -0은 "-0원"으로 찍히므로 0으로 바꾼다.
  return `${wonFormatter.format(amount === 0 ? 0 : amount)}원`
}
