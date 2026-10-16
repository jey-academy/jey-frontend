import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isRetryable } from '@/shared/api'
import { isUnauthenticated, meQueryKey } from '@/shared/auth'
import { logRequestError } from './errorLogging'

/** 앱 전체가 쓰는 QueryClient를 만든다. 테스트에서도 같은 설정으로 만들어 쓴다. */
export function createQueryClient(): QueryClient {
  // 쓰는 도중에 세션이 끊기면 어느 요청이든 401을 받는다. 그때 "로그인 안 함"으로 바꿔 두면
  // 가드(RequireRole)가 로그인 화면으로 보낸다. 화면마다 401을 처리하지 않아도 된다.
  // queryKey는 조회가 실패했을 때만 있다. 변경 요청의 본문(variables)은 받지 않는다. 입력값이 들어 있다.
  const handleError = (error: unknown, queryKey?: readonly unknown[]) => {
    if (isUnauthenticated(error)) client.setQueryData(meQueryKey, null)
    // 예상하지 못한 오류는 요청 번호와 함께 콘솔에 남긴다. 화면의 안내는 창을 닫으면 사라진다.
    // 화면 코드의 버그로 난 에러도 남긴다.
    logRequestError(error, { queryKey })
  }

  const client = new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => handleError(error, query.queryKey) }),
    mutationCache: new MutationCache({ onError: (error) => handleError(error) }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // 연결이 돌아오면 낡은 값을 다시 받는다. 조회 대부분이 networkMode 'always'를 쓰는데,
        // TanStack Query는 그때 이 값을 따로 정하지 않으면 끈다. 화면에서 일부러 끈 곳(false)은 그대로다.
        refetchOnReconnect: true,
        // 서버에 닿지 못했거나 5xx일 때만 3번까지 재시도한다. 4xx·타임아웃은 바로 에러를 보여준다.
        retry: (failureCount, error) => isRetryable(error) && failureCount < 3,
      },
    },
  })
  return client
}
