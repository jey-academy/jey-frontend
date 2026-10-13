import type { components } from '@/shared/api/schema'

export type AccountRole = components['schemas']['AccountResponse']['role']
export type AccountStatus = components['schemas']['AccountResponse']['status']

// 서버가 주는 값의 화면 표시 이름. 서버에 값이 추가되고 타입을 다시 생성하면 여기서 컴파일 에러가 난다.
const roleLabels: Record<AccountRole, string> = {
  ADMIN: '관리자',
  STAFF: '직원',
  PARTNER: '연계 학원',
}

const statusLabels: Record<AccountStatus, string> = {
  ACTIVE: '사용 중',
  DISABLED: '차단됨',
}

// 모르는 값이 오면 다른 뜻의 이름으로 바꾸지 않고 받은 값을 그대로 보여준다(서버가 값을 먼저 추가한 경우).
function labelOf(labels: Record<string, string>, value: string): string {
  return Object.hasOwn(labels, value) ? labels[value] : value
}

export function roleLabel(role: string): string {
  return labelOf(roleLabels, role)
}

export function statusLabel(status: string): string {
  return labelOf(statusLabels, status)
}

/** 거르기 조건의 역할 선택지. 연계 학원 계정도 목록에는 있을 수 있다. */
export const roleOptions = (Object.keys(roleLabels) as AccountRole[]).map((value) => ({
  value,
  label: roleLabels[value],
}))

export const statusOptions = (Object.keys(statusLabels) as AccountStatus[]).map((value) => ({
  value,
  label: statusLabels[value],
}))

/** 만들거나 바꿀 수 있는 역할. 연계 학원 계정은 만들 수 없고, 그 역할로 바꿀 수도 없다. */
export const ASSIGNABLE_ROLES = ['STAFF', 'ADMIN'] as const satisfies readonly AccountRole[]
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

export function isAssignableRole(role: string): role is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role)
}
