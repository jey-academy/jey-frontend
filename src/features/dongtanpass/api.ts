import { hashKey, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, useIdempotentPost, waitForRefresh } from '@/shared/api'
import type { components, paths } from '@/shared/api/schema'
import { partnersQueryKey, type Partner } from '@/shared/partner'
import { isStalePassError } from './passActionError'

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
 * 연계 학원 계정만 부를 수 있다(직원·관리자는 403). 화면도 연계 학원 계정에게만 열린다(PARTNER_ROLES).
 */
export function useConsentNotice() {
  return useQuery({
    queryKey: consentNoticeQueryKey,
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

export type LedgerItem = components['schemas']['LedgerItemResponse']
export type LedgerPage = components['schemas']['LedgerPageResponse']
export type PassLink = components['schemas']['PassLinkResponse']
export type PassCancel = components['schemas']['PassCancelResponse']

type LedgerQuery = NonNullable<paths['/api/v1/dongtanpass/passes']['get']['parameters']['query']>
type ExportQuery = NonNullable<
  paths['/api/v1/dongtanpass/passes/export']['get']['parameters']['query']
>

/**
 * 장부 화면의 조건. 조건의 이름과 값은 생성된 타입에서 뽑는다(서버가 이름을 바꾸면 컴파일 에러가 난다).
 * `from`·`to`는 발급일(한국 날짜, `2026-10-12`)이고 둘 다 그날을 포함한다. 서버가 날짜 그대로 받는다.
 */
export type LedgerFilters = Pick<LedgerQuery, 'from' | 'to' | 'status'> & {
  /** 0부터 */
  page: number
}

/** 장부의 캐시 키 앞부분. 패스를 취소하면 이 키로 모든 조건의 장부를 다시 받는다. */
export const ledgerQueryKey = ['dongtanpass', 'ledger'] as const
type LedgerKey = readonly [...typeof ledgerQueryKey, LedgerFilters]

/** 페이지를 뺀 조건이 같은지. hashKey는 키 순서와 상관없이, 값이 없는 키는 빼고 비교한다. */
function sameExceptPage(a: LedgerFilters | undefined, b: LedgerFilters): boolean {
  if (!a) return false
  return hashKey([{ ...a, page: 0 }]) === hashKey([{ ...b, page: 0 }])
}

/**
 * 연계 학원의 발급 장부 한 페이지. 연계 학원 계정만 부를 수 있다(직원·관리자는 403).
 * 꺼진 학원이면 403(DONGTANPASS_PARTNER_INACTIVE)이다.
 */
export function useLedger(filters: LedgerFilters) {
  const queryKey: LedgerKey = [...ledgerQueryKey, filters]
  const { from, to, status, page } = filters
  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.get<LedgerPage>('/api/v1/dongtanpass/passes', {
        // 키를 하나하나 적는다. satisfies는 직접 적은 키만 검사한다.
        // 첫 페이지(0)는 싣지 않는다. 서버의 기본값이 0이다.
        query: { from, to, status, page: page || undefined } satisfies LedgerQuery,
        signal,
      }),
    // 같은 조건에서 페이지만 넘길 때는 다음 페이지를 받는 동안 이전 페이지를 보여 준다(감사 로그와 같다).
    // 조건이 바뀌었을 때는 보여 주지 않는다. 이전 조건의 줄이 새 조건의 결과처럼 보이기 때문이다.
    placeholderData: (previous, previousQuery) => {
      const before = (previousQuery?.queryKey as LedgerKey | undefined)?.[2]
      return sameExceptPage(before, filters) ? previous : undefined
    },
    ...ALWAYS,
  })
}

/**
 * 장부를 CSV 파일로 받는다. 기간 조건은 장부와 같고 상태로는 거르지 않는다(서버가 받지 않는다).
 * 파일은 UTF-8 BOM이 붙어 있어 엑셀에서 한글이 깨지지 않는다. 오류(400·403)는 다른 요청처럼 ApiError로 온다.
 * 건수가 많으면 오래 걸릴 수 있어 기다리는 시간을 늘린다.
 */
export function downloadLedgerCsv({ from, to }: Pick<LedgerFilters, 'from' | 'to'>) {
  return api.download('/api/v1/dongtanpass/passes/export', {
    query: { from, to } satisfies ExportQuery,
    timeoutMs: 30_000,
  })
}

export type Redemption = components['schemas']['RedemptionItemResponse']
export type RedemptionPage = components['schemas']['RedemptionPageResponse']

type RedemptionQuery = NonNullable<
  paths['/api/v1/dongtanpass/redemptions']['get']['parameters']['query']
>

/**
 * 사용 내역 화면의 조건. `from`·`to`는 사용일(한국 날짜)이고 둘 다 그날을 포함하며 필수다(시작일 + 1년까지).
 * `campusId`를 주지 않으면 직원은 소속 지점, 관리자는 전 지점이다.
 */
export type RedemptionFilters = Pick<RedemptionQuery, 'from' | 'to' | 'campusId'> & {
  /** 0부터 */
  page: number
}

const redemptionsQueryKey = ['dongtanpass', 'redemptions'] as const
type RedemptionKey = readonly [...typeof redemptionsQueryKey, RedemptionFilters]

/** 데스크의 패스 사용 내역 한 페이지. 최신 사용 순이다. 직원·관리자만 부를 수 있다. */
export function useRedemptions(filters: RedemptionFilters) {
  const queryKey: RedemptionKey = [...redemptionsQueryKey, filters]
  const { from, to, campusId, page } = filters
  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.get<RedemptionPage>('/api/v1/dongtanpass/redemptions', {
        query: { from, to, campusId, page: page || undefined } satisfies RedemptionQuery,
        signal,
      }),
    // 장부와 같다. 페이지만 넘길 때만 이전 페이지를 보여 준다.
    placeholderData: (previous, previousQuery) => {
      const before = (previousQuery?.queryKey as RedemptionKey | undefined)?.[2]
      return before && hashKey([{ ...before, page: 0 }]) === hashKey([{ ...filters, page: 0 }])
        ? previous
        : undefined
    },
    ...ALWAYS,
  })
}

