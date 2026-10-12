import type { components } from '@/shared/api/schema'

export type Outcome = components['schemas']['AuditLogResponse']['outcome']
type Detail = components['schemas']['AuditLogResponse']['detail']

// 서버가 주는 값의 화면 표시 이름. 서버에 값이 추가되고 타입을 다시 생성하면 여기서 컴파일 에러가 난다.
// 결과를 고르는 칸과 주소를 읽는 곳(AuditLogsPage의 readFilters)은 에러가 나지 않으니 같이 고친다.
const outcomeLabels: Record<Outcome, string> = {
  DONE: '한 일',
  DENIED: '거부',
}

/**
 * 행위 이름의 화면 표시 이름. 행위 이름은 서버의 타입에 없는 문자열이고 기능이 늘면 같이 는다.
 * 여기에 없는 이름은 서버가 준 이름을 그대로 보여준다.
 * 이름과 뜻은 백엔드 전달 문서(frontend-handoff.md)의 행위 이름 표에서 왔다. 서버에 행위가 늘면 여기에 더한다.
 */
const actionLabels: Record<string, string> = {
  'member.student-registered': '학생 등록',
  'member.student-updated': '학생 정보 수정',
  'member.student-phone-removed': '학생 번호 삭제',
  'member.student-duplicated': '학생 등록 거부 (같은 이름)',
  'member.student-phone-revealed': '학생 번호 보기',
  'member.guardian-linked': '학부모 연결',
  'member.guardian-relation-changed': '관계 수정',
  'member.guardian-unlinked': '학부모 연결 끊기',
  'member.guardian-updated': '학부모 이름·번호 수정',
  'member.guardian-phone-duplicated': '학부모 번호 수정 거부 (쓰는 번호)',
  'member.guardian-already-linked': '학부모 연결 거부 (이미 연결)',
  'member.guardian-phone-revealed': '학부모 번호 보기',
  'member.phone-reveal-limited': '번호 보기 한도에 막힘',
  'member.phone-change-limited': '번호 등록·수정 한도에 막힘',
  'member.phone-probe-limited': '있는 번호 거부 한도에 막힘',
}

/** 행위를 고르는 선택 상자에 넣을 목록. */
export const knownActions: readonly { value: string; label: string }[] = Object.entries(
  actionLabels,
).map(([value, label]) => ({ value, label }))

/** 표시 이름을 찾는다. 없는 값은 받은 그대로 돌려준다. 객체에 원래 있는 이름(constructor 등)과 겹쳐도 그대로다. */
function labelOf(labels: Record<string, string>, value: string): string {
  return Object.hasOwn(labels, value) ? labels[value] : value
}

export function outcomeLabel(outcome: Outcome): string {
  // 타입은 생성한 시점의 것이다. 타입에 없는 값이 와도 빈칸이 되지 않게 받은 값을 그대로 보여준다.
  return labelOf(outcomeLabels, outcome)
}

export function actionLabel(action: string): string {
  return labelOf(actionLabels, action)
}

const targetTypeLabels: Record<string, string> = {
  student: '학생',
  guardian: '학부모',
}

/** 대상의 표시 이름(예: "학생 12"). 기록에는 이름이 없고 ID만 있다. 모르는 종류는 그대로 보여준다. */
export function targetLabel(targetType: string, targetId: number | null | undefined): string {
  const type = labelOf(targetTypeLabels, targetType)
  return targetId == null ? type : `${type} ${targetId}`
}

/** 내용을 싣지 못했다는 표시. 서버는 내용 대신 이 키 하나를 true로 준다. */
const detailFlagLabels: Record<string, string> = {
  truncated: '내용이 길어 싣지 않았어요',
  redacted: '개인정보로 보이는 값이 있어 내용을 뺐어요',
  unreadable: '적을 때 내용을 읽지 못했어요',
  corrupted: '기록이 손상됐어요',
}

export type DetailLine = {
  text: string
  /** 기록이 손상됐다는 표시. 눈에 띄게 보여준다. */
  alert: boolean
}

function valueText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/**
 * 덧붙인 내용을 화면에 보여줄 줄들로 바꾼다. 행위마다 키가 달라 정해진 모양이 없으므로 키와 값을 그대로 나열한다.
 * 내용을 싣지 못했다는 표시만 문장으로 바꾼다.
 */
export function detailLines(detail: Detail): DetailLine[] {
  // 타입으로는 객체나 null이지만, 다른 값이 와도 숨기지 않고 한 줄로 보여준다.
  const received: unknown = detail
  if (received !== null && typeof received !== 'object') {
    return [{ text: valueText(received), alert: false }]
  }
  return Object.entries(detail ?? {}).map(([key, value]) =>
    value === true && Object.hasOwn(detailFlagLabels, key)
      ? { text: detailFlagLabels[key], alert: key === 'corrupted' }
      : { text: `${key}: ${valueText(value)}`, alert: false },
  )
}
