// 서버는 할인율을 비율로 다룬다(5%는 0.05, 소수 넷째 자리까지). 사람은 퍼센트로 읽고 쓴다.
// 여기서는 단위만 바꾼다. 할인 금액 계산은 서버가 한다.

// 소수 넷째 자리까지의 비율은 퍼센트로 소수 둘째 자리까지다.
const PERCENT_INPUT = /^(\d{1,3})(?:\.(\d{1,2}))?\s*%?$/

// 비율의 소수 넷째 자리까지를 정수로 다루기 위한 배수
const SCALE = 10_000

/**
 * 사람이 입력한 퍼센트(`5`, `7.5%`)를 비율(0.05, 0.075)로 바꾼다. 퍼센트로 읽을 수 없으면 null이다.
 * 나눗셈을 하지 않고 소수점 자리만 옮긴다. 나누면 오차가 생기는 값이 많다(1.1 / 100은 0.011000000000000001).
 * 서버는 소수 넷째 자리를 넘는 값을 거부한다.
 * 형식만 본다. 0보다 큰지, 100%를 넘는지는 서버가 판단한다.
 */
export function parsePercent(text: string): number | null {
  const match = PERCENT_INPUT.exec(text.trim())
  if (!match) return null
  const [, whole, fraction = ''] = match
  // "7.25" → 정수부 "007", 소수부 "25" → "0.0725"
  const digits = whole.padStart(3, '0') + fraction.padEnd(2, '0')
  return Number(`${digits.slice(0, -4)}.${digits.slice(-4)}`)
}

/**
 * 서버가 준 비율을 `5%`, `7.25%` 모양으로 바꾼다. 표시만 한다.
 * 비율은 0 이상이고 소수 넷째 자리까지여야 한다. 그렇지 않은 값이 오면 틀린 할인율을 보여주지 않도록 에러를 던진다.
 * 에러를 던지므로 이 함수를 쓰는 화면은 에러 화면(errorElement)으로 감싸져 있어야 한다.
 */
export function formatPercent(rate: number): string {
  const scaled = Math.round(rate * SCALE)
  if (!Number.isFinite(rate) || rate < 0 || Math.abs(rate * SCALE - scaled) > 1e-6) {
    throw new RangeError('할인율은 0 이상이고 소수 넷째 자리까지여야 해요.')
  }
  const whole = Math.floor(scaled / 100)
  const fraction = String(scaled % 100)
    .padStart(2, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}%` : `${whole}%`
}
