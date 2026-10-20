import { ApiError, retryAfterPhrase, splitServerError } from '@/shared/api'
import type { PassStatus } from '@/shared/ui'
import { deskVerifyError, unusableStatusOf, type DeskVerifyError } from './deskVerifyError'

// 연계 학원의 JEY 패스 사용 처리(백엔드 ADR-0041)의 실패를 화면 안내로 바꾼다. 오류 표는 백엔드 handoff
// "연계 학원의 JEY 패스 사용 처리"에 있다. 데스크와 같은 코드는 데스크의 안내를 그대로 쓴다.

/** 꺼진 학원. 모든 단계가 이 답이다. 화면 전체를 서버의 안내로 바꾼다(발급 화면과 같다). */
export const PARTNER_INACTIVE = 'DONGTANPASS_PARTNER_INACTIVE'

/** 연계 학원이 발급한 패스. JEY 지점 데스크에서 쓴다. QR은 쓴 것으로 처리되지 않는다. */
const PASS_FOR_CAMPUS_USE_MESSAGE =
  '연계 학원이 발급한 패스라 여기서는 쓸 수 없어요. JEY 어학원 지점에서 쓰는 패스예요.'
/** 이 학원에서 이미 JEY 패스 할인을 받은 학생. 패스가 달마다 나와도 할인은 학원마다 한 번이다. */
const ALREADY_USED_MESSAGE =
  '이 학생은 이 학원에서 이미 JEY 패스 할인을 받았어요. 할인은 학원마다 한 학생에 한 번이에요.'
/** 확인한 지 30분이 지났다(또는 확인하지 않은 패스). 패스를 다시 확인하게 한다. */
export const REVERIFY_MESSAGE =
  '패스를 확인한 지 30분이 지났어요. 패스를 다시 확인해 주세요. 적은 내용은 그대로 있어요.'

/** 패스 확인의 실패. 데스크의 안내에 꺼진 학원을 더한다. */
export type PartnerVerifyError = DeskVerifyError | { kind: 'inactive'; message: string }

export function partnerVerifyError(error: unknown): PartnerVerifyError {
  if (error instanceof ApiError) {
    if (error.code === PARTNER_INACTIVE) return { kind: 'inactive', message: error.message }
    const message = sharedMessage(error.code)
    if (message) return { kind: 'notice', message, requestId: null }
  }
  return deskVerifyError(error)
}

/**
 * 패스 확인의 실패가 지금 보던 확인 결과를 내려야 하는 답인지. 쓸 수 없는 패스, 이 학원에서 쓸 수 없는 패스, 꺼진 학원이다.
 * 잠깐의 오류(연결, 틀린 QR, 없는 번호, 한도)면 보던 결과와 적은 것을 남긴다(30분이 지나 다시 확인하는 중일 수 있다).
 */
export function clearsVerifiedPass(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.code === null) return false
  return (
    unusableStatusOf(error.code) !== null ||
    sharedMessage(error.code) !== null ||
    error.code === PARTNER_INACTIVE
  )
}

/** 원래 수강료 칸의 오류. 미리 보기와 사용 처리가 같은 규칙으로 거부한다. */
export const ORIGINAL_FEE_ERROR =
  '원래 수강료는 0원보다 크고 1,000만 원 이하로, 1원 단위까지 적어 주세요.'

/** 확인 뒤 단계(본인 확인, 금액 미리 보기, 사용 처리)의 실패 */
export type PartnerStepError =
  /** 꺼진 학원 */
  | { kind: 'inactive'; message: string }
  /** 확인한 지 30분이 지났다. 패스를 다시 확인하게 한다. 같은 패스면 적은 것은 그대로 둔다. */
  | { kind: 'reverify'; message: string }
  /** 그사이 패스를 쓸 수 없게 됐다(사용·만료·취소). 결과를 그 상태로 바꿔 보여 준다. */
  | { kind: 'unusable'; status: Exclude<PassStatus, 'valid'>; message: string }
  /** 이 패스로는 더 할 수 없다(연계 학원 발급 패스, 이미 할인받은 학생). 다음 패스로 넘어가게 한다. */
  | { kind: 'blocked'; message: string }
  /** 원래 수강료 칸의 문제 */
  | { kind: 'fee'; message: string }
  /** 그 밖의 안내. 다시 할 수 있다. */
  | { kind: 'notice'; message: string; requestId: string | null }

