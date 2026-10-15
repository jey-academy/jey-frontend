import { hashKey, useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { components, paths } from '@/shared/api/schema'
import { periodQuery } from './period'

/** 누가 언제 무엇에 무엇을 했는지 한 줄. 이름과 전화번호는 없고 ID만 있다. */
export type AuditLog = components['schemas']['AuditLogResponse']
export type AuditLogPage = components['schemas']['AuditLogPageResponse']

// 조건의 이름과 값은 생성된 타입에서 뽑는다. 서버가 조건의 이름을 바꾸거나 없애면 여기서 컴파일 에러가 난다.
// 경로로 찾는다(operations의 이름은 백엔드 메서드 이름에서 나와, 겹치면 번호가 붙어 밀린다).
type AuditLogQuery = NonNullable<paths['/api/v1/audit-logs']['get']['parameters']['query']>

/**
 * 화면의 조건. 서버의 쿼리에서 그대로 쓰는 것은 뽑아 오고, 화면에서 뜻이 다른 것만 따로 둔다.
 * `targetId`는 `targetType`과 함께 준다. 혼자 주면 서버가 거부한다(AUDIT_TARGET_TYPE_REQUIRED).
 */
export type AuditLogFilters = Pick<
  AuditLogQuery,
  'outcome' | 'actorId' | 'action' | 'targetType' | 'targetId'
> & {
  // from·to는 날짜다. 서버는 시각으로 받으므로 보낼 때 periodQuery가 바꾼다.
  /** 시작일(`2026-10-12`, 한국 날짜). 그날을 포함한다 */
  from?: string
  /** 끝일(`2026-10-12`, 한국 날짜). 그날을 포함한다 */
  to?: string
  /** 0부터 */
  page: number
}

type AuditLogListKey = readonly ['audit-logs', 'list', AuditLogFilters]

/** 페이지를 뺀 조건이 같은지. hashKey는 키 순서와 상관없이, 값이 없는 키는 빼고 비교한다(쿼리 키를 비교하는 방식과 같다). */
function sameExceptPage(a: AuditLogFilters | undefined, b: AuditLogFilters): boolean {
  if (!a) return false
  return hashKey([{ ...a, page: 0 }]) === hashKey([{ ...b, page: 0 }])
}

/** 감사 로그의 한 페이지. 최신순이다. 관리자만 볼 수 있다(직원·연계 학원은 403). */
export function useAuditLogs(filters: AuditLogFilters) {
  const queryKey: AuditLogListKey = ['audit-logs', 'list', filters]
  const { outcome, actorId, action, targetType, targetId, from, to, page } = filters

  return useQuery({
    queryKey,
    queryFn: ({ signal }) => {
      const period = periodQuery(from, to)
      return api.get<AuditLogPage>('/api/v1/audit-logs', {
        // 서버는 모르는 조건을 말없이 무시한다. 보내는 이름이 서버의 것과 같은지 타입으로 본다.
        // 키를 하나하나 적는다. satisfies는 직접 적은 키만 검사하고, 펼쳐 넣은(...) 키는 보지 않는다.
        // 그래서 서버가 from·to의 이름을 바꿔도 여기서 컴파일 에러가 나고, 화면 전용 값이 쿼리에 실려 나가지 않는다.
        query: {
          outcome,
          actorId,
          action,
          targetType,
          targetId,
          from: period.from,
          to: period.to,
          // 첫 페이지(0)는 싣지 않는다. 서버의 기본값이 0이라 결과는 같고, 조건이 없으면 요청 주소에 쿼리가 붙지 않는다.
          page: page || undefined,
        } satisfies AuditLogQuery,
        signal,
      })
    },
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
