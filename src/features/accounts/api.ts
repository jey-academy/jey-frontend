import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, waitForRefresh } from '@/shared/api'
import type { components, paths } from '@/shared/api/schema'

/** 로그인 계정 하나. 비밀번호는 어떤 응답에도 없다. `campusId`는 직원만 값이 있다. */
export type Account = components['schemas']['AccountResponse']
export type AccountPage = components['schemas']['AccountPageResponse']
export type AccountCreateRequest = components['schemas']['AccountCreateRequest']
export type AccountUpdateRequest = components['schemas']['AccountUpdateRequest']
type PasswordResetRequest = components['schemas']['PasswordResetRequest']

// 조건의 이름과 값은 생성된 타입에서 뽑는다. 서버가 조건의 이름을 바꾸거나 없애면 여기서 컴파일 에러가 난다.
// 경로로 찾는다(operations의 이름은 백엔드 메서드 이름에서 나와, 겹치면 번호가 붙어 밀린다).
type AccountQuery = NonNullable<paths['/api/v1/accounts']['get']['parameters']['query']>
/** 목록의 조건. `page`는 0부터이고 늘 있다. */
export type AccountFilters = Pick<AccountQuery, 'role' | 'campusId' | 'status'> &
  Required<Pick<AccountQuery, 'page'>>

const listKey = ['accounts', 'list'] as const
type AccountListKey = readonly [...typeof listKey, AccountFilters]

/** 계정 목록의 한 페이지. 아이디 순이고 차단된 계정도 들어 있다. 관리자만 받는다. */
export function useAccounts({ role, campusId, status, page }: AccountFilters) {
  const queryKey: AccountListKey = [...listKey, { role, campusId, status, page }]

  return useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.get<AccountPage>('/api/v1/accounts', {
        // 서버는 모르는 조건을 말없이 무시한다. 보내는 이름이 서버의 것과 같은지 타입으로 본다.
        query: { role, campusId, status, page } satisfies AccountQuery,
        signal,
      }),
    // 같은 조건에서 페이지만 넘길 때는, 다음 페이지를 받는 동안 이전 페이지를 그대로 보여준다.
    // 조건이 바뀌었을 때는 보여주지 않는다. 보여주면 이전 조건의 계정이 새 조건의 결과처럼 보인다.
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

/**
 * 계정 하나를 새로 받는다. 고치기 창을 열 때 쓴다.
 * 고치기는 값을 통째로 바꾼다. 목록의 낡은 값으로 폼을 채우면, 이름만 고쳐도 그사이 다른 관리자가 바꾼 역할·지점을
 * 옛 값으로 되돌리고 그 계정을 로그아웃시킨다. 그래서 받아 둔 것을 쓰지 않고 창을 열 때마다 새로 받는다.
 */
export function useAccount(id: number) {
  return useQuery({
    queryKey: ['accounts', 'detail', id],
    queryFn: ({ signal }) => api.get<Account>(`/api/v1/accounts/${id}`, { signal }),
    // 받아 둔 것을 남기지 않는다. 창을 다시 열면 받는 동안 옛 값이 보이지 않는다.
    gcTime: 0,
    // 고치는 동안 창 뒤에서 값이 바뀌지 않게 한다. 폼은 처음 받은 값으로 시작한다.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    networkMode: 'always',
  })
}

// 바꾼 뒤에는 응답을 목록에 끼워 넣지 않고 목록을 다시 받는다. 화면이 항상 서버와 같은 내용을 보여준다.
// 실패했을 때도 다시 받는다. 응답이 끊겼을 뿐 서버에는 저장됐을 수 있다(계정 API는 멱등 키를 받지 않는다).
function useRefreshList() {
  const queryClient = useQueryClient()
  return (_data: unknown, error: unknown) => {
    const refreshed = queryClient.invalidateQueries({ queryKey: listKey })
    // 성공했을 때만 새 목록을 기다린다. 창이 닫힐 때 목록이 이미 바뀌어 있게 한다. 실패 안내는 기다리지 않고 바로 보여준다.
    // 기다림에는 상한이 있다. 목록이 늦는다고 저장이 끝난 창을 잠가 두지 않는다(waitForRefresh).
    return error ? undefined : waitForRefresh(refreshed)
  }
}

// 변경 요청이 같이 쓰는 옵션.
// 기본값은 오프라인일 때 요청을 보내지 않고 기다린다. 그러면 창이 "저장하는 중"으로 잠긴 채 끝나지 않는다. 바로 시도해 실패를 알린다.
const ALWAYS = { networkMode: 'always' } as const
// 요청 본문에 비밀번호 원문이 들어 있다. 기본값이면 창을 닫은 뒤에도 5분 남는다. 0으로 두어, 이 훅을 쓰는 폼이
// 사라지는(창이 닫히는) 즉시 지운다. 그래서 이 훅은 늘 그려져 있는 창이 아니라 그 안의 폼에서 부른다.
// 실패해서 고치는 동안에는 폼과 함께 남아 있다.
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

/** 같은 요청을 다시 보내도 결과가 같은 변경(고치기, 차단, 비밀번호 다시 정하기)이 `unsure`에 넣는 말. */
export const UNSURE_RETRY = '저장됐는지 확인하지 못했어요. 그대로 다시 눌러도 돼요.'
