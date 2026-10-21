import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, useIdempotentPost } from '@/shared/api'
import type { components } from '@/shared/api/schema'

/** 청구할 학생. 이름, 지점(반 고르기), 재원 여부를 본다. */
export type BillingStudent = components['schemas']['StudentResponse']
export type DiscountType = components['schemas']['DiscountTypeResponse']
/** 미리 계산과 만들기의 본문. 미리 계산에는 패스 할인(`DONGTAN_PASS`)을 넣을 수 있다. */
export type InvoiceRequest = components['schemas']['InvoiceRequest']
/** 청구. 미리 계산이면 `id`·`status`가 null이다. */
export type Invoice = components['schemas']['InvoiceResponse']
export type RedemptionInvoiceRequest = components['schemas']['RedemptionInvoiceRequest']
export type RedemptionInvoice = components['schemas']['RedemptionInvoiceResponse']

/**
 * 패스 할인의 할인 유형 코드. 사용 기록 경로로만 청구에 붙는다(서버가 붙인다).
 * 직원이 고르는 목록에서는 빼고, 미리 계산에는 맨 앞에 넣는다(실제 청구가 패스 할인을 먼저 계산한다).
 */
export const PASS_DISCOUNT_CODE = 'DONGTAN_PASS'

// 기본값은 오프라인일 때 요청을 보내지 않고 기다린다. 바로 시도해 실패를 알린다.
const ALWAYS = { networkMode: 'always' } as const

// 학생 화면의 상세와 같은 키다. 그 화면에서 넘어오면 받아 둔 학생을 바로 보여 준다(키만 맞춘다).
export const billingStudentQueryKey = (id: number) => ['students', 'detail', id] as const

/** 청구할 학생. id가 null이면 묻지 않는다. */
export function useBillingStudent(id: number | null) {
  return useQuery({
    queryKey: billingStudentQueryKey(id ?? 0),
    queryFn:
      id === null
        ? skipToken
        : ({ signal }) => api.get<BillingStudent>(`/api/v1/students/${id}`, { signal }),
    ...ALWAYS,
  })
}

/** 할인 유형. 꺼진 것도 온다(쓰는 쪽이 `active`로 거른다). 설정 화면과 다른 키라 따로 받는다. */
export function useDiscountTypes() {
  return useQuery({
    queryKey: ['billing', 'discount-types'],
    queryFn: ({ signal }) => api.get<DiscountType[]>('/api/v1/discount-types', { signal }),
    staleTime: 10 * 60_000,
    ...ALWAYS,
  })
}

/**
 * 청구액 미리 계산. 저장하지 않는다. 본문이 null이면 묻지 않는다(칸이 덜 채워짐).
 * 본문마다 따로 기억해, 값을 바꿨다 되돌리면 다시 묻지 않는다. 다시 시도하지 않는다(거부는 다시 해도 같다).
 */
export function useInvoiceQuote(body: InvoiceRequest | null) {
  return useQuery({
    queryKey: ['billing', 'quote', body],
    queryFn: body === null ? skipToken : () => api.post<Invoice>('/api/v1/billing/quote', body),
    retry: false,
    // 수강료표나 할인율이 바뀌었을 수 있다. 화면에 다시 들어오면 새로 계산한다.
    gcTime: 60_000,
    ...ALWAYS,
  })
}

/**
 * 패스 사용 기록에서 청구 만들기. 패스 할인은 서버가 붙인다(지금 할인율, 패스 번호).
 * 서버가 Idempotency-Key를 지키므로 응답만 놓친 뒤 같은 내용으로 다시 보내도 한 번만 만들어진다.
 * 내용을 고쳐 보내도 두 번 만들어지지 않는다. 사용 기록 하나에 열린 청구는 하나다(있으면 409).
 */
export function useIssueRedemptionInvoice(redemptionId: number) {
  const queryClient = useQueryClient()
  const issue = useIdempotentPost<RedemptionInvoiceRequest, RedemptionInvoice>(
    `/api/v1/dongtanpass/redemptions/${redemptionId}/invoice`,
  )
  return useMutation({
    mutationFn: issue,
    // 청구 목록은 다음에 볼 때 다시 받는다. 응답을 놓쳤어도 만들어졌을 수 있다.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['billing', 'invoices'] }),
    ...ALWAYS,
  })
}
