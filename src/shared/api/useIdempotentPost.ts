import { useCallback, useRef } from 'react'
import { createIdempotencyKey } from '@/shared/lib'
import { api } from './client'
import { ApiError, isOutcomeUnknown } from './error'

// 앞서 보낸 같은 키의 요청을 서버가 아직 처리하고 있다. 잠시 뒤 같은 키로 다시 보내면 결과를 받는다.
export const IDEMPOTENCY_IN_PROGRESS = 'COMMON_IDEMPOTENCY_IN_PROGRESS'

// 같은 키로 다시 보내야 하는 실패인지. 서버가 처리했는지 알 수 없거나, 서버가 "잠시 뒤 다시"라고 한 경우다.
// 서버는 이런 응답(5xx, 429)을 키에 묶어 보관하지 않으므로 같은 키로 다시 보내면 새로 처리한다.
function shouldKeepKey(error: unknown): boolean {
  if (isOutcomeUnknown(error)) return true
  return (
    error instanceof ApiError && (error.status === 429 || error.code === IDEMPOTENCY_IN_PROGRESS)
  )
}

/**
 * 무언가를 새로 만드는 POST를 `Idempotency-Key` 헤더와 함께 보내는 함수를 돌려준다.
 * 서버는 같은 키의 요청을 한 번만 처리하고, 다시 오면 처음의 응답을 그대로 돌려준다.
 *
 * 키는 "한 번의 시도"마다 하나다.
 * - 응답을 받지 못했거나(연결 끊김, 시간 초과, 서버 오류) 잠시 뒤 다시 보내라는 답을 받은 뒤,
 *   같은 내용으로 다시 보내면 같은 키를 쓴다. 처음 요청이 처리됐더라도 두 번 만들어지지 않고 그 응답을 받는다.
 * - 성공했거나 서버가 거부한(4xx) 뒤, 또는 내용을 고친 뒤에는 새 키를 쓴다. 같은 키에 다른 내용을 보내면 서버가 거부한다.
 *
 * 지난 시도의 내용은 이 훅을 쓰는 화면이 떠 있는 동안만 메모리에 둔다(화면의 입력값과 같은 수명이다).
 */
export function useIdempotentPost<Body, Result>(path: string): (body: Body) => Promise<Result> {
  // 다시 보낼 수 있게 남겨 둔 지난 시도. 없으면 다음 요청은 새 키로 나간다.
  const pending = useRef<{ key: string; body: string } | null>(null)

  return useCallback(
    async (body: Body) => {
      const serialized = JSON.stringify(body)
      if (pending.current?.body !== serialized) {
        pending.current = { key: createIdempotencyKey(), body: serialized }
      }
      const attempt = pending.current

      try {
        const result = await api.post<Result>(path, body, {
          headers: { 'Idempotency-Key': attempt.key },
        })
        if (pending.current === attempt) pending.current = null
        return result
      } catch (error) {
        if (!shouldKeepKey(error) && pending.current === attempt) pending.current = null
        throw error
      }
    },
    [path],
  )
}
