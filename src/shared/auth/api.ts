import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/shared/api'
import type { components } from '@/shared/api/schema'

/** 로그인한 사용자. 백엔드 명세에서 생성한 타입이다. */
export type Me = components['schemas']['MeResponse']
export type Role = Me['role']
type LoginRequest = components['schemas']['LoginRequest']

export const meQueryKey = ['auth', 'me'] as const

/** 세션이 없어서 온 401인지. 로그인하지 않은 상태로 본다. */
export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
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
    // 화면을 옮길 때마다 다시 묻지 않는다. 세션이 끊긴 것은 다른 요청의 401로 알게 된다(providers.tsx).
    staleTime: 5 * 60_000,
  })
}

// 로그인·로그아웃 같은 변경 요청에는 CSRF 토큰이 필요하다. 이 호출이 토큰 쿠키를 받아 온다(백엔드 ADR-0019).
function fetchCsrfCookie() {
  return api.get<void>('/api/v1/auth/csrf')
}

/** 로그인. 성공하면 응답으로 온 사용자 정보를 바로 캐시에 넣어, 다시 묻지 않고 화면이 넘어간다. */
export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: LoginRequest) => {
      await fetchCsrfCookie()
      return api.post<Me>('/api/v1/auth/login', body)
    },
    onSuccess: (me) => {
      queryClient.setQueryData(meQueryKey, me)
    },
  })
}

/** 로그아웃. 같은 기기를 다음 사람이 쓸 수 있으므로 받아 둔 자료를 모두 지운다. */
export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await fetchCsrfCookie()
      await api.post<void>('/api/v1/auth/logout')
    },
    onSettled: (_data, error) => {
      // 실패했는데 로그아웃된 것처럼 보이면 안 된다. 세션이 이미 없었던 경우(401)만 로그아웃으로 본다.
      if (error && !isUnauthenticated(error)) return
      queryClient.clear()
      queryClient.setQueryData(meQueryKey, null)
    },
  })
}
