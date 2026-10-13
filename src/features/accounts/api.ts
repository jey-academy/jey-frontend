import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api, splitServerError, supportRequestId, type ServerErrors } from '@/shared/api'
import type { components, operations } from '@/shared/api/schema'

/** 로그인 계정 하나. 비밀번호는 어떤 응답에도 없다. `campusId`는 직원만 값이 있다. */
export type Account = components['schemas']['AccountResponse']
export type AccountPage = components['schemas']['AccountPageResponse']
export type AccountCreateRequest = components['schemas']['AccountCreateRequest']
export type AccountUpdateRequest = components['schemas']['AccountUpdateRequest']
type PasswordResetRequest = components['schemas']['PasswordResetRequest']

// 조건의 이름과 값은 생성된 타입에서 뽑는다. 서버가 조건을 바꾸면 여기서 컴파일 에러가 난다.
type AccountQuery = NonNullable<operations['accounts']['parameters']['query']>
export type AccountFilters = Pick<AccountQuery, 'role' | 'campusId' | 'status'> & {
  /** 0부터 */
  page: number
}

const listKey = ['accounts', 'list'] as const
type AccountListKey = readonly [...typeof listKey, AccountFilters]

/** 계정 목록의 한 페이지. 아이디 순이고 차단된 계정도 들어 있다. 관리자만 받는다. */
export function useAccounts({ role, campusId, status, page }: AccountFilters) {
  const queryKey: AccountListKey = [...listKey, { role, campusId, status, page }]

  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.get<AccountPage>('/api/v1/accounts', {
        query: { role, campusId, status, page },
        signal,
      }),
    // 같은 조건에서 페이지만 넘길 때는, 다음 페이지를 받는 동안 이전 페이지를 그대로 보여준다.
    // 조건이 바뀌었을 때는 보여주지 않는다. 이전 조건의 계정이 새 조건의 결과처럼 보인다.
    placeholderData: (previous, previousQuery) => {
      const before = (previousQuery?.queryKey as AccountListKey | undefined)?.[2]
      const sameFilters =
        before?.role === role && before?.campusId === campusId && before?.status === status
      return sameFilters ? previous : undefined
    },
    // 기본값은 오프라인일 때 요청을 보내지 않고 기다린다. 그러면 안내 없이 멈춰 보이므로 바로 시도해 실패를 알린다.
    networkMode: 'always',
  })
}

// 바꾼 뒤에는 응답을 목록에 끼워 넣지 않고 목록을 다시 받는다. 화면이 항상 서버와 같은 내용을 보여준다.
// 실패했을 때도 다시 받는다. 응답이 끊겼을 뿐 서버에는 저장됐을 수 있고(계정 API는 멱등 키를 받지 않는다),
// 저장은 됐는데 로그아웃만 못 시킨 경우(AUTH_SESSION_TERMINATION_FAILED)도 실패로 온다.
function useRefreshList() {
  const queryClient = useQueryClient()
  return (_data: unknown, error: unknown) => {
    const refreshed = queryClient.invalidateQueries({ queryKey: listKey })
    // 성공했을 때만 새 목록을 기다린다. 창이 닫힐 때 목록이 이미 바뀌어 있게 한다. 실패 안내는 기다리지 않고 바로 보여준다.
    return error ? undefined : refreshed
  }
}

// 변경 요청이 같이 쓰는 옵션.
// 기본값은 오프라인일 때 요청을 보내지 않고 기다린다. 그러면 창이 "저장하는 중"으로 잠긴 채 끝나지 않는다. 바로 시도해 실패를 알린다.
const ALWAYS = { networkMode: 'always' } as const
// 요청 본문에 비밀번호 원문이 들어 있다. 기본값이면 창을 닫은 뒤에도 5분 남는다. 0으로 두어 창이 닫히는 즉시 지운다.
const FORGET = { gcTime: 0 } as const

/**
 * 계정 만들기. 멱등 키를 싣지 않는다(서버가 받지 않는다. 비밀번호가 든 본문의 지문을 남기지 않으려는 것이다).
 * 그래서 만들어졌는데 응답만 놓친 뒤 다시 보내면 "이미 사용 중인 아이디"(409)가 온다.
 */
export function useCreateAccount() {
  return useMutation({
    mutationFn: (body: AccountCreateRequest) => api.post<Account>('/api/v1/accounts', body),
    onSettled: useRefreshList(),
    ...FORGET,
    ...ALWAYS,
  })
}

/** 계정 고치기. 값을 통째로 바꾸는 요청이라 그대로 둘 값도 모두 보낸다. 역할이나 지점을 바꾸면 그 계정은 로그아웃된다. */
export function useUpdateAccount() {
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: AccountUpdateRequest }) =>
      api.put<Account>(`/api/v1/accounts/${id}`, body),
    onSettled: useRefreshList(),
    ...ALWAYS,
  })
}

/** 차단하거나 차단을 푼다. 차단하면 그 계정은 로그아웃된다. 같은 요청을 다시 보내도 결과가 같다. */
export function useSetAccountDisabled() {
  return useMutation({
    mutationFn: ({ id, disabled }: { id: number; disabled: boolean }) =>
      api.post<Account>(`/api/v1/accounts/${id}/${disabled ? 'disable' : 'enable'}`),
    onSettled: useRefreshList(),
    ...ALWAYS,
  })
}

/** 다른 계정의 비밀번호를 다시 정한다. 그 계정은 로그아웃된다. 자기 비밀번호는 여기서 바꾸지 않는다. */
export function useResetAccountPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) => {
      const body: PasswordResetRequest = { password }
      return api.post<void>(`/api/v1/accounts/${id}/password`, body)
    },
    onSettled: useRefreshList(),
    ...FORGET,
    ...ALWAYS,
  })
}

// 변경은 저장됐는데 그 계정을 로그아웃시키지 못했다(503). 세션 저장소에 문제가 있을 때만 온다.
const SESSION_TERMINATION_FAILED = 'AUTH_SESSION_TERMINATION_FAILED'

type AccountErrorOptions<Field extends string> = {
  fields: readonly Field[]
  codes?: Record<string, NoInfer<Field>>
  /** 저장됐는지 알 수 없을 때 덧붙일 말. 주지 않으면 목록을 먼저 확인하라는 기본 안내다(만들기). */
  unsure?: string
}

/**
 * 계정 변경 요청의 에러를 입력칸별 문구와 폼 전체 문구로 나눈다.
 * `splitServerError`에 하나를 더한다: AUTH_SESSION_TERMINATION_FAILED(503)는 서버 문구를 그대로 보여준다.
 * 5xx지만 "저장됐을 수도 있어요"가 아니다. 저장은 됐고, 문구가 할 일(같은 요청을 한 번 더)을 말한다.
 */
export function splitAccountError<Field extends string>(
  error: unknown,
  options: AccountErrorOptions<Field>,
): ServerErrors<Field> {
  if (error instanceof ApiError && error.code === SESSION_TERMINATION_FAILED) {
    return { fields: {}, form: error.message, requestId: supportRequestId(error) }
  }
  return splitServerError(error, options)
}

/** 같은 요청을 다시 보내도 결과가 같은 변경(고치기, 차단, 비밀번호 다시 정하기)이 `unsure`에 넣는 말. */
export const UNSURE_RETRY = '저장됐는지 확인하지 못했어요. 그대로 다시 눌러도 돼요.'