/**
 * 패스를 낸 쪽. 링크 새로 만들기와 취소의 주소, 다시 받을 목록이 다르다.
 * - `partner`: 연계 학원이 발급한 패스(연계 학원 계정의 장부)
 * - `campus`: JEY가 발급한 패스(관리자의 JEY 발급 목록)
 */
export type PassIssuer = 'partner' | 'campus'

const passActionBase: Record<PassIssuer, string> = {
  partner: '/api/v1/dongtanpass/passes',
  campus: '/api/v1/dongtanpass/campus-passes',
}

/** 낸 쪽의 목록 캐시 키. 링크 새로 만들기·취소 뒤 이 키로 다시 받는다. */
function listKeyOf(issuer: PassIssuer) {
  return issuer === 'partner' ? ledgerQueryKey : campusPassesQueryKey
}

/** 패스 하나에 하는 일(링크 새로 만들기, 취소)의 주소. 창이 닫혀 대상이 없을 때(null)는 부르지 않는다. */
function passActionPath(issuer: PassIssuer, id: number | null, action: 'link' | 'cancel') {
  return `${passActionBase[issuer]}/${id ?? 0}/${action}`
}

function requireId(id: number | null): number {
  if (id === null) throw new Error('대상 패스 없이 부를 수 없어요.')
  return id
}

/**
 * 패스의 학부모 링크를 새로 만든다. 예전 링크는 더 쓸 수 없다. 새 토큰은 이 응답에만 있다.
 * 응답을 받지 못한 뒤 다시 보내면 같은 키가 나가 처음의 응답이 다시 온다(링크가 또 바뀌지 않는다).
 * 창을 닫았다 같은 패스로 다시 열어도 그 키를 쓴다. 다른 패스면 주소가 달라 새 키다.
 * `id`는 창의 대상이다. 창이 닫혀 있으면 null이다.
 * 그 사이 사용·취소된 패스라는 답(409·404)이면 목록을 다시 받는다.
 */
