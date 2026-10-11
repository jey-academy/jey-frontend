import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { components } from '@/shared/api/schema'

export type Campus = components['schemas']['CampusResponse']
/** 수강료표의 한 줄(반 + 금액). 관리자만 받는다. 꺼진 반도 들어 있다. */
export type ClassFee = components['schemas']['ClassFeeResponse']
export type ClassCreateRequest = components['schemas']['ClassCreateRequest']
export type ClassUpdateRequest = components['schemas']['ClassUpdateRequest']

const campusesKey = ['settings', 'campuses'] as const
const classFeesKey = ['settings', 'class-fees'] as const

export function useCampuses() {
  return useQuery({
    queryKey: campusesKey,
    queryFn: ({ signal }) => api.get<Campus[]>('/api/v1/campuses', { signal }),
    // 지점은 거의 바뀌지 않는다.
    staleTime: 10 * 60_000,
  })
}

/** 전 지점의 수강료표. 지점별로 보는 것은 화면에서 거른다(반이 수십 개 수준이라 한 번에 받는다). */
export function useClassFees() {
  return useQuery({
    queryKey: classFeesKey,
    queryFn: ({ signal }) => api.get<ClassFee[]>('/api/v1/class-fees', { signal }),
  })
}

// 저장한 뒤에는 응답을 목록에 끼워 넣지 않고 목록을 다시 받는다. 화면이 항상 서버와 같은 내용을 보여준다.
// 실패했을 때도 다시 받는다. 응답이 끊겼을 뿐 서버에는 저장됐을 수 있고, 그 사이 반이 없어졌을 수도 있다.
function useRefreshClassFees() {
  const queryClient = useQueryClient()
  return (_data: unknown, error: unknown) => {
    const refreshed = queryClient.invalidateQueries({ queryKey: classFeesKey })
    // 성공했을 때만 새 목록을 기다린다. 창이 닫힐 때 목록이 이미 바뀌어 있게 한다. 실패 안내는 기다리지 않고 바로 보여준다.
    return error ? undefined : refreshed
  }
}

export function useCreateClass() {
  return useMutation({
    mutationFn: (body: ClassCreateRequest) => api.post<ClassFee>('/api/v1/classes', body),
    onSettled: useRefreshClassFees(),
  })
}

/** 반 수정. 값을 통째로 바꾸는 요청이라 바꾸지 않는 값도 모두 보낸다. 끄고 켜는 것도 이 요청으로 한다. */
export function useUpdateClass() {
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: ClassUpdateRequest }) =>
      api.put<ClassFee>(`/api/v1/classes/${id}`, body),
    onSettled: useRefreshClassFees(),
  })
}
