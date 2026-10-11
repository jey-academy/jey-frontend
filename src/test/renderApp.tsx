import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, parsePath, RouterProvider, type RouteObject } from 'react-router'
import { createQueryClient } from '@/app/queryClient'
import { routes as appRoutes } from '@/app/router'
import { meQueryKey, type Me } from '@/shared/auth'

export const admin: Me = { id: 1, loginId: 'admin', name: '김원장', role: 'ADMIN', campusId: null }
export const staff: Me = { id: 2, loginId: 'desk1', name: '이데스크', role: 'STAFF', campusId: 1 }
export const partner: Me = {
  id: 3,
  loginId: 'partner1',
  name: '박연계',
  role: 'PARTNER',
  campusId: null,
}

type RenderAppOptions = {
  /**
   * 로그인한 사용자. 주면 서버에 묻지 않고 그 사람으로 시작한다. null이면 로그인하지 않은 상태다.
   * 주지 않으면 실제처럼 `/auth/me`를 호출하므로 fetch를 흉내 내야 한다.
   */
  me?: Me | null
  routes?: RouteObject[]
  /** 이전 화면이 넘겨준 값(location.state) */
  state?: unknown
}

/** 앱과 같은 QueryClient 설정과 라우터로 화면을 그린다. 주소에는 쿼리 문자열을 붙여도 된다. */
export function renderApp(path: string, { me, routes = appRoutes, state }: RenderAppOptions = {}) {
  const queryClient = createQueryClient()
  if (me !== undefined) queryClient.setQueryData(meQueryKey, me)

  const router = createMemoryRouter(routes, { initialEntries: [{ ...parsePath(path), state }] })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient }
}
