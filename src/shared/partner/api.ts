import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { components } from '@/shared/api/schema'

/** 연계 학원(제이G패스를 발급하는 학원). `active`가 false면 꺼진 학원이다. */
export type Partner = components['schemas']['PartnerResponse']

/** 연계 학원 목록의 캐시 키. 학원을 만들거나 끄고 켠 쪽(연계 학원 화면)이 다시 받게 할 때 쓴다. */
export const partnersQueryKey = ['partner', 'partners'] as const

/**
 * 연계 학원 목록. 만든 순서이고 꺼진 학원도 들어 있다. 관리자만 받는다(그 밖에는 403).
 * 연계 학원 화면과, 연계 학원 계정의 소속을 보여 주는 계정 관리 화면이 같이 쓴다.
 */
export function usePartners() {
  return useQuery({
    queryKey: partnersQueryKey,
    queryFn: ({ signal }) => api.get<Partner[]>('/api/v1/dongtanpass/partners', { signal }),
    // 오프라인일 때 안내 없이 멈춰 있지 않게 바로 시도해 실패를 알린다.
    networkMode: 'always',
  })
}