export function useRegeneratePassLink(issuer: PassIssuer, id: number | null) {
  const queryClient = useQueryClient()
  const regenerate = useIdempotentPost<undefined, PassLink>(passActionPath(issuer, id, 'link'))
  return useMutation({
    mutationFn: () => {
      requireId(id)
      return regenerate(undefined)
    },
    onError: (error) => {
      if (isStalePassError(error)) {
        void queryClient.invalidateQueries({ queryKey: listKeyOf(issuer) })
      }
    },
    // 응답에 새 링크의 토큰이 있다. 창이 닫히며 reset하면 바로 지워지게 한다(기본값이면 5분 남는다).
    gcTime: 0,
    ...ALWAYS,
  })
}

/**
 * 패스 취소. 되돌릴 수 없다. 결제는 앱에서 건드리지 않는다(안내 문구는 PassCancelModal이 낸 쪽에 따라 고른다).
 * 응답을 받지 못한 뒤 다시 보내면 같은 키가 나간다(useRegeneratePassLink와 같다). `id`도 같다.
 * 성공했든 실패했든 낸 쪽의 목록을 다시 받는다. 응답만 놓쳤거나, 그 사이 사용·취소돼 409가 온 경우에도 줄의 상태가 바뀌어 있다.
 * 새 목록은 성공했을 때만, 그것도 상한(waitForRefresh)까지만 기다린다. 그동안 창이 "취소하는 중"으로 잠긴다.
 * 실패했을 때 기다리면 목록 요청이 다시 보내는 동안(수십 초) 안내 없이 창이 잠긴다.
 */
export function useCancelPass(issuer: PassIssuer, id: number | null) {
  const queryClient = useQueryClient()
  const cancel = useIdempotentPost<undefined, PassCancel>(passActionPath(issuer, id, 'cancel'))
  return useMutation({
    mutationFn: () => {
      requireId(id)
      return cancel(undefined)
    },
    onSettled: (_data, error) => {
      const refreshed = queryClient.invalidateQueries({ queryKey: listKeyOf(issuer) })
      return error ? undefined : waitForRefresh(refreshed)
    },
    ...ALWAYS,
  })
}

/** 학부모 패스. 링크(`/p/:token`)의 토큰으로 연다(로그인 없음). 이름은 서버가 가려서 준다. */
export type HolderPass = components['schemas']['HolderPassResponse']
/** 데스크에 보여 줄 QR. `receivedAt`은 이 화면이 받은 시각(이 기기 시계)이다. */
export type HolderQr = components['schemas']['HolderQrResponse'] & { receivedAt: number }

// 키에 링크의 토큰이 들어간다. 콘솔에는 앞 두 마디만 남는다(app/errorLogging).
export const holderPassQueryKey = (token: string) => ['dongtanpass', 'holder-pass', token] as const
const holderQrQueryKey = (token: string) => ['dongtanpass', 'holder-qr', token] as const

/** QR을 새로 받는 간격. QR은 받은 때부터 59초 넘게 쓸 수 있어, 그 전에 미리 받는다. */
export const QR_REFRESH_MS = 45_000
/**
 * 받은 QR을 쓸 수 있다고 보는 시간. 서버가 "받은 때부터 59초 넘게"를 보장한다.
 * 서버의 만료 시각(expiresAt) 대신 받은 시각으로 잰다. 휴대폰 시계가 틀려도 QR이 일찍 흐려지거나 끝까지 선명하지 않게 한다.
 */
export const QR_VALID_MS = 59_000

/**
 * 학부모 패스 열람. 토큰은 주소에 싣지 않고 본문으로 보낸다(서버가 쿼리 문자열을 받지 않는다).
 * 없는 링크·막힌 옛 링크는 모두 404(DONGTANPASS_PASS_NOT_FOUND)다. 4xx는 다시 보내지 않는다(기본 설정).
 */
