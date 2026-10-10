import { createBrowserRouter, type RouteObject } from 'react-router'
import { HomePage } from '@/features/home/pages/HomePage'
import { GuardianLayout } from './layouts/GuardianLayout'
import { StaffLayout } from './layouts/StaffLayout'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RouteErrorPage } from './pages/RouteErrorPage'

// 개발 서버에서만 열리는 화면. 빌드 결과물에는 들어가지 않는다.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/ui-preview',
        lazy: async () => {
          const { UiPreviewPage } = await import('./dev/UiPreviewPage')
          return { Component: UiPreviewPage }
        },
      },
    ]
  : []

// 에러 화면 확인용(개발 서버 전용). 직원 틀 안에서 화면을 그리다 에러가 나는 상황을 만든다.
const devStaffRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/desk/error-preview',
        lazy: async () => {
          const { ThrowErrorPage } = await import('./dev/ThrowErrorPage')
          return { Component: ThrowErrorPage }
        },
      },
    ]
  : []

/**
 * 화면은 레이아웃(틀) 안에 그려진다. 레이아웃 바로 안쪽에 ErrorBoundary를 둬서,
 * 화면에서 에러가 나도 틀(상단 바, 탭)은 남고 화면 자리에만 에러 안내가 뜬다.
 */
export const routes: RouteObject[] = [
  {
    // 레이아웃 자체가 깨졌을 때의 마지막 안전망
    ErrorBoundary: RouteErrorPage,
    children: [
      { path: '/', Component: HomePage },
      ...devRoutes,
      {
        Component: StaffLayout,
        children: [
          {
            ErrorBoundary: RouteErrorPage,
            children: [
              { path: '/desk/dongtanpass', Component: ComingSoonPage },
              { path: '/partner/passes/new', Component: ComingSoonPage },
              { path: '/partner/passes', Component: ComingSoonPage },
              ...devStaffRoutes,
              { path: '/desk/*', Component: NotFoundPage },
              { path: '/partner/*', Component: NotFoundPage },
              { path: '/admin/*', Component: NotFoundPage },
            ],
          },
        ],
      },
      {
        Component: GuardianLayout,
        children: [
          {
            ErrorBoundary: RouteErrorPage,
            children: [
              { path: '/find', Component: ComingSoonPage },
              { path: '/p/:token', Component: ComingSoonPage },
              // 그 밖의 없는 주소는 학부모 틀 안에서 안내한다.
              { path: '*', Component: NotFoundPage },
            ],
          },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
