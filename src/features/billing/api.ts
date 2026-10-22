import { hashKey, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, useIdempotentPost } from '@/shared/api'
import type { components, paths } from '@/shared/api/schema'

/** 청구할 학생. 이름, 지점(반 고르기), 재원 여부를 본다. */
export type BillingStudent = components['schemas']['StudentResponse']
export type DiscountType = components['schemas']['DiscountTypeResponse']
/** 미리 계산과 만들기의 본문. 미리 계산에는 패스 할인(`DONGTAN_PASS`)을 넣을 수 있다. */
export type InvoiceRequest = components['schemas']['InvoiceRequest']
/** 청구. 미리 계산이면 `id`·`status`가 null이다. */
export type Invoice = components['schemas']['InvoiceResponse']
export type RedemptionInvoiceRequest = components['schemas']['RedemptionInvoiceRequest']
export type RedemptionInvoice = components['schemas']['RedemptionInvoiceResponse']
export type PaymentRequest = components['schemas']['PaymentRequest']
/**
 * 결제. 결제 목록의 한 줄이자 결제 기록·취소의 응답이다.
 * 청구 응답의 `payment`에는 청구가 결제함(PAID)일 때만 있어, 취소한 결제는 결제 목록에서 본다.
 */
export type Payment = components['schemas']['PaymentResponse']
/** 결제 수단. 포스기 카드, 현금 */
export type PaymentMethod = PaymentRequest['method']

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

/** 패스 사용 기록 하나. 청구 화면은 주소에 사용 기록만 두고, 학생 ID와 열린 청구(`invoiceId`)를 여기서 읽는다. */
export type Redemption = components['schemas']['RedemptionDetailResponse']

// 패스 사용 내역(dongtanpass)과 같은 키의 앞부분이다. 기능 폴더끼리 import하지 않아 여기 다시 적는다.
// 청구를 만들거나 취소하면 이 앞부분을 낡은 것으로 표시해, 사용 내역 줄의 "청구 만들기/청구 보기"와 청구 만들기 화면을 맞춘다.
const redemptionsQueryKey = ['dongtanpass', 'redemptions'] as const

/** 패스 사용 기록 하나. 사용한 지점을 다룰 수 없으면 403, 없으면 404다. id가 null이면 묻지 않는다. */
export function useRedemption(id: number | null) {
  return useQuery({
    queryKey: [...redemptionsQueryKey, 'detail', id ?? 0],
    queryFn:
      id === null
        ? skipToken
        : ({ signal }) => api.get<Redemption>(`/api/v1/dongtanpass/redemptions/${id}`, { signal }),
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

/** 청구 캐시 키. 그 달 목록과 단건이 이 앞부분을 같이 쓴다. */
export const invoicesQueryKey = ['billing', 'invoices'] as const
export const invoiceQueryKey = (id: number) => [...invoicesQueryKey, 'detail', id] as const
/** 결제 목록 캐시 키. 결제를 기록하거나 취소하면 낡은 것으로 표시한다. */
const paymentsQueryKey = ['billing', 'payments'] as const

export type PaymentPage = components['schemas']['PaymentPageResponse']
type PaymentListQuery = NonNullable<paths['/api/v1/billing/payments']['get']['parameters']['query']>

/**
 * 결제 목록의 조건. `from`·`to`는 결제일(한국 날짜)이고 둘 다 그날을 포함하며 필수다(시작일 + 1년까지).
 * `campusId`를 주지 않으면 직원은 소속 지점, 관리자는 전 지점이다.
 */
export type PaymentListFilters = Pick<PaymentListQuery, 'from' | 'to' | 'campusId'> & {
  /** 0부터 */
  page: number
}

type PaymentListKey = readonly [...typeof paymentsQueryKey, PaymentListFilters]

/** 결제 목록 한 페이지의 줄 수. 서버의 상한이다(넘으면 400). */
const PAYMENT_PAGE_SIZE = 100

/** 결제 목록 한 페이지. 최신 결제 순이고 취소한 결제도 있다. 직원·관리자만 부를 수 있다. */
export function usePayments(filters: PaymentListFilters) {
  const queryKey: PaymentListKey = [...paymentsQueryKey, filters]
  const { from, to, campusId, page } = filters
  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.get<PaymentPage>('/api/v1/billing/payments', {
        // 하루 정산 때 넘기지 않고 맞춰 보도록 서버가 받는 가장 큰 페이지(100건)로 받는다.
        query: {
          from,
          to,
          campusId,
          page: page || undefined,
          size: PAYMENT_PAGE_SIZE,
        } satisfies PaymentListQuery,
        signal,
      }),
    // useInvoices와 같은 방식이다. 페이지만 넘길 때만 이전 페이지를 보여 준다(기간·지점을 바꾸면 비우고 새로 받는다).
    placeholderData: (previous, previousQuery) => {
      const before = (previousQuery?.queryKey as PaymentListKey | undefined)?.[2]
      return before && hashKey([{ ...before, page: 0 }]) === hashKey([{ ...filters, page: 0 }])
        ? previous
        : undefined
    },
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
    // 청구(목록·단건)와 사용 기록(내역·단건)을 낡은 것으로 표시한다. 응답을 놓쳤어도 만들어졌을 수 있다.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: invoicesQueryKey })
      void queryClient.invalidateQueries({ queryKey: redemptionsQueryKey })
    },
    ...ALWAYS,
  })
}

