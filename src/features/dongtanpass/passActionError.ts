import { ApiError, CODE_ERROR_MESSAGE, isOutcomeUnknown } from '@/shared/api'

/** 그 사이 패스가 바뀌었다는 답. 장부를 다시 받으면 줄의 상태가 맞아진다. */
const STALE_PASS_CODES = new Set([
  'DONGTANPASS_PASS_CANCELED',
  'DONGTANPASS_PASS_ALREADY_REDEEMED',
  'DONGTANPASS_PASS_NOT_FOUND',
])

/** 장부의 줄이 낡았다는 답인지(취소됨, 사용됨, 없음). */
export function isStalePassError(error: unknown): boolean {
  return error instanceof ApiError && error.code !== null && STALE_PASS_CODES.has(error.code)
}

/**
 * 장부의 줄 버튼(링크 새로 만들기, 취소)이 실패했을 때 창 안에 보여 줄 문구.
 * `unsure`는 처리됐는지 알 수 없을 때 덧붙이는 말이다. 같은 키로 다시 보내므로 그대로 다시 누르게 한다.
 */
export function passActionErrorMessage(error: unknown, unsure: string): string {
  // 화면 코드의 버그다.
  if (!(error instanceof ApiError)) return CODE_ERROR_MESSAGE
  if (isStalePassError(error)) return `${error.message} 목록을 새로 불러왔어요.`
  if (isOutcomeUnknown(error)) return `${error.message} ${unsure}`
  return error.message
}
