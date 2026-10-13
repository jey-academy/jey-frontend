import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, useIdempotentPost, waitForRefresh } from '@/shared/api'
import { classesQueryKey } from '@/shared/campus'
import type { components } from '@/shared/api/schema'

/** 수강료표의 한 줄(반 + 금액). 관리자만 받는다. 꺼진 반도 들어 있다. */
export type ClassFee = components['schemas']['ClassFeeResponse']
export type ClassCreateRequest = components['schemas']['ClassCreateRequest']
export type ClassUpdateRequest = components['schemas']['ClassUpdateRequest']
/** 할인 유형. `rate`는 퍼센트가 아니라 비율이다(5%는 0.05). 꺼진 것도 들어 있다. */
export type DiscountType = components['schemas']['DiscountTypeResponse']
export type DiscountTypeCreateRequest = components['schemas']['DiscountTypeCreateRequest']
export type DiscountTypeUpdateRequest = components['schemas']['DiscountTypeUpdateRequest']

const classFeesKey = ['settings', 'class-fees'] as const
const discountTypesKey = ['settings', 'discount-types'] as const

/** 전 지점의 수강료표. 지점별로 보는 것은 화면에서 거른다(반이 수십 개 수준이라 한 번에 받는다). */
export function useClassFees() {
  return useQuery({
    queryKey: classFeesKey,
    queryFn: ({ signal }) => api.get<ClassFee[]>('/api/v1/class-fees', { signal }),
    // 기본값은 오프라인일 때 요청을 보내지 않고 기다린다. 그러면 안내 없이 멈춰 보이므로 바로 시도해 실패를 알린다.
    networkMode: 'always',
  })
}

// 저장 응답으로 온 줄을 받아 둔 목록에 넣는다. 같은 id의 줄이 있으면 바꾸고, 없으면 끝에 덧붙인다.
// 순서는 곧 다시 받는 목록이 바로잡는다.
function withSaved<Row extends { id: number }>(rows: Row[], saved: Row): Row[] {
  return rows.some((row) => row.id === saved.id)
    ? rows.map((row) => (row.id === saved.id ? saved : row))
    : [...rows, saved]
}

// 저장한 뒤 목록을 맞추는 일. 변경 요청의 onSettled에 넣는다.
//
// 성공하면 응답으로 온 줄을 받아 둔 목록에 바로 넣고, 이어서 목록을 다시 받는다.
// - 바로 넣는 까닭: 새 목록을 기다리는 데는 상한이 있다(waitForRefresh). 상한을 넘겨 창이 닫혔는데 표가 옛 값이면,
//   같은 줄을 다시 고칠 때 폼이 옛 값으로 채워져 방금 저장한 값을 되돌린다(수정은 값을 통째로 바꾼다).
//   빈 목록에서 등록했다면 "등록된 것이 없어요"가 그대로 보여 다시 등록하게 된다.
// - 그래도 다시 받는 까닭: 화면이 끝내 서버와 같은 내용을 보여주게 한다(순서, 그 사이 다른 사람이 바꾼 줄).
//
// 실패했을 때도 다시 받는다. 응답이 끊겼을 뿐 서버에는 저장됐을 수 있고, 그 사이 대상이 없어졌을 수도 있다.
function useRefresh<Row extends { id: number }>(
  queryKey: readonly string[],
  ...related: (readonly string[])[]
) {
  const queryClient = useQueryClient()
  return (saved: Row | undefined, error: unknown) => {
    // 같은 자료를 보여주는 다른 화면의 목록도 낡은 것으로 표시한다. 그 화면에 갈 때 다시 받는다.
    for (const key of related) void queryClient.invalidateQueries({ queryKey: key })
    // 응답의 모양이 약속과 다르면(줄이 아니면) 넣지 않는다. 다시 받는 목록에 맡긴다.
    if (!error && typeof saved?.id === 'number') {
      queryClient.setQueryData<Row[]>(queryKey, (rows) => (rows ? withSaved(rows, saved) : rows))
    }
    // 받고 있던 목록 요청이 있으면 취소하고 새로 보낸다. 저장 전의 응답이 방금 넣은 줄을 덮어쓰지 않는다.
    const refreshed = queryClient.invalidateQueries({ queryKey })
    // 성공했을 때만 새 목록을 기다린다. 창이 닫힐 때 순서까지 맞는 목록이 보이게 한다. 실패 안내는 기다리지 않고 바로 보여준다.
    // 기다림에는 상한이 있다. 목록이 늦는다고 저장이 끝난 창을 잠가 두지 않는다(waitForRefresh).
    return error ? undefined : waitForRefresh(refreshed)
  }
}

