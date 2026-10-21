import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { HomePage } from '@/features/home/pages/HomePage'
import { SettingsLayout } from '@/features/settings/SettingsLayout'
import { ADMIN_ROLES, DESK_ROLES, PARTNER_ROLES, RequireRole } from '@/shared/auth'
import { GuardianLayout } from './layouts/GuardianLayout'
import { StaffLayout } from './layouts/StaffLayout'
import { lazyPage } from './lazyPage'
import { AppLoading } from './pages/AppLoading'
import { NotFoundPage } from './pages/NotFoundPage'
import { RouteErrorPage } from './pages/RouteErrorPage'

// 개발 서버에서만 열리는 화면. 빌드 결과물에는 들어가지 않는다.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/ui-preview',
        lazy: lazyPage(
          () => import('./dev/UiPreviewPage'),
          (m) => m.UiPreviewPage,
        ),
      },
    ]
  : []

// 에러 화면 확인용(개발 서버 전용). 직원 틀 안에서 화면을 그리다 에러가 나는 상황을 만든다.
const devStaffRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/desk/error-preview',
        lazy: lazyPage(
          () => import('./dev/ThrowErrorPage'),
          (m) => m.ThrowErrorPage,
        ),
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
 * 화면 코드를 받지 못하면(배포 뒤 옛 탭 등) 한 번 새로고침하고(preloadReload, lazyPage), 그래도 안 되면
 * 가까운 ErrorBoundary가 "다시 시도"를 보여 준다.
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
                    lazy: lazyPage(
                      () => import('@/features/auth/pages/PasswordChangePage'),
                      (m) => m.PasswordChangePage,
                    ),
                  },
                  { path: '/account/*', Component: NotFoundPage },
                  {
                    element: <RequireRole roles={DESK_ROLES} />,
                    children: [
                      {
                        path: '/desk/dongtanpass',
                        lazy: lazyPage(
                          () => import('@/features/dongtanpass/pages/DeskPassPage'),
                          (m) => m.DeskPassPage,
                        ),
                      },
                      {
                        path: '/desk/dongtanpass/redemptions',
                        lazy: lazyPage(
                          () => import('@/features/dongtanpass/pages/RedemptionsPage'),
                          (m) => m.RedemptionsPage,
                        ),
                      },
                      {
                        path: '/desk/billing/new',
                        lazy: lazyPage(
                          () => import('@/features/billing/pages/RedemptionInvoicePage'),
                          (m) => m.RedemptionInvoicePage,
                        ),
                      },
                      {
                        path: '/desk/billing/invoices/:id',
                        lazy: lazyPage(
                          () => import('@/features/billing/pages/InvoicePage'),
                          (m) => m.InvoicePage,
                        ),
                      },
                      {
                        path: '/desk/students',
                        lazy: lazyPage(
                          () => import('@/features/students/pages/StudentsPage'),
                          (m) => m.StudentsPage,
                        ),
                      },
                      {
                        path: '/desk/students/new',
                        lazy: lazyPage(
                          () => import('@/features/students/pages/StudentNewPage'),
                          (m) => m.StudentNewPage,
                        ),
                      },
                      {
                        path: '/desk/students/:id',
                        lazy: lazyPage(
                          () => import('@/features/students/pages/StudentDetailPage'),
                          (m) => m.StudentDetailPage,
                        ),
                      },
                      {
                        path: '/desk/students/:id/edit',
                        lazy: lazyPage(
                          () => import('@/features/students/pages/StudentEditPage'),
                          (m) => m.StudentEditPage,
                        ),
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
                        lazy: lazyPage(
                          () => import('@/features/dongtanpass/pages/PassIssuePage'),
                          (m) => m.PassIssuePage,
                        ),
                      },
                      {
                        path: '/partner/passes',
                        lazy: lazyPage(
                          () => import('@/features/dongtanpass/pages/PassLedgerPage'),
                          (m) => m.PassLedgerPage,
                        ),
                      },
                      {
                        path: '/partner/redeem',
                        lazy: lazyPage(
                          () => import('@/features/dongtanpass/pages/PartnerRedeemPage'),
                          (m) => m.PartnerRedeemPage,
                        ),
                      },
                      {
                        path: '/partner/redemptions',
                        lazy: lazyPage(
                          () => import('@/features/dongtanpass/pages/PartnerRedemptionsPage'),
                          (m) => m.PartnerRedemptionsPage,
                        ),
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
                            lazy: lazyPage(
                              () => import('@/features/settings/pages/ClassesPage'),
                              (m) => m.ClassesPage,
                            ),
                          },
                          {
                            path: '/admin/settings/discount-types',
                            lazy: lazyPage(
                              () => import('@/features/settings/pages/DiscountTypesPage'),
                              (m) => m.DiscountTypesPage,
                            ),
                          },
                          {
                            path: '/admin/settings/accounts',
                            lazy: lazyPage(
                              () => import('@/features/accounts/pages/AccountsPage'),
                              (m) => m.AccountsPage,
                            ),
                          },
                          {
                            path: '/admin/settings/partners',
                            lazy: lazyPage(
                              () => import('@/features/dongtanpass/pages/PartnersPage'),
                              (m) => m.PartnersPage,
                            ),
                          },
                        ],
                      },
                      {
                        path: '/admin/passes/new',
                        lazy: lazyPage(
                          () => import('@/features/dongtanpass/pages/CampusPassIssuePage'),
                          (m) => m.CampusPassIssuePage,
                        ),
                      },
                      {
                        path: '/admin/passes/redemptions',
                        lazy: lazyPage(
                          () => import('@/features/dongtanpass/pages/PartnerRedemptionsPage'),
                          (m) => m.PartnerRedemptionsPage,
                        ),
                      },
                      {
                        path: '/admin/passes',
                        lazy: lazyPage(
                          () => import('@/features/dongtanpass/pages/CampusPassesPage'),
                          (m) => m.CampusPassesPage,
                        ),
                      },
                      {
                        path: '/admin/audit-logs',
                        lazy: lazyPage(
                          () => import('@/features/audit/pages/AuditLogsPage'),
                          (m) => m.AuditLogsPage,
                        ),
                      },
                      {
                        path: '/admin/ledger-sync',
                        lazy: lazyPage(
                          () => import('@/features/billing/pages/LedgerSyncPage'),
                          (m) => m.LedgerSyncPage,
                        ),
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
                lazy: lazyPage(
                  () => import('@/features/dongtanpass/pages/HolderRelinkPage'),
                  (m) => m.HolderRelinkPage,
                ),
              },
              {
                path: '/p/:token',
                lazy: lazyPage(
                  () => import('@/features/dongtanpass/pages/HolderPassPage'),
                  (m) => m.HolderPassPage,
                ),
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