export type InvoicePage = components['schemas']['InvoicePageResponse']
type InvoiceListQuery = NonNullable<paths['/api/v1/billing/invoices']['get']['parameters']['query']>

/**
 * 그 달 청구 목록의 조건. `targetMonth`는 `2026-11` 모양이다.
 * `campusId`를 주지 않으면 직원은 소속 지점, 관리자는 전 지점이다.
 */
export type InvoiceListFilters = Pick<InvoiceListQuery, 'targetMonth' | 'campusId'> & {
  /** 0부터 */
  page: number
}

type InvoiceListKey = readonly [...typeof invoicesQueryKey, 'list', InvoiceListFilters]

/** 그 달 청구 목록 한 페이지. 학생 ID 순이고 취소한 청구도 있다. 직원·관리자만 부를 수 있다. */
export function useInvoices(filters: InvoiceListFilters) {
  const queryKey: InvoiceListKey = [...invoicesQueryKey, 'list', filters]
  const { targetMonth, campusId, page } = filters
  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.get<InvoicePage>('/api/v1/billing/invoices', {
        query: { targetMonth, campusId, page: page || undefined } satisfies InvoiceListQuery,
        signal,
      }),
    // 패스 사용 내역(dongtanpass useRedemptions)과 같은 방식이다. 페이지만 넘길 때만 이전 페이지를 보여 준다(달·지점을 바꾸면 비우고 새로 받는다).
    placeholderData: (previous, previousQuery) => {
      const before = (previousQuery?.queryKey as InvoiceListKey | undefined)?.[3]
      return before && hashKey([{ ...before, page: 0 }]) === hashKey([{ ...filters, page: 0 }])
        ? previous
        : undefined
    },
    ...ALWAYS,
  })
}

/** 청구 한 건. 다른 지점이면 403, 없으면 404다. id가 null이면 묻지 않는다. */
export function useInvoice(id: number | null) {
  return useQuery({
    queryKey: invoiceQueryKey(id ?? 0),
    queryFn:
      id === null
        ? skipToken
        : ({ signal }) => api.get<Invoice>(`/api/v1/billing/invoices/${id}`, { signal }),
    ...ALWAYS,
  })
}

/**
 * 결제·취소 뒤의 청구 캐시. 성공하면 답으로 그 청구를 바로 맞춘다(다시 읽기가 실패해도 옛 상태의 버튼이 남지 않게).
 * 끝나면(성공·실패) 청구와 결제 목록을 낡은 것으로 표시한다. 응답을 놓쳤어도 처리됐을 수 있다.
 */
