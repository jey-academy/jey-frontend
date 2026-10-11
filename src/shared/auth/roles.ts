import type { Role } from './api'

/** 로그인한 뒤 처음 보여줄 화면. */
const roleHome: Record<Role, string> = {
  STAFF: '/desk/dongtanpass',
  ADMIN: '/admin/settings/classes',
  PARTNER: '/partner/passes/new',
}

export function homePathOf(role: Role): string {
  return roleHome[role]
}

// 화면을 가리는 용도다. 실제 권한 검사는 서버가 한다(백엔드 ADR-0021).
export const DESK_ROLES: Role[] = ['STAFF', 'ADMIN']
export const PARTNER_ROLES: Role[] = ['PARTNER', 'ADMIN']
export const ADMIN_ROLES: Role[] = ['ADMIN']

const sections: [prefix: string, roles: Role[]][] = [
  ['/desk', DESK_ROLES],
  ['/partner', PARTNER_ROLES],
  ['/admin', ADMIN_ROLES],
]

/** 이 역할이 그 주소의 화면을 볼 수 있는지. 가드가 없는 주소는 누구나 볼 수 있다. */
export function canAccess(role: Role, path: string): boolean {
  const pathname = path.split(/[?#]/)[0]
  const section = sections.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
  return !section || section[1].includes(role)
}