export function useHolderPass(token: string) {
  return useQuery({
    queryKey: holderPassQueryKey(token),
    queryFn: ({ signal }) =>
      api.post<HolderPass>('/api/v1/dongtanpass/holder/view', { token }, { signal }),
    ...ALWAYS,
  })
}

/**
 * 학부모 패스의 QR. 받을 때마다 새 QR이다. 쓸 수 있는 패스(ISSUED)에서만 켠다. 아니면 409다.
 * 45초마다 다시 받고, 화면이 가려져 있으면 멈춘다. 화면이 다시 보이거나 온라인이 되면 바로 받는다
 * (staleTime 0이라 화면 포커스·재연결 때 다시 받기가 늘 일어난다).
 */
export function useHolderQr(token: string, { enabled }: { enabled: boolean }) {
  return useQuery({
    queryKey: holderQrQueryKey(token),
    queryFn: async ({ signal }): Promise<HolderQr> => {
      const qr = await api.post<components['schemas']['HolderQrResponse']>(
        '/api/v1/dongtanpass/holder/qr',
        { token },
        { signal },
      )
      return { ...qr, receivedAt: Date.now() }
    },
    enabled,
    staleTime: 0,
    // 화면을 떠나면 QR을 바로 지운다. 다시 오면 새로 받는다.
    gcTime: 0,
    refetchInterval: QR_REFRESH_MS,
    refetchIntervalInBackground: false,
    ...ALWAYS,
  })
}

export type HolderRelinkRequest = components['schemas']['HolderRelinkRequest']
export type HolderRelink = components['schemas']['HolderRelinkResponse']

/**
 * 학부모가 링크를 다시 받는다(로그인 없음). 학생 이름과 전체 번호가 맞고 쓸 수 있는 패스면 새 링크를 만든다.
 * 그 패스의 예전 링크는 바로 막힌다. 이름과 번호는 본문으로만 보낸다(주소에 실으면 서버가 거부한다).
 * 서버가 멱등 키를 받지 않는다. 응답을 놓친 뒤 다시 보내면 링크가 한 번 더 바뀐다(마지막 것만 열린다).
 */
export function useRelinkHolderPass() {
  return useMutation({
    mutationFn: (body: HolderRelinkRequest) =>
      api.post<HolderRelink>('/api/v1/dongtanpass/holder/relink', body),
    ...ALWAYS,
  })
}

export type PassVerifyRequest = components['schemas']['PassVerifyRequest']
export type VerifiedPass = components['schemas']['VerifiedPassResponse']

/**
 * 데스크 패스 확인. QR 글자나 패스 번호 중 하나만 보낸다. 통과한 패스는 늘 쓸 수 있는 패스다(쓸 수 없으면 409).
 * 서버가 멱등 키를 받지 않는다(`@NotIdempotent`). 같은 QR은 한 번만 통과한다(성공해도, 409를 받아도 그 QR은 쓰인다).
 * 응답을 놓쳤을 때는 같은 QR로 다시 해도 된다(서버 장애로 토큰만 쓰이지는 않는다).
 */
export function useVerifyPass() {
  return useMutation({
    mutationFn: (body: PassVerifyRequest) =>
      api.post<VerifiedPass>('/api/v1/dongtanpass/passes/verify', body),
    ...ALWAYS,
  })
}

export type HolderCheckRequest = components['schemas']['HolderCheckRequest']
export type HolderCheckResult = components['schemas']['HolderCheckResponse']

/**
 * 데스크 본인 미리 확인. 등록 폼에 적은 학생 이름과 학부모 번호(1~4개)가 패스와 맞는지 따로 답한다.
 * 바꾸는 자료가 없어 멱등 키를 보내지 않고, 응답을 놓치면 다시 해도 된다. 맞든 틀리든 횟수에 센다(429).
 * 미리 확인일 뿐이고 최종 판단은 사용 처리가 다시 한다. 이름과 번호는 본문으로만 보낸다.
 */
