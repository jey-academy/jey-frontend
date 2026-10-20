import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { HomePage } from '@/features/home/pages/HomePage'
import { SettingsLayout } from '@/features/settings/SettingsLayout'
import { ADMIN_ROLES, DESK_ROLES, PARTNER_ROLES, RequireRole } from '@/shared/auth'
import { GuardianLayout } from './layouts/GuardianLayout'
import { StaffLayout } from './layouts/StaffLayout'
import { AppLoading } from './pages/AppLoading'
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
 *
 * 화면은 그 주소에 처음 갈 때 받는다(lazy). 화면마다 파일이 나뉘어, 학부모 패스를 열 때 직원 화면 코드를 받지 않는다.
 * 틀·가드·로그인·메인·안내 화면은 처음부터 받는다. 첫 화면에 늘 필요하다.
 * 화면 코드를 받지 못하면(배포 뒤 옛 탭 등) 가까운 ErrorBoundary가 "다시 시도"를 보여 준다.
 */
export const routes: RouteObject[] = [
  {
    // 레이아웃 자체가 깨졌을 때의 마지막 안전망
    ErrorBoundary: RouteErrorPage,
    // 처음 연 주소의 화면 코드를 받는 동안 그린다. 화면 코드를 따로 받으면(lazy) 첫 화면에 한 번 거친다.
    HydrateFallback: AppLoading,
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
                  // 로그인한 누구나 본다. 바깥의 로그인 가드만 거친다.
                  { path: '/account', element: <Navigate to="/account/password" replace /> },
                  {
                    path: '/account/password',
                    lazy: () =>
                      import('@/features/auth/pages/PasswordChangePage').then((m) => ({
                        Component: m.PasswordChangePage,
                      })),
                  },
                  { path: '/account/*', Component: NotFoundPage },
                  {
                    element: <RequireRole roles={DESK_ROLES} />,
                    children: [
                      {
                        path: '/desk/dongtanpass',
                        lazy: () =>
                          import('@/features/dongtanpass/pages/DeskPassPage').then((m) => ({
                            Component: m.DeskPassPage,
                          })),
                      },
                      {
                        path: '/desk/dongtanpass/redemptions',
                        lazy: () =>
                          import('@/features/dongtanpass/pages/RedemptionsPage').then((m) => ({
                            Component: m.RedemptionsPage,
                          })),
                      },
                      {
                        path: '/desk/students',
                        lazy: () =>
                          import('@/features/students/pages/StudentsPage').then((m) => ({
                            Component: m.StudentsPage,
                          })),
                      },
                      {
                        path: '/desk/students/new',
                        lazy: () =>
                          import('@/features/students/pages/StudentNewPage').then((m) => ({
                            Component: m.StudentNewPage,
                          })),
                      },
                      {
                        path: '/desk/students/:id',
                        lazy: () =>
                          import('@/features/students/pages/StudentDetailPage').then((m) => ({
                            Component: m.StudentDetailPage,
                          })),
                      },
                      {
                        path: '/desk/students/:id/edit',
                        lazy: () =>
                          import('@/features/students/pages/StudentEditPage').then((m) => ({
                            Component: m.StudentEditPage,
                          })),
                      },
                      ...devStaffRoutes,
                      { path: '/desk/*', Component: NotFoundPage },
                    ],
                  },
                  {
                    element: <RequireRole roles={PARTNER_ROLES} />,
                    children: [
                      {
                        path: '/partner/passes/new',
                        lazy: () =>
                          import('@/features/dongtanpass/pages/PassIssuePage').then((m) => ({
                            Component: m.PassIssuePage,
                          })),
                      },
                      {
                        path: '/partner/passes',
                        lazy: () =>
                          import('@/features/dongtanpass/pages/PassLedgerPage').then((m) => ({
                            Component: m.PassLedgerPage,
                          })),
                      },
                      {
                        path: '/partner/redeem',
                        lazy: () =>
                          import('@/features/dongtanpass/pages/PartnerRedeemPage').then((m) => ({
                            Component: m.PartnerRedeemPage,
                          })),
                      },
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
                          {
                            path: '/admin/settings/classes',
                            lazy: () =>
                              import('@/features/settings/pages/ClassesPage').then((m) => ({
                                Component: m.ClassesPage,
                              })),
                          },
                          {
                            path: '/admin/settings/discount-types',
                            lazy: () =>
                              import('@/features/settings/pages/DiscountTypesPage').then((m) => ({
                                Component: m.DiscountTypesPage,
                              })),
                          },
                          {
                            path: '/admin/settings/accounts',
                            lazy: () =>
                              import('@/features/accounts/pages/AccountsPage').then((m) => ({
                                Component: m.AccountsPage,
                              })),
                          },
                          {
                            path: '/admin/settings/partners',
                            lazy: () =>
                              import('@/features/dongtanpass/pages/PartnersPage').then((m) => ({
                                Component: m.PartnersPage,
                              })),
                          },
                        ],
                      },
                      {
                        path: '/admin/passes/new',
                        lazy: () =>
                          import('@/features/dongtanpass/pages/CampusPassIssuePage').then((m) => ({
                            Component: m.CampusPassIssuePage,
                          })),
                      },
                      {
                        path: '/admin/passes',
                        lazy: () =>
                          import('@/features/dongtanpass/pages/CampusPassesPage').then((m) => ({
                            Component: m.CampusPassesPage,
                          })),
                      },
                      {
                        path: '/admin/audit-logs',
                        lazy: () =>
                          import('@/features/audit/pages/AuditLogsPage').then((m) => ({
                            Component: m.AuditLogsPage,
                          })),
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
              {
                path: '/find',
                lazy: () =>
                  import('@/features/dongtanpass/pages/HolderRelinkPage').then((m) => ({
                    Component: m.HolderRelinkPage,
                  })),
              },
              {
                path: '/p/:token',
                lazy: () =>
                  import('@/features/dongtanpass/pages/HolderPassPage').then((m) => ({
                    Component: m.HolderPassPage,
                  })),
              },
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
