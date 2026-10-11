const wonFormatter = new Intl.NumberFormat('ko-KR')

// 에러 메시지에는 값의 종류만 넣는다. 잘못 넘어온 값(전화번호 등)이 화면이나 콘솔에 찍히지 않게 한다.
function describe(value: unknown): string {
  if (typeof value !== 'number') return value === null ? 'null' : typeof value
  if (Number.isNaN(value)) return 'NaN'
  if (!Number.isFinite(value)) return 'Infinity'
  return Number.isInteger(value) ? '너무 큰 숫자' : '소수'
}

/**
 * 서버가 준 금액(원)을 `299,250원` 모양으로 바꾼다.
 * 표시만 한다. 반올림·할인 같은 계산은 서버가 끝낸 값을 받는다.
 * 금액은 정수여야 한다. 소수나 숫자가 아닌 값이 오면 틀린 금액을 보여주지 않도록 에러를 던진다.
 * 에러를 던지므로 이 함수를 쓰는 화면은 에러 화면(errorElement)으로 감싸져 있어야 한다.
 */
export function formatWon(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`금액은 정수여야 해요. (받은 값: ${describe(amount)})`)
  }
  // -0은 "-0원"으로 찍히므로 0으로 바꾼다.
  return `${wonFormatter.format(amount === 0 ? 0 : amount)}원`
}

/**
 * 사람이 입력한 금액(`280,000`, `280000원`)을 원 단위 정수로 바꾼다. 숫자로 읽을 수 없으면 null이다.
 * 형식만 본다. 0원을 받을지, 얼마까지 받을지는 서버가 판단한다.
 */
export function parseWon(text: string): number | null {
  const digits = text.replace(/[\s,]/g, '').replace(/원$/, '')
  if (!/^\d+$/.test(digits)) return null
  const amount = Number(digits)
  return Number.isSafeInteger(amount) ? amount : null
}
