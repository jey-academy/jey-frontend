import { ApiError, isOutcomeUnknown, retryAfterPhrase, supportRequestId } from '@/shared/api'
import type { RetryResult } from './useRetryResults'

/** 그 장부의 다시 반영 오류 코드. 수납 장부와 연계 학원 장부가 코드만 다르고 뜻은 같다. */
export type RetryErrorCodes = {
  /** 409: 미반영이 아닌 줄(이미 반영됐거나 서버가 다시 하는 중) */
  notRetryable: string
  /** 404: 없는 반영 기록 */
  notFound: string
}

/**
 * 다시 반영의 오류 안내. `who`는 줄 이름이다(수납 장부 "김하윤 2026-11(결제 7)", 연계 학원 장부 "김하윤(패스 12)").
 * 어느 경우든 목록은 다시 받기 시작했다(다시 반영 훅의 onSettled).
 */
export function retryErrorNotice(
  error: unknown,
  who: string,
  codes: RetryErrorCodes,
): Omit<RetryResult, 'id' | 'seq'> {
  const requestId = supportRequestId(error)
  if (!(error instanceof ApiError)) {
    // 요청 실패(연결 끊김 등)는 모두 ApiError다. 그 밖의 에러는 답을 받은 뒤 화면 코드에서 났으니,
    // 서버는 반영했을 수 있다. 못 했다고 단정하지 않는다.
    return {
      tone: 'warning',
      text: `${who}: 결과를 확인하지 못했어요. 목록을 다시 받아요. 줄이 남아 있으면 다시 눌러 주세요.`,
      requestId,
    }
  }
  if (isOutcomeUnknown(error)) {
    return {
      tone: 'warning',
      text: `${who}: ${error.message} 반영됐을 수도 있어요. 목록을 다시 받아요. 줄이 남아 있으면 다시 눌러 주세요.`,
      requestId,
    }
  }
  if (error.status === 429) {
    return {
      tone: 'warning',
      text: `${who}: 요청이 너무 많아요. ${retryAfterPhrase(error)}에 다시 눌러 주세요.`,
      requestId: null,
    }
  }
  if (error.code === codes.notRetryable) {
    return {
      tone: 'warning',
      text: `${who}: 이미 반영됐거나 서버가 다시 하는 중이에요. 목록을 다시 받아요.`,
      requestId: null,
    }
  }
  if (error.code === codes.notFound) {
    return {
      tone: 'warning',
      text: `${who}: 반영 기록을 찾지 못했어요. 목록을 다시 받아요.`,
      requestId: null,
    }
  }
  return { tone: 'error', text: `${who}: ${error.message}`, requestId }
}
