import { onlineManager, QueryObserver } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vitest'
import { createQueryClient } from './queryClient'

afterEach(() => {
  onlineManager.setOnline(true)
})

/** 앱과 같은 설정의 QueryClient로 조회 하나를 지켜본다. 받은 횟수를 센다. */
async function watch(options: { refetchOnReconnect?: boolean } = {}) {
  const client = createQueryClient()
  client.mount()
  const queryFn = vi.fn(async () => 'value')
  const observer = new QueryObserver(client, {
    queryKey: ['test', 'reconnect'],
    queryFn,
    // 조회 대부분이 쓰는 설정이다. TanStack Query는 이때 재연결 다시 받기를 기본으로 끈다.
    networkMode: 'always',
    staleTime: 0,
    ...options,
  })
  const unsubscribe = observer.subscribe(() => {})
  await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1))
  return {
    queryFn,
    stop: () => {
      unsubscribe()
      client.unmount()
    },
  }
}

test('연결이 끊겼다가 돌아오면 낡은 조회를 다시 받는다', async () => {
  const { queryFn, stop } = await watch()

  onlineManager.setOnline(false)
  onlineManager.setOnline(true)

  await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
  stop()
})

test('화면에서 재연결 다시 받기를 끈 조회는 돌아와도 받지 않는다', async () => {
  const { queryFn, stop } = await watch({ refetchOnReconnect: false })

  onlineManager.setOnline(false)
  onlineManager.setOnline(true)
  // 다시 받는다면 이 사이에 불렸을 것이다.
  await new Promise((resolve) => setTimeout(resolve, 50))

  expect(queryFn).toHaveBeenCalledTimes(1)
  stop()
})
