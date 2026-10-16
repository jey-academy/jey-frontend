import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, useIdempotentPost, waitForRefresh } from '@/shared/api'
import type { components } from '@/shared/api/schema'
import { partnersQueryKey, type Partner } from '@/shared/partner'

export type PartnerCreateRequest = components['schemas']['PartnerCreateRequest']
export type PartnerAccountCreateRequest = components['schemas']['PartnerAccountCreateRequest']
/** 만든 연계 학원 계정. 이름 고치기·차단·비밀번호는 계정 관리에서 한다. */
export type PartnerAccount = components['schemas']['PartnerAccountResponse']
/** 학부모에게 보여 줄 개인정보 고지 문구와 그 버전. 발급할 때 버전을 그대로 돌려보낸다. */
export type ConsentNotice = components['schemas']['ConsentNoticeResponse']
export type PassIssueRequest = components['schemas']['PassIssueRequest']
/** 발급한 패스. 학부모 링크의 토큰(linkToken)은 이 응답에만 있다. */
export type IssuedPass = components['schemas']['PassIssueResponse']

// 계정 관리 화면의 목록. 연계 학원 계정을 만들거나 학원을 끄면(그 학원의 계정이 모두 차단된다) 바뀐다.
// 그 화면의 코드는 가져오지 않고 키만 맞춘다(기능 폴더끼리 가져오지 않는다).
const accountsKey = ['accounts'] as const

// 기본값은 오프라인일 때 요청을 보내지 않고 기다린다. 그러면 창이 "저장하는 중"으로 잠긴 채 끝나지 않는다. 바로 시도해 실패를 알린다.
const ALWAYS = { networkMode: 'always' } as const

/**
 * 변경 요청의 onSettled에 넣는다. 성공했든 실패했든 학원 목록을 다시 받는다(응답이 끊겼을 뿐 서버에는 바뀌었을 수 있다).
 * 성공했을 때만 새 목록을 기다린다. 창이 닫힐 때 목록이 이미 바뀌어 있게 한다. 기다림에는 상한이 있다(waitForRefresh).
 * `withAccounts`면 계정 관리의 목록도 낡은 것으로 표시한다. 그 화면에 갈 때 다시 받는다.
 */
function useRefreshPartners({ withAccounts = false } = {}) {
  const queryClient = useQueryClient()
  return (_data: unknown, error: unknown) => {
    if (withAccounts) void queryClient.invalidateQueries({ queryKey: accountsKey })
    const refreshed = queryClient.invalidateQueries({ queryKey: partnersQueryKey })
    return error ? undefined : waitForRefresh(refreshed)
  }
}

/**
 * 연계 학원 만들기. 켜진 학원으로 만든다. 같은 이름(대소문자만 달라도)이 있으면 409다.
 * 서버가 Idempotency-Key를 지키므로, 만들어졌는데 응답만 놓친 뒤 같은 내용으로 다시 눌러도 한 번만 만들어진다.
 */
export function useCreatePartner() {
  const create = useIdempotentPost<PartnerCreateRequest, Partner>('/api/v1/dongtanpass/partners')
  return useMutation({
    mutationFn: create,
    onSettled: useRefreshPartners(),
    ...ALWAYS,
  })
}

/**
 * 학원 끄기·켜기. 같은 요청을 다시 보내도 결과가 같다.
 * - 끄기: 새 발급을 막고 그 학원의 계정을 모두 차단한다(로그아웃된다). 이미 발급한 패스는 쓸 수 있다.
 *   500으로 끝나면 학원은 꺼졌는데 계정 일부가 차단되지 않은 것이다. 다시 보내면 남은 계정을 차단한다.
 * - 켜기: 학원만 켠다. 끌 때 차단된 계정은 계정 관리에서 따로 풀어야 한다.
 */
export function useSetPartnerActive() {
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api.post<Partner>(`/api/v1/dongtanpass/partners/${id}/${active ? 'activate' : 'deactivate'}`),
    onSettled: useRefreshPartners({ withAccounts: true }),
    ...ALWAYS,
  })
}

/**
 * 그 학원의 공용 계정 만들기. 멱등 키를 싣지 않는다(서버가 받지 않는다. 비밀번호가 든 본문의 지문을 남기지 않으려는 것이다).
 * 그래서 만들어졌는데 응답만 놓친 뒤 다시 보내면 "이미 사용 중인 아이디"(409)가 온다.
 * 꺼진 학원이면 409(DONGTANPASS_PARTNER_INACTIVE_FOR_ACCOUNT)다.
 */
export function useCreatePartnerAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ partnerId, body }: { partnerId: number; body: PartnerAccountCreateRequest }) =>
      api.post<PartnerAccount>(`/api/v1/dongtanpass/partners/${partnerId}/accounts`, body),
    // 계정 관리의 목록에 새 계정이 생긴다. 학원이 그 사이 꺼졌다는 답이면 학원 목록도 낡았다.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: accountsKey })
      void queryClient.invalidateQueries({ queryKey: partnersQueryKey })
    },
    // 요청 본문에 비밀번호 원문이 들어 있다. 기본값이면 창을 닫은 뒤에도 5분 남는다. 0으로 두어, 이 훅을 쓰는 폼이
    // 사라지는(창이 닫히는) 즉시 지운다. 그래서 이 훅은 늘 그려져 있는 창이 아니라 그 안의 폼에서 부른다.
    gcTime: 0,
    ...ALWAYS,
  })
}

/** 고지 문구의 캐시 키. 발급할 때 버전이 바뀌었다는 답을 받으면 이 키로 다시 받는다. */
export const consentNoticeQueryKey = ['dongtanpass', 'consent-notice'] as const

/**
 * 연계 학원 발급 화면의 개인정보 고지 문구. 꺼진 학원이면 403(DONGTANPASS_PARTNER_INACTIVE)이다.
 * 연계 학원 계정만 부를 수 있다(직원·관리자는 403). 그 밖의 계정이면 `enabled`를 끈다.
 */
export function useConsentNotice({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: consentNoticeQueryKey,
    enabled,
    queryFn: ({ signal }) =>
      api.get<ConsentNotice>('/api/v1/dongtanpass/consent-notice', { signal }),
    ...ALWAYS,
  })
}

/**
 * 패스 발급. 서버가 Idempotency-Key를 지키므로, 발급됐는데 응답만 놓친 뒤 같은 내용으로 다시 보내도 한 번만 발급된다.
 * 그때 받는 응답도 처음과 같다(링크 토큰이 또 바뀌지 않는다).
 */
export function useIssuePass() {
  const issue = useIdempotentPost<PassIssueRequest, IssuedPass>('/api/v1/dongtanpass/passes')
  return useMutation({
    mutationFn: issue,
    // 요청 본문에 학부모 전화번호가 들어 있다. 화면을 떠나는 즉시 지운다(기본값이면 5분 남는다).
    gcTime: 0,
    ...ALWAYS,
  })
}