function useBillingCache(invoiceId: number) {
  const queryClient = useQueryClient()
  return {
    update: (change: (invoice: Invoice) => Invoice) =>
      queryClient.setQueryData<Invoice>(invoiceQueryKey(invoiceId), (old) =>
        old ? change(old) : old,
      ),
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: invoicesQueryKey })
      void queryClient.invalidateQueries({ queryKey: paymentsQueryKey })
    },
  }
}

/**
 * 데스크 결제 기록. 포스기·현금으로 받은 결과를 남긴다(앱이 결제를 하지 않는다). 결제 시각은 서버가 정한다.
 * `amount`는 청구 합계 그대로다(다르면 409). 결제 전(ISSUED) 청구만 받는다.
 * 서버가 Idempotency-Key를 지키므로 응답만 놓친 뒤 같은 내용으로 다시 보내면 처음 결과를 받는다.
 * 내용을 고치면 새 키로 나가지만, 처음 요청이 처리됐으면 409(BILLING_INVOICE_NOT_PAYABLE, 동시에 겹치면
 * BILLING_PAYMENT_ALREADY_EXISTS)로 거부돼 두 번 기록되지 않는다. 화면은 답을 모를 때 칸을 잠가 같은 내용으로만 다시 보낸다.
 * `forgetKey`: 처리됐다는 것을 청구를 다시 읽어 확인했을 때 부른다(useIdempotentPost의 forget).
 */
export function useRecordPayment(invoiceId: number) {
  const record = useIdempotentPost<PaymentRequest, Payment>(
    `/api/v1/billing/invoices/${invoiceId}/payments`,
  )
  const cache = useBillingCache(invoiceId)
  const mutation = useMutation({
    mutationFn: record,
    onSuccess: (payment) => cache.update((old) => ({ ...old, status: 'PAID', payment })),
    onSettled: cache.refresh,
    ...ALWAYS,
  })
  return { ...mutation, forgetKey: record.forget }
}

/**
 * 결제 취소. 청구는 다시 결제 전(ISSUED)이 된다. 환불은 데스크에서 따로 하고 앱은 기록만 남긴다. 본문은 없다.
 * 주소에 결제 id가 들어가 결제마다 키가 따로다. 훅은 늘 불러야 하므로, 취소할 결제를 아직 고르지 않았으면
 * id를 0으로 넘기고 보내지 않는다. 보낼 때는 직원이 확인한 결제의 id로만 보낸다(지금 청구의 결제가 바뀌었을 수 있다).
 */
export function useCancelPayment(invoiceId: number, paymentId: number) {
  const cancel = useIdempotentPost<undefined, Payment>(
    `/api/v1/billing/payments/${paymentId}/cancel`,
  )
  const cache = useBillingCache(invoiceId)
  const mutation = useMutation({
    mutationFn: () => cancel(undefined),
    onSuccess: () => cache.update((old) => ({ ...old, status: 'ISSUED', payment: null })),
    onSettled: cache.refresh,
    ...ALWAYS,
  })
  return { ...mutation, forgetKey: cancel.forget }
}

/**
 * 청구 취소. 결제 전 청구만(결제한 청구는 결제를 먼저 취소). 같은 달·같은 사용 기록으로 새 청구를 만들 수 있게 된다.
 * 사용 기록의 열린 청구(`invoiceId`)가 null로 돌아가므로 사용 기록(내역·단건)도 낡은 것으로 표시한다.
 */
export function useCancelInvoice(invoiceId: number) {
  const queryClient = useQueryClient()
  const cancel = useIdempotentPost<undefined, Invoice>(
    `/api/v1/billing/invoices/${invoiceId}/cancel`,
  )
  const cache = useBillingCache(invoiceId)
  const mutation = useMutation({
    mutationFn: () => cancel(undefined),
    onSuccess: (invoice) => cache.update(() => invoice),
    onSettled: () => {
      cache.refresh()
      void queryClient.invalidateQueries({ queryKey: redemptionsQueryKey })
    },
    ...ALWAYS,
  })
  return { ...mutation, forgetKey: cancel.forget }
}

