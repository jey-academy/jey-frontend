// 시험용: 타입이 갱신되면(campusId가 number | null) 타입 검사가 실패한다.
import type { components } from '@/shared/api/schema'

declare const me: components['schemas']['MeResponse']
export const campusId: number = me.campusId