export function useHolderCheck(passId: number) {
  return useMutation({
    mutationFn: (body: HolderCheckRequest) =>
      api.post<HolderCheckResult>(`/api/v1/dongtanpass/passes/${passId}/holder-check`, body),
    // 요청 본문(학생 이름, 학부모 번호 원문)이 mutation 캐시에 들어 있다. 기본값이면 화면을 떠난 뒤에도 5분 남는다.
    // 0으로 두어 데스크 결과가 내려가는 즉시 지운다(학생 등록과 같은 까닭).
    gcTime: 0,
    ...ALWAYS,
  })
}

export type RedeemRequest = components['schemas']['PassRedeemRequest']
export type RedeemResult = components['schemas']['PassRedeemResponse']

/**
 * 데스크 패스 사용 처리. 방금 등록한 학생(`studentId`)에게 패스를 쓴다. 금액은 다루지 않는다.
 * 서버가 Idempotency-Key를 지키므로, 처리됐는데 응답만 놓친 뒤 다시 보내도 한 번만 처리되고 처음의 응답을 받는다.
 * 실패해도 학생을 다시 등록하지 않는다. 같은 학생 ID로 이 요청만 다시 보낸다.
 * 서버가 이름과 번호를 다시 확인한다(맞지 않으면 409). 맞든 틀리든 횟수에 센다(429).
 */
export function useRedeemPass(passId: number) {
  const redeem = useIdempotentPost<RedeemRequest, RedeemResult>(
    `/api/v1/dongtanpass/passes/${passId}/redeem`,
  )
  return useMutation({ mutationFn: redeem, ...ALWAYS })
}

// ── JEY 발급(반대 방향, 백엔드 ADR-0040). 모두 관리자만 부를 수 있다. ──

export type CampusPassIssueRequest = components['schemas']['CampusPassIssueRequest']
/** JEY가 발급한 패스. 학부모 링크의 토큰(linkToken)은 이 응답에만 있다. */
export type CampusIssuedPass = components['schemas']['CampusPassIssueResponse']
export type CampusPassItem = components['schemas']['CampusPassItemResponse']
export type CampusPassPage = components['schemas']['CampusPassPageResponse']
export type CampusBenefit = components['schemas']['CampusBenefitResponse']
/** 발급 화면의 학생. 학생 화면의 코드는 가져오지 않고 같은 API를 직접 부른다(기능 폴더끼리 가져오지 않는다). */
export type IssueStudent = components['schemas']['StudentResponse']

type CampusPassQuery = NonNullable<
  paths['/api/v1/dongtanpass/campus-passes']['get']['parameters']['query']
>

/** JEY 발급 고지 문구의 캐시 키. 연계 학원 발급 문구와 버전이 다르다. */
export const campusConsentNoticeQueryKey = ['dongtanpass', 'campus-consent-notice'] as const

/** JEY가 발급할 때 학부모에게 보여 줄 개인정보 고지 문구. */
export function useCampusConsentNotice() {
  return useQuery({
    queryKey: campusConsentNoticeQueryKey,
    queryFn: ({ signal }) =>
      api.get<ConsentNotice>('/api/v1/dongtanpass/campus-passes/consent-notice', { signal }),
    ...ALWAYS,
  })
}

// 학생 화면의 상세와 같은 키다. 그 화면에서 넘어오면 받아 둔 학생을 바로 보여 준다(키만 맞춘다).
export const issueStudentQueryKey = (id: number) => ['students', 'detail', id] as const

/** 발급할 학생. 상태(재원·퇴원), 지점, 대표 연락처(가린 번호)를 본다. id가 null이면 묻지 않는다. */
export function useIssueStudent(id: number | null) {
  return useQuery({
    queryKey: issueStudentQueryKey(id ?? 0),
    queryFn:
      id === null
        ? skipToken
        : ({ signal }) => api.get<IssueStudent>(`/api/v1/students/${id}`, { signal }),
    ...ALWAYS,
  })
}