/** 장부(구글 시트)에 쓰지 못한 결제의 반영 기록 한 줄. 학생 이름은 있고(찾지 못하면 null) 전화번호는 없다. */
export type LedgerSync = components['schemas']['LedgerSyncResponse']
export type LedgerSyncPage = components['schemas']['LedgerSyncPageResponse']
/** 미반영의 까닭. 대부분 장부를 고친 뒤 다시 반영하면 되지만, SPLIT_CLASS(반 나눔)는 다시 해도 같다. 화면 문구는 ledgerSync.ts. */
export type LedgerSyncReason = LedgerSync['reason']
export type LedgerSyncRetry = components['schemas']['LedgerSyncRetryResponse']

/** 장부 미반영 목록의 조건. `campusId`가 없으면 전 지점이다. */
export type LedgerSyncFilters = { campusId?: number; page: number }

const ledgerSyncQueryKey = ['billing', 'ledger-sync'] as const
type LedgerSyncKey = readonly [...typeof ledgerSyncQueryKey, LedgerSyncFilters]

/** 관리자의 장부 미반영 목록 한 페이지. 최근에 생긴 반영 기록부터다. 관리자만 부를 수 있다(직원은 403). */
export function useUnsyncedLedger(filters: LedgerSyncFilters) {
  const queryKey: LedgerSyncKey = [...ledgerSyncQueryKey, filters]
  const { campusId, page } = filters
  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.get<LedgerSyncPage>('/api/v1/billing/ledger-sync/unsynced', {
        query: { campusId, page: page || undefined },
        signal,
      }),
    // 페이지만 넘길 때만 이전 페이지를 보여 준다(데스크 사용 내역과 같다). 지점을 바꾸면 비우고 새로 받는다.
    placeholderData: (previous, previousQuery) => {
      const before = (previousQuery?.queryKey as LedgerSyncKey | undefined)?.[2]
      return before && hashKey([{ ...before, page: 0 }]) === hashKey([{ ...filters, page: 0 }])
        ? previous
        : undefined
    },
    ...ALWAYS,
  })
}

/** 다시 반영의 결과를 받을 곳. 그 줄이 화면에서 사라져도 불린다(아래 훅의 설명). */
export type LedgerSyncRetryHandlers = {
  onSuccess: (result: LedgerSyncRetry) => void
  onError: (error: Error) => void
}

/**
 * 장부에 다시 반영. 바로 한 번 써 보고 결과 상태를 돌려준다(본문 없음). `id`는 반영 기록의 id다(결제 id가 아니다).
 * 서버는 미반영(UNSYNCED)인 줄만 다시 반영한다. 이미 반영됐거나 대기·시도 중이면 409(BILLING_LEDGER_SYNC_NOT_RETRYABLE)이고,
 * 그 순간 다른 쪽이 맡았으면 200의 IN_PROGRESS다. 그래서 같은 결제가 장부에 두 번 써지지 않는다.
 * - 누를 때마다 새 키로 보낸다. 같은 키로 다시 보내면 서버가 다시 시도하지 않고 보관한 옛 결과를 돌려준다
 *   (답을 놓친 뒤 장부를 고치고 다시 눌러도 옛 "또 못 씀"이 온다). 두 번 쓰기는 위의 상태가 막는다.
 * - 결과는 `handlers`로 받는다. mutate에 넘긴 콜백과 달리 그 줄이 화면에서 사라져도 불린다
 *   (응답 전에 지점·페이지를 바꾸거나, 다른 줄의 처리로 목록을 다시 받아 줄이 빠진 경우).
 * - 끝나면(성공·실패) 목록을 다시 받기 시작한다.
 */
export function useRetryLedgerSync(id: number, handlers: LedgerSyncRetryHandlers) {
  const queryClient = useQueryClient()
  const retry = useIdempotentPost<undefined, LedgerSyncRetry>(
    `/api/v1/billing/ledger-sync/${id}/retry`,
  )
  return useMutation({
    mutationFn: () => {
      retry.forget()
      return retry(undefined)
    },
    onSuccess: handlers.onSuccess,
    onError: handlers.onError,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ledgerSyncQueryKey }),
    ...ALWAYS,
  })
}
