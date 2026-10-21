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

// 학생 상세와 같은 키다(같은 StudentResponse를 담는다). 학생 등록이나 상세에서 받아 둔 학생이 있으면 바로 보이고,
// 학생을 고치면 이 화면도 맞춰진다.
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

/** 미리 계산의 캐시 키 앞부분. 청구 화면을 떠날 때 이 키로 기억을 지운다. */
export const quoteQueryKey = ['billing', 'quote'] as const

/**
 * 청구액 미리 계산. 저장하지 않는다. 본문이 null이면 묻지 않는다(칸이 덜 채워졌거나 계산할 수 없을 때).
 * 이 화면에 있는 동안은 본문마다 한 번만 묻는다. 값을 바꿨다 되돌리면 기억한 금액을 쓴다.
 * - 저절로 다시 묻지 않는다(창에 돌아올 때, 연결이 돌아올 때, 시간이 지나도). 다시 묻는 동안 금액이 사라져
 *   누르려던 버튼이 꺼지거나, 다시 묻다 실패해 옛 금액과 실패가 같이 남는 일을 막는다.
 *   그사이 수강료나 할인율이 바뀌면 만들 때 서버가 다시 계산한다. 화면이 만든 금액과 미리 본 금액을 비교해 알린다.
 * - 자동으로 다시 시도하지 않는다. 거부(4xx)는 다시 해도 같고, 서버 오류·연결 실패는 직원이 "다시 계산하기"로 묻는다.
 * - 화면을 떠나면 화면이 기억을 지운다(quoteQueryKey). 다시 들어오면 새로 계산한다.
 */
export function useInvoiceQuote(body: InvoiceRequest | null) {
  return useQuery({
    queryKey: [...quoteQueryKey, body],
    queryFn: body === null ? skipToken : () => api.post<Invoice>('/api/v1/billing/quote', body),
    // 낡지 않으니 창·연결이 돌아와도 다시 묻지 않는다(그 둘은 낡은 값만 다시 받는다).
    staleTime: Infinity,
    retry: false,
    ...ALWAYS,
  })
}

/**
 * 패스 사용 기록에서 청구 만들기. 패스 할인은 서버가 붙인다(지금 할인율, 패스 번호).
 * 서버가 Idempotency-Key를 지키므로 응답만 놓친 뒤 같은 내용으로 다시 보내면 처음 결과를 받는다.
 * 사용 기록 하나에 열린 청구는 하나라, 내용을 고쳐(새 키로) 보내도 두 번 만들어지지 않는다. 처음 것이 만들어졌으면
 * 409 DONGTANPASS_REDEMPTION_ALREADY_INVOICED를 받고, 남는 것은 처음 내용의 청구다.
 */
export function useIssueRedemptionInvoice(redemptionId: number) {
  const queryClient = useQueryClient()
  const issue = useIdempotentPost<RedemptionInvoiceRequest, RedemptionInvoice>(
    `/api/v1/dongtanpass/redemptions/${redemptionId}/invoice`,
  )
  return useMutation({
    mutationFn: issue,
    // 청구 목록(목록 화면이 생기면 쓰는 키)은 다음에 볼 때 다시 받는다. 응답을 놓쳤어도 만들어졌을 수 있다.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['billing', 'invoices'] }),
    ...ALWAYS,
  })
}
