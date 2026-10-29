import type { PartnerLedgerSync, PartnerLedgerSyncReason, PartnerLedgerSyncRetry } from './api'

type ReasonText = {
  /** 무엇이 문제인지 짧게(표의 칸) */
  label: string
  /** 관리자가 할 일 */
  todo: string
}

// 장부 탭 1행에 있어야 하는 머리글(백엔드 ADR-0048, 명세의 HEADER_MISMATCH 설명).
const HEADERS =
  '구분, 사용일, 학생, 패스 번호, 원래 수강료, 할인율, 할인액, 받을 금액, JEY 지점, 앱 표시'

/**
 * 미반영 까닭의 이름과 할 일(명세의 reason 설명, 백엔드 PR #104). 수납 장부(반 나눔처럼 다시 해도 같아 버튼을 숨기는 까닭)와 달리,
 * 여기에는 다시 반영해도 소용없는 까닭이 없다. 그래서 모든 줄에 버튼을 둔다.
 * 모르는 값이면 값 그대로, null이면 "까닭 없음"을 보이고 개발자 확인을 안내한다(`partnerReasonText`).
 */
const REASONS: Record<PartnerLedgerSyncReason, ReasonText> = {
  NOT_CONFIGURED: {
    label: '장부 연결 없음',
    todo: '그 학원의 장부 연결이 없어요(서버 설정). 개발자에게 알려 주세요.',
  },
  TAB_NOT_FOUND: {
    label: '탭 없음',
    todo: '그 학원의 장부 파일에 "제이G패스" 탭이 없어요. 그 이름으로 탭을 만들어 주세요.',
  },
  HEADER_MISMATCH: {
    label: '머리글 다름',
    todo: `"제이G패스" 탭의 1행 머리글을 이대로 맞춰 주세요: ${HEADERS}`,
  },
  ACCESS_DENIED: {
    label: '장부 권한 없음',
    todo: '서비스 계정에 그 장부의 편집 권한이 없거나 키가 만료됐어요.',
  },
  GOOGLE_UNAVAILABLE: {
    label: '구글 장애',
    todo: '구글 장애가 오래 이어졌어요. 잠시 뒤 다시 반영해 주세요.',
  },
  GOOGLE_REJECTED: { label: '구글이 거부', todo: '개발자 확인이 필요해요.' },
  APP_ERROR: { label: '앱 오류', todo: '개발자 확인이 필요해요.' },
}

/** 그 까닭의 이름과 할 일 */
export function partnerReasonText(reason: PartnerLedgerSyncReason | null): ReasonText {
  // hasOwn으로 본다. 그냥 꺼내면 "constructor" 같은 값이 객체의 기본 속성에 걸린다.
  const known = reason !== null && Object.hasOwn(REASONS, reason) ? REASONS[reason] : undefined
  return known ?? { label: reason ?? '까닭 없음', todo: '개발자 확인이 필요해요.' }
}

const KINDS: Record<PartnerLedgerSync['kind'], string> = {
  PARTNER_DISCOUNT: '할인해 줌',
  USED_AT_JEY: 'JEY에서 사용',
}

/** 기록의 종류: 그 학원이 제이G패스로 할인해 주었다 / 그 학원이 발급한 패스가 JEY 지점에서 쓰였다. 모르는 값은 그대로 둔다. */
export function partnerKindText(kind: PartnerLedgerSync['kind']): string {
  return Object.hasOwn(KINDS, kind) ? KINDS[kind] : String(kind)
}

export type RetryNotice = { tone: 'success' | 'warning'; text: string }

/**
 * 다시 반영의 결과 안내. `who`는 "김하윤(패스 12)" 같은 줄 이름이다.
 * 끝나면 목록을 다시 받기 시작한다. 목록에서 빠지는 결과(SYNCED, PENDING)도 안내는 남긴다.
 */
export function partnerRetryResultText(result: PartnerLedgerSyncRetry, who: string): RetryNotice {
  switch (result.status) {
    case 'SYNCED':
      return { tone: 'success', text: `${who}: 장부에 썼어요.` }
    case 'PENDING':
      // 아직 장부에 쓰지 않았다. 끝났다고 여기지 않게 주의 톤이다.
      return {
        tone: 'warning',
        text: `${who}: 아직 장부에 쓰지 않았어요. 서버가 잠시 뒤 다시 해요. 끝내 못 쓰면 이 목록에 다시 나와요.`,
      }
    case 'IN_PROGRESS':
      return { tone: 'warning', text: `${who}: 다른 쪽이 반영하고 있어요. 목록을 다시 받아요.` }
    case 'UNSYNCED':
      return {
        tone: 'warning',
        text: `${who}: 또 쓰지 못했어요. ${partnerReasonText(result.reason).todo}`,
      }
    default:
      // 명세에 없는 결과다. 성공인지 실패인지 모르니 단정하지 않는다.
      return {
        tone: 'warning',
        text: `${who}: 알 수 없는 결과예요(${String(result.status)}). 목록을 확인하고 개발자에게 알려 주세요.`,
      }
  }
}
