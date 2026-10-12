import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { components } from '@/shared/api/schema'
import type { Outcome } from './labels'
import { periodQuery } from './period'

/** 누가 언제 무엇에 무엇을 했는지 한 줄. 이름과 전화번호는 없고 ID만 있다. */
export type AuditLog = components['schemas']['AuditLogResponse']
export type AuditLogPage = components['schemas']['AuditLogPageResponse']

export type AuditLogFilters = {
  outcome?: Outcome
  /** 그 일을 한 계정의 ID */
  actorId?: number
  /** 행위 이름. 정확히 같은 것만 찾는다 */
  action?: string
  targetType?: string
  /** `targetType`과 함께 준다. 혼자 주면 서버가 거부한다(AUDIT_TARGET_TYPE_REQUIRED). */
  targetId?: number
  /** 시작일(`2026-10-12`, 한국 날짜). 그날을 포함한다 */
  from?: string
  /** 끝일(`2026-10-12`, 한국 날짜). 그날을 포함한다 */
  to?: string
  /** 0부터 */
  page: number
}

type AuditLogListKey = readonly ['audit-logs', 'list', AuditLogFilters]

function sameExceptPage(a: AuditLogFilters | undefined, b: AuditLogFilters): boolean {
  if (!a) return false
  return JSON.stringify({ ...a, page: undefined }) === JSON.stringify({ ...b, page: undefined })
}

/** 감사 로그의 한 페이지. 최신순이다. 관리자만 볼 수 있다(직원·연계 학원은 403). */
export function useAuditLogs(filters: AuditLogFilters) {
  const queryKey: AuditLogListKey = ['audit-logs', 'list', filters]
  const { from, to, page, ...rest } = filters

  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.get<AuditLogPage>('/api/v1/audit-logs', {
        // 첫 페이지는 서버의 기본값이라 싣지 않는다.
        query: { ...rest, ...periodQuery(from, to), page: page || undefined },
        signal,
      }),
    // 같은 조건에서 페이지만 넘길 때는, 다음 페이지를 받는 동안 이전 페이지를 그대로 보여준다(표가 사라졌다 나타나지 않게).
    // 조건이 바뀌었을 때는 보여주지 않는다. 이전 조건의 기록이 새 조건의 결과처럼 보이기 때문이다.
    placeholderData: (previous, previousQuery) => {
      const before = (previousQuery?.queryKey as AuditLogListKey | undefined)?.[2]
      return sameExceptPage(before, filters) ? previous : undefined
    },
    // 기본값은 오프라인일 때 요청을 보내지 않고 기다린다. 그러면 안내 없이 멈춰 보이므로 바로 시도해 실패를 알린다.
    networkMode: 'always',
  })
}
