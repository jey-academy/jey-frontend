import { useState } from 'react'
import { ApiError, IDEMPOTENCY_IN_PROGRESS, isOutcomeUnknown, isRateLimited } from '@/shared/api'

/**
 * 답을 받지 못한 발급 요청을 기억한다(#160). 연계 학원 발급과 JEY 발급이 같이 쓴다.
 *
 * 발급은 멱등 키를 싣는다. 같은 내용으로 다시 보내면 같은 키가 나가 한 번만 발급된다(useIdempotentPost).
 * 그런데 그 사이 내용이 바뀌면(고지 문구가 바뀌어 다시 동의함, 금액을 고침) 새 키가 나간다.
 * 앞의 요청이 실제로 발급됐다면 패스가 두 장 생긴다. 그래서 내용이 다르면 보내기 전에 목록부터 확인하게 한다.
 *
 * 답을 받았는지는 이렇게 본다(useIdempotentPost가 키를 남기는 경우와 맞춘다).
 * - 응답을 놓쳤거나 서버 오류(5xx), 같은 키가 아직 처리 중(IDEMPOTENCY_IN_PROGRESS): 발급됐을 수 있다. 이 본문을 기억한다.
 * - 횟수 한도(429), 보내지 못함(CSRF 토큰을 받지 못함): 이번 요청은 처리되지 않았고, 앞의 요청이 어떻게 됐는지도 알려 주지
 *   않는다. 기억을 그대로 둔다.
 * - 그 밖의 답(발급, 거부): 앞의 요청과 같은 본문이면 결과를 안 것이므로 잊는다(같은 키라 서버가 보관한 답을 돌려준다).
 * 경고를 보고도 바뀐 내용으로 보내기로 했으면(acknowledge) 그것도 잊는다.
 */
export function useUnsureIssue<Body>() {
  // 답을 받지 못한 요청의 본문(직렬화). 멱등 키를 고르는 기준(useIdempotentPost)과 같게 JSON으로 견준다.
  const [unsure, setUnsure] = useState<string | null>(null)

  return {
    /** 이 본문으로 보내면 앞의 요청과 다른 키가 나가는지. 그렇다면 보내기 전에 경고한다. */
    differs(body: Body): boolean {
      return unsure !== null && unsure !== JSON.stringify(body)
    },
    /** 보낸 요청의 답을 받았다. 답을 받지 못했으면 그 본문을 기억하고, 앞의 요청과 같은 본문의 답이면 잊는다. */
    settle(body: Body, error: unknown) {
      const sent = JSON.stringify(body)
      if (maybeIssued(error)) setUnsure(sent)
      else if (!tellsNothing(error)) setUnsure((current) => (current === sent ? null : current))
    },
    /** 경고를 보고 바뀐 내용으로 보내기로 했다. */
    acknowledge() {
      setUnsure(null)
    },
  }
}

/** 이 요청이 발급됐을 수 있는 답. 응답을 놓쳤거나, 같은 키의 요청이 아직 처리 중이다. */
function maybeIssued(error: unknown): boolean {
  if (error === null || error === undefined) return false
  return (
    isOutcomeUnknown(error) || (error instanceof ApiError && error.code === IDEMPOTENCY_IN_PROGRESS)
  )
}

/** 처리되지 않았고 앞의 요청에 대해서도 알려 주지 않는 답. 횟수 한도(429)이거나 보내지 못했다. */
function tellsNothing(error: unknown): boolean {
  return isRateLimited(error) || (error instanceof ApiError && error.notSent)
}
