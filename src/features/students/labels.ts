import type { components } from '@/shared/api/schema'

type Grade = components['schemas']['StudentSummaryResponse']['grade']
type Status = components['schemas']['StudentSummaryResponse']['status']
type Relation = NonNullable<components['schemas']['ContactResponse']['relation']>

// 서버가 주는 값의 화면 표시 이름. 서버에 값이 추가되고 타입을 다시 생성하면 여기서 컴파일 에러가 난다.
const gradeLabels: Record<Grade, string> = {
  ELEM_1: '초1',
  ELEM_2: '초2',
  ELEM_3: '초3',
  ELEM_4: '초4',
  ELEM_5: '초5',
  ELEM_6: '초6',
  MIDDLE_1: '중1',
  MIDDLE_2: '중2',
  MIDDLE_3: '중3',
  HIGH_1: '고1',
  HIGH_2: '고2',
  HIGH_3: '고3',
  ETC: '기타',
}

const statusLabels: Record<Status, string> = {
  ENROLLED: '재원',
  WITHDRAWN: '퇴원',
}

const relationLabels: Record<Relation, string> = {
  MOTHER: '어머니',
  FATHER: '아버지',
  GRANDPARENT: '조부모',
  OTHER: '기타',
}

// 타입은 생성한 시점의 것이다. 서버가 값을 먼저 추가하면 모르는 값이 올 수 있다.
// 그때 빈칸이나 다른 뜻의 표시로 보이지 않게, 받은 값을 그대로 보여준다.
function labelOf(labels: Record<string, string>, value: string): string {
  return Object.hasOwn(labels, value) ? labels[value] : value
}

export function gradeLabel(grade: Grade): string {
  return labelOf(gradeLabels, grade)
}

export function statusLabel(status: Status): string {
  return labelOf(statusLabels, status)
}

/** 대표 연락처가 누구의 번호인지. 관계가 없으면 학생 본인의 번호다. */
export function contactOwnerLabel(relation: Relation | null | undefined): string {
  return relation ? labelOf(relationLabels, relation) : '본인'
}
