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
 * 다시 반영의 오류 안내. `who`는 줄 이름("김하윤 2026-11(결제 7)" 등)이다.
 * 어느 경우든 목록은 다시 받기 시작했다(다시 반영 훅의 onSettled).
 */
export function retryErrorNotice(
  error: unknown,
  who: string,
  codes: RetryErrorCodes,
): Omit<RetryResult, 'id' | 'seq'> {
  const requestId = supportRequestId(error)
  if (!(error instanceof ApiError)) {
    return { tone: 'error', text: `${who}: 다시 반영하지 못했어요.`, requestId }
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
