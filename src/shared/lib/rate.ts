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

/**
 * 퍼센트로 적는 할인율 칸의 오류. 문제가 없으면 undefined. 할인 유형과 JEY 발급 패스의 할인율이 같이 쓴다.
 * 범위(0 초과 100% 이하)는 서버 규칙과 같다. 서버도 검사하지만 서버 문구는 비율 기준("1 이하")이라,
 * 퍼센트 칸에 그대로 보여주면 "1"을 넣으라는 말로 읽힌다. 그래서 퍼센트 기준으로 먼저 안내한다.
 */
export function percentError(text: string): string | undefined {
  if (text.trim() === '') return '할인율을 입력해 주세요.'
  const rate = parsePercent(text)
  if (rate === null) {
    return '퍼센트 숫자로 입력해 주세요. 소수 둘째 자리까지 쓸 수 있어요. 예: 5'
  }
  if (rate <= 0 || rate > 1) return '0보다 크고 100 이하로 입력해 주세요.'
  return undefined
}

/** 입력한 할인율을 읽은 결과. 저장하기 전에 눈으로 확인할 수 있게 입력칸 아래에 보여준다. */
export function percentPreview(text: string): string {
  const rate = parsePercent(text)
  if (rate === null) return '퍼센트로 입력해요. 예: 5'
  // 비율(0.05)로 착각해 넣으면 입력한 숫자와 미리보기 숫자가 같아 맞게 들어간 것처럼 보인다. 1% 미만이면 한 번 더 짚는다.
  if (rate > 0 && rate < 0.01) {
    return `${formatPercent(rate)} 할인이에요. 5% 할인이면 5라고 입력해요.`
  }
  return `${formatPercent(rate)} 할인`
}