export function useCreateClass() {
  // 서버가 Idempotency-Key를 지키면(백엔드 ADR-0027), 저장은 됐는데 응답만 놓친 뒤 같은 내용으로 다시 저장해도
  // 반이 두 번 만들어지지 않는다. 반 이름은 서버가 중복을 막지 않으므로 키가 유일한 장치다.
  const create = useIdempotentPost<ClassCreateRequest, ClassFee>('/api/v1/classes')
  return useMutation({
    mutationFn: create,
    // 학생 화면 등이 반 이름을 붙이는 데 쓰는 반 목록도 함께 바뀐다.
    onSettled: useRefresh<ClassFee>(classFeesKey, classesQueryKey),
    // 기본값은 오프라인일 때 요청을 보내지 않고 기다린다. 그러면 창이 "저장하는 중"으로 잠긴 채 끝나지 않는다
    // (입력칸도 닫기도 막혀 있다). 바로 시도해 실패를 알린다.
    networkMode: 'always',
  })
}

/** 반 수정. 값을 통째로 바꾸는 요청이라 바꾸지 않는 값도 모두 보낸다. 끄고 켜는 것도 이 요청으로 한다. */
export function useUpdateClass() {
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: ClassUpdateRequest }) =>
      api.put<ClassFee>(`/api/v1/classes/${id}`, body),
    onSettled: useRefresh<ClassFee>(classFeesKey, classesQueryKey),
    // 기본값은 오프라인일 때 요청을 보내지 않고 기다린다. 그러면 창이 "저장하는 중"으로 잠긴 채 끝나지 않는다
    // (입력칸도 닫기도 막혀 있다). 바로 시도해 실패를 알린다.
    networkMode: 'always',
  })
}

export function useDiscountTypes() {
  return useQuery({
    queryKey: discountTypesKey,
    queryFn: ({ signal }) => api.get<DiscountType[]>('/api/v1/discount-types', { signal }),
    // 기본값은 오프라인일 때 요청을 보내지 않고 기다린다. 그러면 안내 없이 멈춰 보이므로 바로 시도해 실패를 알린다.
    networkMode: 'always',
  })
}

export function useCreateDiscountType() {
  const create = useIdempotentPost<DiscountTypeCreateRequest, DiscountType>(
    '/api/v1/discount-types',
  )
  return useMutation({
    mutationFn: create,
    onSettled: useRefresh<DiscountType>(discountTypesKey),
    // 기본값은 오프라인일 때 요청을 보내지 않고 기다린다. 그러면 창이 "저장하는 중"으로 잠긴 채 끝나지 않는다
    // (입력칸도 닫기도 막혀 있다). 바로 시도해 실패를 알린다.
    networkMode: 'always',
  })
}

/** 할인 유형 수정. 값을 통째로 바꾸는 요청이다. 코드는 바꿀 수 없어서 보내지 않는다. */
export function useUpdateDiscountType() {
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: DiscountTypeUpdateRequest }) =>
      api.put<DiscountType>(`/api/v1/discount-types/${id}`, body),
    onSettled: useRefresh<DiscountType>(discountTypesKey),
    // 기본값은 오프라인일 때 요청을 보내지 않고 기다린다. 그러면 창이 "저장하는 중"으로 잠긴 채 끝나지 않는다
    // (입력칸도 닫기도 막혀 있다). 바로 시도해 실패를 알린다.
    networkMode: 'always',
  })
}
