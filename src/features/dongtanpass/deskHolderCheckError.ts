import { ApiError, retryAfterPhrase, splitServerError } from '@/shared/api'
import type { PassStatus } from '@/shared/ui'
import { CAMPUS_NOT_PROVIDING_MESSAGE, unusableStatusOf } from './deskVerifyError'

/** 응답을 놓쳤을 때. 본인 확인은 바꾸는 것이 없어 다시 해도 된다. */
const UNSURE = '본인 확인 결과를 받지 못했어요. 다시 해 주세요.'
const FALLBACK = '본인 확인을 하지 못했어요. 다시 해 주세요.'

export type DeskHolderCheckError =
  /** 확인 뒤에 패스를 쓸 수 없게 됐다(그사이 사용·만료·취소). 결과를 그 상태로 바꿔 보여 준다. */
  | { kind: 'unusable'; status: Exclude<PassStatus, 'valid'>; message: string }
  /** 그 밖의 안내. 진행 카드 안에 보여 준다. */
  | { kind: 'notice'; message: string; requestId: string | null }

/** 본인 미리 확인의 실패를 화면 안내로 바꾼다(백엔드 handoff "데스크의 본인 미리 확인"의 오류 표). */
export function deskHolderCheckError(error: unknown): DeskHolderCheckError {
  if (error instanceof ApiError && error.code !== null) {
    const status = unusableStatusOf(error.code)
    if (status) return { kind: 'unusable', status, message: error.message }

    const message = messageByCode(error)
    if (message) return { kind: 'notice', message, requestId: null }
  }
  // 이름·번호 형식(400)은 보내기 전에 걸러서 오지 않는다. 오면 서버 문구를 그대로 보여 준다.
  const { form, requestId } = splitServerError(error, { fields: [], unsure: UNSURE })
  return { kind: 'notice', message: form ?? FALLBACK, requestId }
}

function messageByCode(error: ApiError): string | null {
  switch (error.code) {
    // 계정마다 1시간에 30번. 맞든 틀리든, 404·409도 센다.
    case 'DONGTANPASS_HOLDER_CHECK_LIMITED':
      return `본인 확인을 여러 번 했어요. ${retryAfterPhrase(error)}에 다시 해 주세요.`
    case 'DONGTANPASS_PASS_NOT_FOUND':
      return '패스를 찾지 못했어요. 다음 패스 확인하기를 눌러 처음부터 다시 확인해 주세요.'
    case 'DONGTANPASS_CAMPUS_NOT_PROVIDING':
      return CAMPUS_NOT_PROVIDING_MESSAGE
    default:
      return null
  }
}
