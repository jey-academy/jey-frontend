import type { PassVerifyRequest } from './api'

/**
 * 이 길이를 넘으면 사람이 친 패스 번호가 아니라 스캐너가 넣은 QR 글자로 본다.
 * 패스 번호는 9자(DT-ABC234), QR 글자는 약 90자다. 번호에 공백이 몇 개 섞여도 넘지 않는다.
 */
const QR_MIN_LENGTH = 21

/**
 * 데스크 입력 칸의 값을 확인 요청으로 바꾼다. 비어 있으면 null.
 * - 길면 USB 스캐너가 넣은 QR 글자다. 대소문자를 구분하는 서명 글자라 앞뒤 공백만 떼고 그대로 보낸다.
 * - 짧으면 사람이 친 패스 번호다. 서버는 소문자·공백을 고쳐 주지 않으므로 공백을 모두 떼고 대문자로 보낸다.
 *   형식(DT- + 6자)은 서버가 본다(틀리면 400으로 칸 오류가 온다).
 */
export function toVerifyRequest(input: string): PassVerifyRequest | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (trimmed.length >= QR_MIN_LENGTH) return { qrToken: trimmed }
  return { passNo: trimmed.replace(/\s+/g, '').toUpperCase() }
}
