import { ApiError, retryAfterPhrase, splitServerError } from '@/shared/api'
import type { PassStatus } from '@/shared/ui'

/** 쓸 수 없는 패스(409)의 코드와 그 상태. 결과 패널의 상태 띠로 보여 준다. */
const UNUSABLE_CODES: Record<string, Exclude<PassStatus, 'valid'>> = {
  DONGTANPASS_PASS_ALREADY_REDEEMED: 'used',
  DONGTANPASS_PASS_EXPIRED: 'expired',
  DONGTANPASS_PASS_CANCELED: 'canceled',
}

/** 쓸 수 없는 패스의 코드면 그 상태, 아니면 null. 본인 확인도 같은 코드를 준다(확인 뒤에 상태가 바뀐 경우). */
export function unusableStatusOf(code: string | null): Exclude<PassStatus, 'valid'> | null {
  return code !== null && Object.hasOwn(UNUSABLE_CODES, code) ? UNUSABLE_CODES[code] : null
}

export const CAMPUS_NOT_PROVIDING_MESSAGE =
  '이 지점은 제이G패스를 받지 않아요. 패스를 받는 지점에서 확인해 주세요.'

/** JEY 지점이 발급한 패스(ADR-0040). 연계 학원에서 쓴다. 데스크의 확인·본인 확인·사용 처리 모두 같은 코드로 거부한다. */
export const PASS_FOR_PARTNER_USE = 'DONGTANPASS_PASS_FOR_PARTNER_USE'
export const PASS_FOR_PARTNER_USE_MESSAGE =
  'JEY 어학원이 발급한 패스라 여기서는 쓸 수 없어요. 연계 학원에서만 쓸 수 있다고 학부모님께 안내해 주세요.'

export const QR_RETRY_MESSAGE =
  'QR을 확인하지 못했어요. 학부모 화면에서 QR을 새로 받아 다시 찍어 주세요.'

/** 응답을 놓쳤을 때. 확인은 다시 해도 된다(같은 QR이어도 서버 장애로 토큰만 쓰이지는 않는다). */
const UNSURE = '다시 확인해 주세요. QR이 통하지 않으면 학부모 화면에서 새 QR을 받아 주세요.'

export type DeskVerifyError =
  /** 쓸 수 없는 패스. 서버가 알려 준 사정과 함께 상태 띠로 보여 준다. */
  | { kind: 'unusable'; status: Exclude<PassStatus, 'valid'>; message: string }
  /** 그 밖의 안내. 검색 상자 아래에 보여 준다. */
  | { kind: 'notice'; message: string; requestId: string | null }

/** 데스크 패스 확인의 실패를 화면 안내로 바꾼다(백엔드 handoff "데스크 패스 확인"의 오류 표). */
export function deskVerifyError(error: unknown): DeskVerifyError {
  if (error instanceof ApiError && error.code !== null) {
    const status = unusableStatusOf(error.code)
    if (status) return { kind: 'unusable', status, message: error.message }

    const message = messageByCode(error)
    if (message) return { kind: 'notice', message, requestId: null }
  }
  const { form, requestId } = splitServerError(error, { fields: [], unsure: UNSURE })
  return { kind: 'notice', message: form ?? QR_RETRY_MESSAGE, requestId }
}

function messageByCode(error: ApiError): string | null {
  switch (error.code) {
    // QR이 틀렸거나 만료됐거나 이미 쓴 것. 같은 QR로 다시 해도 같다.
    case 'DONGTANPASS_QR_INVALID':
      return QR_RETRY_MESSAGE
    case 'COMMON_VALIDATION_FAILED':
      return error.fieldErrors.some((field) => field.field === 'qrToken')
        ? QR_RETRY_MESSAGE
        : '패스 번호 형식이 맞지 않아요. DT-로 시작하는 번호인지 다시 확인해 주세요.'
    case 'DONGTANPASS_PASS_NOT_FOUND':
      return '이 번호의 패스가 없어요. 학부모 화면의 패스 번호를 다시 확인해 주세요.'
    case 'DONGTANPASS_CAMPUS_NOT_PROVIDING':
      return CAMPUS_NOT_PROVIDING_MESSAGE
    case PASS_FOR_PARTNER_USE:
      return PASS_FOR_PARTNER_USE_MESSAGE
    // 계정마다 1시간에 60번. QR 확인은 세지 않는다.
    case 'DONGTANPASS_PASS_NO_VERIFY_LIMITED':
      return `패스 번호 확인을 여러 번 했어요. ${retryAfterPhrase(error)}에 다시 하거나, QR로 확인해 주세요.`
    default:
      return null
  }
}
