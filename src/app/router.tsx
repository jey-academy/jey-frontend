import { createBrowserRouter, type RouteObject } from 'react-router'
import { HomePage } from '@/features/home/pages/HomePage'

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

export const router = createBrowserRouter([{ path: '/', Component: HomePage }, ...devRoutes])