/**
 * JEY 발급. 학생 이름과 학부모 번호는 서버가 학생 자료(대표 연락처)에서 가져온다.
 * 서버가 Idempotency-Key를 지키므로 응답만 놓친 뒤 같은 내용으로 다시 보내도 한 번만 발급된다.
 * 연락처가 없다는 거부(409)는 4xx라 다음 시도는 새 키로 나간다. 학생 상세에서 연락처를 더한 뒤 다시 발급하면 된다.
 */
export function useIssueCampusPass() {
  const queryClient = useQueryClient()
  const issue = useIdempotentPost<CampusPassIssueRequest, CampusIssuedPass>(
    '/api/v1/dongtanpass/campus-passes',
  )
  return useMutation({
    mutationFn: issue,
    // 목록은 다음에 볼 때 다시 받는다. 응답을 놓쳤어도 발급됐을 수 있다.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: campusPassesQueryKey }),
    // 응답에 학부모 링크의 토큰이 있다. 화면을 떠나는 즉시 지운다(기본값이면 5분 남는다).
    gcTime: 0,
    ...ALWAYS,
  })
}

/** JEY 발급 목록의 조건. `studentId`가 있으면 그 학생의 패스만 본다. `from`·`to`는 발급일(한국 날짜)이다. */
export type CampusPassFilters = Pick<CampusPassQuery, 'studentId' | 'from' | 'to' | 'status'> & {
  /** 0부터 */
  page: number
}

/** JEY 발급 목록의 캐시 키 앞부분. 발급·취소 뒤, 그리고 링크 새로 만들기가 낡은 패스라는 답을 받으면 이 키로 다시 받는다. */
export const campusPassesQueryKey = ['dongtanpass', 'campus-passes'] as const
type CampusPassesKey = readonly [...typeof campusPassesQueryKey, CampusPassFilters]

/** JEY 발급 목록 한 페이지. 최신 발급 순이다. 학부모 번호는 없다. */
export function useCampusPasses(filters: CampusPassFilters) {
  const queryKey: CampusPassesKey = [...campusPassesQueryKey, filters]
  const { studentId, from, to, status, page } = filters
  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.get<CampusPassPage>('/api/v1/dongtanpass/campus-passes', {
        query: {
          studentId,
          from,
          to,
          status,
          page: page || undefined,
        } satisfies CampusPassQuery,
        signal,
      }),
    // 장부와 같다. 같은 조건에서 페이지만 넘길 때만 이전 페이지를 보여 준다.
    placeholderData: (previous, previousQuery) => {
      const before = (previousQuery?.queryKey as CampusPassesKey | undefined)?.[2]
      return before && hashKey([{ ...before, page: 0 }]) === hashKey([{ ...filters, page: 0 }])
        ? previous
        : undefined
    },
    ...ALWAYS,
  })
}

const campusBenefitQueryKey = ['dongtanpass', 'campus-benefit'] as const

/** JEY 발급 패스의 할인율(5%는 0.05). 새로 발급하는 패스에 쓰인다. */
export function useCampusBenefit() {
  return useQuery({
    queryKey: campusBenefitQueryKey,
    queryFn: ({ signal }) =>
      api.get<CampusBenefit>('/api/v1/dongtanpass/campus-benefit', { signal }),
    ...ALWAYS,
  })
}

/**
 * 할인율 바꾸기. 이미 발급한 패스의 할인율은 그대로다(발급 때 값을 패스에 남긴다).
 * 같은 값을 다시 보내도 결과가 같아 멱등 키가 필요 없다. 0보다 크고 1 이하, 소수 넷째 자리까지가 아니면 400이다.
 */
