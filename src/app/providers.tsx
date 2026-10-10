import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import type { ReactNode } from 'react'
import { isRetryable } from '@/shared/api'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // 서버에 닿지 못했거나 5xx일 때만 3번까지 재시도한다. 4xx·타임아웃은 바로 에러를 보여준다.
      retry: (failureCount, error) => isRetryable(error) && failureCount < 3,
    },
  },
})

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools />
    </QueryClientProvider>
  )
}
