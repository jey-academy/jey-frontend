import { useState } from 'react'
import { isOutcomeUnknown } from '@/shared/api'

/**
 * 답을 받지 못한 발급 요청을 기억한다(#160). 연계 학원 발급과 JEY 발급이 같이 쓴다.
 *
 * 발급은 멱등 키를 싣는다. 같은 내용으로 다시 보내면 같은 키가 나가 한 번만 발급된다(useIdempotentPost).
 * 그런데 그 사이 내용이 바뀌면(고지 문구가 바뀌어 다시 동의함, 금액을 고침) 새 키가 나간다.
 * 앞의 요청이 실제로 발급됐다면 패스가 두 장 생긴다. 그래서 내용이 다르면 보내기 전에 목록부터 확인하게 한다.
 *
 * 앞의 요청에 같은 내용으로 다시 보내 답을 받으면(발급이든 거부든) 결과를 안 것이므로 잊는다.
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
      if (error !== null && isOutcomeUnknown(error)) setUnsure(sent)
      else setUnsure((current) => (current === sent ? null : current))
    },
    /** 경고를 보고 바뀐 내용으로 보내기로 했다. */
    acknowledge() {
      setUnsure(null)
    },
  }
}
