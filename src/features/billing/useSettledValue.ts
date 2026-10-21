import { useEffect, useState } from 'react'

/** 칸을 고친 뒤 이만큼 멈추면 계산한다. 횟수 "1"을 "10"으로 고치는 사이에 "1회"를 묻지 않게 한다. */
export const SETTLE_MS = 400

/**
 * 값이 `delay` 동안 바뀌지 않으면 그 값을 돌려준다. 그 전까지는 이전에 멈춘 값이다.
 * 값은 JSON 내용으로 비교한다(렌더마다 새로 만든 같은 내용의 객체로는 기다림이 다시 시작되지 않는다).
 * null이 되면 바로 null이다(칸을 비우면 옛 금액을 붙잡지 않는다).
 * 처음 값은 기다리지 않고 바로 돌려준다. 돌려주는 객체는 렌더마다 새로 만든다(JSON으로 바꿀 수 있는 값만 쓴다).
 */
export function useSettledValue<T>(value: T | null, delay = SETTLE_MS): T | null {
  const serialized = value === null ? null : JSON.stringify(value)
  const [settled, setSettled] = useState<string | null>(serialized)
  // 비우면 멈춘 값도 바로 비운다. 다시 채웠을 때 비우기 전의 값이 살아나지 않게 한다.
  // effect가 아니라 렌더 중에 맞춘다(React 문서의 "이전 렌더의 정보 저장").
  if (serialized === null && settled !== null) setSettled(null)

  useEffect(() => {
    if (serialized === null) return
    const timer = setTimeout(() => setSettled(serialized), delay)
    return () => clearTimeout(timer)
  }, [serialized, delay])

  return settled === null || serialized === null ? null : (JSON.parse(settled) as T)
}
