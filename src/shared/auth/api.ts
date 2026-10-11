import {
  hashKey,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { api, ApiError, isRetryable } from '@/shared/api'
import type { components } from '@/shared/api/schema'

/** 로그인한 사용자. 백엔드 명세에서 생성한 타입이다. */
export type Me = components['schemas']['MeResponse']
export type Role = Me['role']
type LoginRequest = components['schemas']['LoginRequest']

export const meQueryKey = ['auth', 'me'] as const
const meQueryHash = hashKey(meQueryKey)

// 로그인 실패도 401이다. 세션이 없다는 뜻이 아니므로 구분한다(백엔드 ADR-0019).
const INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS'

/** 세션이 없어서 온 401인지. 로그인하지 않은 상태로 본다. */
export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401 && error.code !== INVALID_CREDENTIALS
}

async function fetchMe(signal: AbortSignal): Promise<Me | null> {
  try {
    return await api.get<Me>('/api/v1/auth/me', { signal })
  } catch (error) {
    // 로그인하지 않은 것은 실패가 아니다. 에러 화면 대신 로그인 화면으로 보내야 한다.
    if (isUnauthenticated(error)) return null
    throw error
  }
}

/**
 * 지금 로그인한 사용자. 로그인하지 않았으면 `data`가 null이다.
 * 세션 쿠키는 httpOnly라 화면에서 읽을 수 없다. 그래서 로그인 여부는 서버에 물어본 결과로만 판단한다.
 */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: ({ signal }) => fetchMe(signal),
    // 화면을 옮길 때마다 다시 묻지 않는다. 세션이 끊긴 것은 다른 요청의 401로 알게 된다(app/queryClient.ts).
    staleTime: 5 * 60_000,
    // 이 결과를 기다리는 동안 화면이 비어 있다. 오래 붙잡지 않도록 한 번만 다시 시도한다.
    retry: (failureCount, error) => isRetryable(error) && failureCount < 1,
    // 기본값은 오프라인일 때 요청을 보내지 않고 기다린다. 그러면 안내 없이 멈춰 보이므로 바로 시도해 실패를 알린다.
    networkMode: 'always',
  })
}

// 로그인·로그아웃 같은 변경 요청에는 CSRF 토큰이 필요하다. 이 호출이 토큰 쿠키를 받아 온다(백엔드 ADR-0019).
function fetchCsrfCookie() {
  return api.get<void>('/api/v1/auth/csrf')
}

/** 앞사람이 받아 둔 자료를 지운다. 같은 기기를 다른 사람이 이어서 쓸 수 있다. */
function removeUserData(queryClient: QueryClient) {
  // 로그인 상태(me)는 화면이 보고 있으므로 지우지 않고 호출한 쪽이 값을 바꾼다.
  queryClient.removeQueries({ predicate: (query) => query.queryHash !== meQueryHash })
  // 변경 요청에 실어 보낸 값(조회한 번호 등)도 남기지 않는다.
  queryClient.getMutationCache().clear()
}

/** 로그인. 성공하면 응답으로 온 사용자 정보를 바로 캐시에 넣어, 다시 묻지 않고 화면이 넘어간다. */
export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: LoginRequest) => {
      await fetchCsrfCookie()
      return api.post<Me>('/api/v1/auth/login', body)
    },
    onSuccess: async (me) => {
      // 로그인 전에 보낸 /auth/me의 응답(로그인 안 함)이 늦게 도착해 덮어쓰지 못하게 한다.
      await queryClient.cancelQueries({ queryKey: meQueryKey })
      // 세션이 끊긴 뒤 다른 사람이 로그인한 경우를 위해, 앞사람의 자료를 여기서도 지운다.
      removeUserData(queryClient)
      queryClient.setQueryData(meQueryKey, me)
    },
    // 입력한 비밀번호가 요청 기록에 남지 않게 끝나는 대로 지운다.
    gcTime: 0,
    networkMode: 'always',
  })
}

/**
 * 로그아웃. 실패하면 에러를 던지고 로그인한 상태로 남는다.
 * 세션이 살아 있는데 로그아웃된 것처럼 보이면 안 되기 때문이다. 화면은 실패를 반드시 알려야 한다.
 */
export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      // 토큰 쿠키는 보통 로그인 때 받은 것이 남아 있다. 다시 받지 못해도 로그아웃은 시도한다.
      await fetchCsrfCookie().catch(() => undefined)
      try {
        await api.post<void>('/api/v1/auth/logout')
      } catch (error) {
        // 세션이 이미 없었다면 로그아웃된 것과 같다.
        if (!isUnauthenticated(error)) throw error
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(meQueryKey, null)
      removeUserData(queryClient)
    },
    networkMode: 'always',
  })
}
