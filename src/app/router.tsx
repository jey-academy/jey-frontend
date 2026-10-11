import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { HomePage } from '@/features/home/pages/HomePage'
import { ClassesPage } from '@/features/settings/pages/ClassesPage'
import { DiscountTypesPage } from '@/features/settings/pages/DiscountTypesPage'
import { SettingsLayout } from '@/features/settings/SettingsLayout'
import { StudentNewPage } from '@/features/students/pages/StudentNewPage'
import { StudentsPage } from '@/features/students/pages/StudentsPage'
import { ADMIN_ROLES, DESK_ROLES, PARTNER_ROLES, RequireRole } from '@/shared/auth'
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
 *
 * 직원 화면은 가드(RequireRole)를 두 번 거친다. 바깥 가드는 로그인 여부를, 안쪽 가드는 주소별 역할을 본다.
 * 새 직원 화면은 맞는 역할의 가드 안에 라우트만 추가하면 된다.
 */
export const routes: RouteObject[] = [
  {
    // 레이아웃 자체가 깨졌을 때의 마지막 안전망
    ErrorBoundary: RouteErrorPage,
    children: [
      { path: '/', Component: HomePage },
      { path: '/login', Component: LoginPage },
      ...devRoutes,
      {
        // 로그인하지 않았으면 틀도 그리지 않고 로그인 화면으로 보낸다.
        element: <RequireRole roles={['STAFF', 'ADMIN', 'PARTNER']} />,
        children: [
          {
            Component: StaffLayout,
            children: [
              {
                ErrorBoundary: RouteErrorPage,
                children: [
                  {
                    element: <RequireRole roles={DESK_ROLES} />,
                    children: [
                      { path: '/desk/dongtanpass', Component: ComingSoonPage },
                      { path: '/desk/students', Component: StudentsPage },
                      { path: '/desk/students/new', Component: StudentNewPage },
                      ...devStaffRoutes,
                      { path: '/desk/*', Component: NotFoundPage },
                    ],
                  },
                  {
                    element: <RequireRole roles={PARTNER_ROLES} />,
                    children: [
                      { path: '/partner/passes/new', Component: ComingSoonPage },
                      { path: '/partner/passes', Component: ComingSoonPage },
                      { path: '/partner/*', Component: NotFoundPage },
                    ],
                  },
                  {
                    element: <RequireRole roles={ADMIN_ROLES} />,
                    children: [
                      {
                        path: '/admin/settings',
                        element: <Navigate to="/admin/settings/classes" replace />,
                      },
                      {
                        Component: SettingsLayout,
                        children: [
                          { path: '/admin/settings/classes', Component: ClassesPage },
                          { path: '/admin/settings/discount-types', Component: DiscountTypesPage },
                        ],
                      },
                      { path: '/admin/*', Component: NotFoundPage },
                    ],
                  },
                ],
              },
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
