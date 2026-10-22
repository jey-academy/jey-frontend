import { useCallback, useRef, useState } from 'react'

/** 다시 반영의 결과나 오류. 줄(반영 기록)마다 마지막 것 하나다. */
export type RetryResult = {
  /** 반영 기록 id(줄) */
  id: number
  /** 같은 결과가 또 와도 새로 그려 다시 읽히게 하는 번호 */
  seq: number
  tone: 'success' | 'warning' | 'error'
  text: string
  requestId: string | null
}

// 위에 쌓아 두는 결과의 수. 오래된 것부터 빠진다.
const MAX_DETACHED = 5

/**
 * 장부 미반영 화면(수납 장부, 연계 학원 장부)의 다시 반영 결과. 줄이 남아 있으면 그 줄 안에, 목록에서 빠졌으면
 * (장부에 씀 등) 위에 쌓아 보인다(`detached`, 최대 5개). 조건(지점·학원·페이지)을 바꾸면 `clear`로 지운다.
 * `add`는 줄이 화면에서 사라진 뒤에도 불린다(다시 반영 훅의 handlers). 같은 줄의 옛 결과는 바꾼다.
 */
export function useRetryResults() {
  const [results, setResults] = useState<RetryResult[]>([])
  const seq = useRef(0)

  const add = useCallback((result: Omit<RetryResult, 'seq'>) => {
    seq.current += 1
    const next = { ...result, seq: seq.current }
    setResults((current) => [next, ...current.filter((item) => item.id !== result.id)])
  }, [])

  const clear = useCallback(() => setResults([]), [])

  /** 그 줄의 마지막 결과 */
  function resultOf(id: number): RetryResult | null {
    return results.find((result) => result.id === id) ?? null
  }

  /** 지금 목록에 없는 줄의 결과. 최근 것부터 최대 5개다. */
  function detached(shownIds: ReadonlySet<number>): RetryResult[] {
    return results.filter((result) => !shownIds.has(result.id)).slice(0, MAX_DETACHED)
  }

  return { add, clear, resultOf, detached }
}