type Step = 'check' | 'quote' | 'redeem'

const UNSURE: Record<Step, string> = {
  check: '본인 확인 결과를 받지 못했어요. 다시 해 주세요.',
  quote: '받을 금액을 받지 못했어요. 다시 해 주세요.',
  // 같은 키로 다시 보내므로 두 번 처리되지 않는다.
  redeem: '사용 처리 결과를 받지 못했어요. 그대로 다시 해 주세요. 두 번 처리되지 않아요.',
}
const FALLBACK: Record<Step, string> = {
  check: '본인 확인을 하지 못했어요. 다시 해 주세요.',
  quote: '받을 금액을 계산하지 못했어요. 다시 해 주세요.',
  redeem: '패스를 사용 처리하지 못했어요. 다시 해 주세요.',
}

export function partnerStepError(step: Step, error: unknown): PartnerStepError {
  if (error instanceof ApiError && error.code !== null) {
    if (error.code === PARTNER_INACTIVE) return { kind: 'inactive', message: error.message }
    if (error.code === 'DONGTANPASS_PASS_NOT_VERIFIED') {
      return { kind: 'reverify', message: REVERIFY_MESSAGE }
    }
    const status = unusableStatusOf(error.code)
    if (status) return { kind: 'unusable', status, message: error.message }
    const blocked = sharedMessage(error.code)
    if (blocked) return { kind: 'blocked', message: blocked }
    if (isFeeError(error)) return { kind: 'fee', message: ORIGINAL_FEE_ERROR }
    const message = stepMessage(error)
    if (message) return { kind: 'notice', message, requestId: null }
  }
  const { form, requestId } = splitServerError(error, { fields: [], unsure: UNSURE[step] })
  return { kind: 'notice', message: form ?? FALLBACK[step], requestId }
}

function sharedMessage(code: string | null): string | null {
  switch (code) {
    case 'DONGTANPASS_PASS_FOR_CAMPUS_USE':
      return PASS_FOR_CAMPUS_USE_MESSAGE
    case 'DONGTANPASS_STUDENT_ALREADY_USED_AT_PARTNER':
      return ALREADY_USED_MESSAGE
    default:
      return null
  }
}

// 0원, 1원 단위가 아님, 1,000만 원 초과(INVALID_ORIGINAL_FEE). 화면이 숫자로 바꿔 보내므로 형식 오류(400)는
// 오지 않아야 하지만, 오면 originalFee 칸을 짚는다.
function isFeeError(error: ApiError): boolean {
  return (
    error.code === 'DONGTANPASS_INVALID_ORIGINAL_FEE' ||
    (error.code === 'COMMON_VALIDATION_FAILED' &&
      error.fieldErrors.some((field) => field.field === 'originalFee'))
  )
}

function stepMessage(error: ApiError): string | null {
  switch (error.code) {
    // 화면은 본인 확인에서 맞은 입력 그대로 보내므로 보통 오지 않는다(그사이 서버의 패스 정보가 바뀐 경우 등).
    // 오면 미리 확인의 "맞지 않음"과 같은 안내를 하고, 흐름이 본인 확인부터 다시 하게 한다.
    case 'DONGTANPASS_HOLDER_NAME_MISMATCH':
      return '학생 이름이 패스와 달라요. 등록 서류의 이름을 확인해 주세요. 맞는데도 다르면 JEY 어학원에 확인해 주세요.'
    case 'DONGTANPASS_HOLDER_PHONE_MISMATCH':
      return '학부모 번호가 패스와 달라요. JEY 어학원에 등록된 학부모 번호인지 확인해 주세요.'
    // 계정마다 데스크와 같은 한도다.
    case 'DONGTANPASS_HOLDER_CHECK_LIMITED':
      return `본인 확인을 여러 번 했어요. ${retryAfterPhrase(error)}에 다시 해 주세요.`
    case 'DONGTANPASS_REDEEM_LIMITED':
      return `사용 처리를 여러 번 했어요. ${retryAfterPhrase(error)}에 다시 해 주세요.`
    case 'DONGTANPASS_PASS_CHANGED_CONCURRENTLY':
      return '다른 처리와 겹쳤어요. 다시 해 주세요.'
    default:
      return null
  }
}
