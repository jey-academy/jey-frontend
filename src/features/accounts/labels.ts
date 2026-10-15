import type { components } from '@/shared/api/schema'
import { labelOf } from '@/shared/lib'

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

export function roleLabel(role: AccountRole): string {
  return labelOf(roleLabels, role)
}

export function statusLabel(status: AccountStatus): string {
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

/** 만들거나 바꿀 수 있는 역할. 연계 학원 계정은 만들 수 없고, 그 역할로도 그 역할에서도 바꿀 수 없다(400). */
export const ASSIGNABLE_ROLES = ['STAFF', 'ADMIN'] as const satisfies readonly AccountRole[]
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

export function isAssignableRole(role: string): role is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role)
}
