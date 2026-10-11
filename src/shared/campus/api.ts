import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { components } from '@/shared/api/schema'

export type Campus = components['schemas']['CampusResponse']
/** 반. 운영 중인 반만 온다. 수강료는 들어 있지 않다(수강료는 관리자의 설정 화면에서만 본다). */
export type AcademyClass = components['schemas']['ClassResponse']

/** 반 목록의 캐시 키. 반을 만들거나 고친 쪽(설정 화면)이 이 목록도 다시 받게 할 때 쓴다. */
export const classesQueryKey = ['campus', 'classes'] as const

// 지점과 반은 거의 바뀌지 않는다. 여러 화면이 이름을 붙이는 데 쓰므로 오래 들고 있는다.
const STALE_TIME = 10 * 60_000

/** 지점 목록. 여러 화면이 같이 쓴다. */
export function useCampuses() {
  return useQuery({
    queryKey: ['campus', 'campuses'],
    queryFn: ({ signal }) => api.get<Campus[]>('/api/v1/campuses', { signal }),
    staleTime: STALE_TIME,
    // 오프라인일 때 안내 없이 멈춰 있지 않게 바로 시도해 실패를 알린다.
    networkMode: 'always',
  })
}

/** 전 지점의 운영 중인 반. 관리자와 직원이 조회할 수 있다. */
export function useClasses() {
  return useQuery({
    queryKey: classesQueryKey,
    queryFn: ({ signal }) => api.get<AcademyClass[]>('/api/v1/classes', { signal }),
    staleTime: STALE_TIME,
    networkMode: 'always',
  })
}