export function useChangeCampusBenefit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CampusBenefit) =>
      api.put<CampusBenefit>('/api/v1/dongtanpass/campus-benefit', body),
    onSuccess: (saved) => queryClient.setQueryData(campusBenefitQueryKey, saved),
    // 응답을 놓쳤으면 바뀌었는지 모른다. 다시 받아 지금 값을 보여 준다.
    onError: () => void queryClient.invalidateQueries({ queryKey: campusBenefitQueryKey }),
    ...ALWAYS,
  })
}

// ── 연계 학원의 JEY 패스 사용 처리(백엔드 ADR-0041). 사용 내역 말고는 연계 학원 계정만 부를 수 있다. ──

/** 연계 학원이 확인한 JEY 발급 패스. 이름은 가려서 온다. 확인은 그 학원에서 30분 동안 유효하다. */
export type PartnerVerifiedPass = components['schemas']['PartnerVerifiedPassResponse']
export type PartnerQuote = components['schemas']['PartnerQuoteResponse']
export type PartnerRedeemRequest = components['schemas']['PartnerRedeemRequest']
export type PartnerRedeemResult = components['schemas']['PartnerRedeemResponse']

const partnerRedemptionBase = '/api/v1/dongtanpass/partner-redemptions'

/**
 * 연계 학원의 패스 확인. QR 글자나 패스 번호 중 하나만 보낸다(데스크와 같은 본문). 멱등 키를 받지 않는다.
 * 연계 학원이 발급한 패스와 이 학원에서 이미 할인받은 학생은 QR을 쓰기 전에 거부한다(409).
 */
export function usePartnerVerifyPass() {
  return useMutation({
    mutationFn: (body: PassVerifyRequest) =>
      api.post<PartnerVerifiedPass>(`${partnerRedemptionBase}/verify`, body),
    ...ALWAYS,
  })
}

/** 연계 학원의 본인 미리 확인. 데스크와 같은 본문·응답이다. 맞든 틀리든 횟수에 센다(429). */
export function usePartnerHolderCheck(passId: number) {
  return useMutation({
    mutationFn: (body: HolderCheckRequest) =>
      api.post<HolderCheckResult>(`${partnerRedemptionBase}/${passId}/holder-check`, body),
    // 요청 본문에 학생 이름과 학부모 번호 원문이 있다. 화면이 내려가는 즉시 지운다(데스크와 같다).
    gcTime: 0,
    ...ALWAYS,
  })
}

/** 받을 금액 미리 보기. 기록하지 않고 횟수도 세지 않는다. 금액 계산은 서버가 한다. */
export function usePartnerQuote(passId: number) {
  return useMutation({
    mutationFn: (originalFee: number) =>
      api.post<PartnerQuote>(`${partnerRedemptionBase}/${passId}/quote`, { originalFee }),
    ...ALWAYS,
  })
}

/**
 * 연계 학원의 사용 처리. 서버가 Idempotency-Key를 지키므로 응답만 놓친 뒤 같은 내용으로 다시 보내도 한 번만 처리된다.
 * 확인한 지 30분이 지나 "다시 확인하라"(404)는 처리되지 않았다는 답이다. 4xx라 다음 시도는 새 키로 나가지만 두 번 처리되지 않는다.
 * (그 전에 응답을 놓친 시도가 사실 처리됐다면, 다시 확인할 때 이미 사용된 패스라는 답이 온다.)
 * 서버가 이름과 번호를 다시 맞춰 본다(맞지 않으면 409). 맞든 틀리든 횟수에 센다(429, 데스크와 같은 한도).
 */
export function usePartnerRedeem(passId: number) {
  const redeem = useIdempotentPost<PartnerRedeemRequest, PartnerRedeemResult>(
    `${partnerRedemptionBase}/${passId}/redeem`,
  )
  return useMutation({
    mutationFn: redeem,
    // 요청 본문에 학생 이름과 학부모 번호 원문이 있다. 화면이 내려가는 즉시 지운다.
    gcTime: 0,
    ...ALWAYS,
  })
}
