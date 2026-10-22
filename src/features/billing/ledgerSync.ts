import type { LedgerSyncReason, LedgerSyncRetry } from './api'

type ReasonText = {
  /** 무엇이 문제인지 짧게(표의 칸) */
  label: string
  /** 관리자가 할 일 */
  todo: string
  /** 다시 반영해도 같은 결과인지. 그러면 버튼을 두지 않는다. */
  final?: boolean
}

/**
 * 미반영 까닭의 이름과 할 일(명세의 reason 설명, 백엔드 PR #92). `{month}`는 그 줄의 대상 월("2026년 11월")로 바꾼다.
 * 모르는 값이면 값 그대로, null이면 "까닭 없음"을 보이고 개발자 확인을 안내한다(`reasonText`).
 */
const REASONS: Record<LedgerSyncReason, ReasonText> = {
  // 탭 이름은 서버 설정의 틀로 정해지고 응답에 없다(백엔드 #98). 이름을 짐작해 적지 않고 기본 모양을 예로 든다.
  TAB_NOT_FOUND: {
    label: '그 달 탭 없음',
    todo: '장부에 그 지점의 {month} 탭이 없어요. 탭을 만들거나 이름을 맞춰 주세요(기본 이름 예: 11월 동탄관(26)).',
  },
  BLOCK_NOT_FOUND: {
    label: '반 블록 없음',
    todo: '그 반 블록이 없어요. A열 칸의 첫 줄이 반 이름과 같은지 봐 주세요.',
  },
  NO_EMPTY_ROW: { label: '빈 줄 없음', todo: '반 블록에 빈 줄(No만 적힌 줄)을 더해 주세요.' },
  MARKER_NOT_FOUND: {
    label: '취소 표시 못 찾음',
    todo: '장부에 쓴 결제를 취소했는데 그 줄의 "앱:결제-N" 표시를 찾지 못했어요. 장부에서 직접 취소 표시를 해 주세요.',
  },
  HEADER_NOT_FOUND: {
    label: '머리글 없음',
    todo: '머리글(성명 등 칸 이름, 그 달 칸)을 확인해 주세요.',
  },
  NOT_CONFIGURED: { label: '장부 연결 없음', todo: '그 지점의 장부 연결이 없어요(관리자 설정).' },
  ACCESS_DENIED: {
    label: '장부 권한 없음',
    todo: '서비스 계정에 장부 편집 권한이 없거나 키가 만료됐어요.',
  },
  NO_CONTACT: { label: '연락처 없음', todo: '학생에게 연락처가 없어요. 학부모를 더해 주세요.' },
  SPLIT_CLASS: {
    label: '반 나눔',
    todo: '반 나눔 청구라 장부에 직접 적어 주세요.',
    final: true,
  },
  GOOGLE_UNAVAILABLE: {
    label: '구글 장애',
    todo: '구글 장애가 오래 이어졌어요. 잠시 뒤 다시 반영해 주세요.',
  },
  GOOGLE_REJECTED: { label: '구글이 거부', todo: '개발자 확인이 필요해요.' },
  APP_ERROR: { label: '앱 오류', todo: '개발자 확인이 필요해요.' },
}

/** 대상 월 `2026-11`을 "2026년 11월"로. 모양이 다르면 받은 그대로 둔다. */
function monthText(targetMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(targetMonth)
  return match ? `${match[1]}년 ${Number(match[2])}월` : targetMonth
}

/** 그 까닭의 이름과 할 일. 대상 월을 넣는다. */
export function reasonText(reason: LedgerSyncReason | null, targetMonth: string): ReasonText {
  // hasOwn으로 본다. 그냥 꺼내면 "constructor" 같은 값이 객체의 기본 속성에 걸린다.
  const known = reason !== null && Object.hasOwn(REASONS, reason) ? REASONS[reason] : undefined
  if (!known) {
    return { label: reason ?? '까닭 없음', todo: '개발자 확인이 필요해요.' }
  }
  return { ...known, todo: known.todo.replace('{month}', monthText(targetMonth)) }
}

export type RetryNotice = { tone: 'success' | 'warning'; text: string }

/**
 * 다시 반영의 결과 안내. `who`는 "김하윤 2026-11(결제 7)" 같은 줄 이름이다.
 * 끝나면 목록을 다시 받기 시작한다(useRetryLedgerSync). 목록에서 빠지는 결과(SYNCED, PENDING, CANCELED)도 안내는 남긴다.
 */
export function retryResultText(
  result: LedgerSyncRetry,
  who: string,
  targetMonth: string,
): RetryNotice {
  switch (result.status) {
    case 'SYNCED':
      return { tone: 'success', text: `${who}: 장부에 썼어요.` }
    case 'CANCELED':
      return { tone: 'success', text: `${who}: 취소한 결제라 처리를 마쳤어요.` }
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
        text: `${who}: 또 쓰지 못했어요. ${reasonText(result.reason, targetMonth).todo}`,
      }
    default:
      // 명세에 없는 결과다. 성공인지 실패인지 모르니 단정하지 않는다.
      return {
        tone: 'warning',
        text: `${who}: 알 수 없는 결과예요(${String(result.status)}). 목록을 확인하고 개발자에게 알려 주세요.`,
      }
  }
}
