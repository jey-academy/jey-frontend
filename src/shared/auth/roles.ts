import type { Role } from './api'

/** 로그인한 뒤 처음 보여줄 화면. 관리자 전용 화면이 생기면 ADMIN을 그쪽으로 바꾼다. */
const roleHome: Record<Role, string> = {
  STAFF: '/desk/dongtanpass',
  ADMIN: '/desk/dongtanpass',
  PARTNER: '/partner/passes/new',
}

export function homePathOf(role: Role): string {
  return roleHome[role]
}

// 화면을 가리는 용도다. 실제 권한 검사는 서버가 한다(백엔드 ADR-0021).
export const DESK_ROLES: Role[] = ['STAFF', 'ADMIN']
export const PARTNER_ROLES: Role[] = ['PARTNER', 'ADMIN']
export const ADMIN_ROLES: Role[] = ['ADMIN']
