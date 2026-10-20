import { ApiError, retryAfterPhrase, splitServerError } from '@/shared/api'
import type { PassStatus } from '@/shared/ui'
import {
  CAMPUS_NOT_PROVIDING_MESSAGE,
  PASS_FOR_PARTNER_USE,
  PASS_FOR_PARTNER_USE_MESSAGE,
  unusableStatusOf,
} from './deskVerifyError'

/** 응답을 놓쳤을 때. 같은 키로 다시 보내므로 두 번 처리되지 않는다. */
const UNSURE = '사용 처리 결과를 받지 못했어요. 그대로 다시 해 주세요. 두 번 처리되지 않아요.'
const FALLBACK = '패스를 사용 처리하지 못했어요. 다시 해 주세요.'

/** 안내와 함께 열어 줄 학생 화면. 고친 뒤 데스크로 돌아와 다시 하게 한다. */
export type RedeemFix = 'student' | 'studentEdit'

export type DeskRedeemError =
  /** 등록 뒤에 패스를 쓸 수 없게 됐다(그사이 사용·만료·취소). 학생은 등록돼 있다. */
  | { kind: 'unusable'; status: Exclude<PassStatus, 'valid'>; message: string }
  /**
   * 그 밖의 안내. 진행 카드 안에 보여 준다. 보통은 사용 처리만 다시 할 수 있다.
   * `final`이면 다시 해도 같은 답이다(횟수만 쓴다). 다시 하기를 두지 않는다.
   */
  | { kind: 'notice'; message: string; requestId: string | null; fix?: RedeemFix; final?: true }

/** 패스 사용 처리의 실패를 화면 안내로 바꾼다(백엔드 handoff "패스 사용 처리"의 오류 표). */
export function deskRedeemError(error: unknown): DeskRedeemError {
  if (error instanceof ApiError && error.code !== null) {
    const status = unusableStatusOf(error.code)
    if (status) return { kind: 'unusable', status, message: error.message }

    const known = byCode(error)
    if (known) return { kind: 'notice', requestId: null, ...known }
  }
  const { form, requestId } = splitServerError(error, { fields: [], unsure: UNSURE })
  return { kind: 'notice', message: form ?? FALLBACK, requestId }
}

function byCode(error: ApiError): { message: string; fix?: RedeemFix; final?: true } | null {
  switch (error.code) {
    case 'DONGTANPASS_DISCOUNT_INACTIVE':
      return { message: '패스 할인이 꺼져 있어요. 관리자에게 켜 달라고 한 뒤 다시 해 주세요.' }
    case 'DONGTANPASS_STUDENT_NOT_AT_PROVIDING_CAMPUS':
      return {
        message:
          '학생의 지점이 패스를 받는 지점이 아니에요. 학생 정보에서 지점을 고친 뒤 다시 해 주세요.',
        fix: 'studentEdit',
      }
    case 'DONGTANPASS_STUDENT_NOT_NEW':
      return {
        message:
          '신규 등록 학생이 아니라서 패스를 쓸 수 없어요. 이미 패스를 쓴 학생이거나, 등록한 지 7일이 지났거나, 재원 중이 아니에요. 학생 정보를 확인해 주세요.',
        final: true,
      }
    // 미리 확인 뒤에 패스나 학생이 바뀐 경우다. 미리 확인의 "맞지 않음"과 같은 안내를 한다.
    case 'DONGTANPASS_HOLDER_NAME_MISMATCH':
      return {
        message:
          '학생 이름이 패스와 달라요. 학생 정보의 이름을 확인해 주세요. 패스의 이름이 틀렸다면 발급한 학원에 다시 발급을 요청해 주세요.',
        fix: 'studentEdit',
      }
    case 'DONGTANPASS_HOLDER_PHONE_MISMATCH':
      return {
        message:
          '패스를 받을 때 알려 준 학부모 번호가 학생 정보에 없어요. 학생 정보에서 학부모 번호를 더한 뒤 다시 해 주세요.',
        fix: 'student',
      }
    // 같은 패스를 고친 다른 요청과 겹쳤다. 패스는 아직 쓸 수 있다.
    case 'DONGTANPASS_PASS_CHANGED_CONCURRENTLY':
      return { message: '다른 처리와 겹쳤어요. 다시 해 주세요.' }
    // 계정마다 1시간에 30번. 성공·실패 모두 센다.
    case 'DONGTANPASS_REDEEM_LIMITED':
      return { message: `사용 처리를 여러 번 했어요. ${retryAfterPhrase(error)}에 다시 해 주세요.` }
    // 확인을 통과한 패스라 생기지 않아야 한다. 패스를 다시 확인하면 학생을 한 번 더 등록하게 되므로 그렇게 이끌지 않는다.
    case 'DONGTANPASS_PASS_NOT_FOUND':
      return {
        message:
          '패스를 찾지 못했어요. 학생은 이미 등록됐어요. 다시 등록하지 말고 관리자에게 알려 주세요.',
        final: true,
      }
    case 'DONGTANPASS_STUDENT_NOT_FOUND':
      return { message: '등록한 학생을 찾지 못했어요. 학생 목록에서 확인해 주세요.', final: true }
    case 'DONGTANPASS_CAMPUS_NOT_PROVIDING':
      return { message: CAMPUS_NOT_PROVIDING_MESSAGE, final: true }
    // 확인에서 이미 거부돼 오지 않아야 한다. 이때는 학생이 이미 등록돼 있다.
    case PASS_FOR_PARTNER_USE:
      return { message: `${PASS_FOR_PARTNER_USE_MESSAGE} 학생은 이미 등록됐어요.`, final: true }
    default:
      return null
  }
}
