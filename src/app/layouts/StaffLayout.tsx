import { useEffect, useRef } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { supportRequestId } from '@/shared/api'
import { ADMIN_ROLES, DESK_ROLES, PARTNER_ROLES, useLogout, useMe, type Role } from '@/shared/auth'
import { Logo, NavTabs, Notice, type NavTabItem } from '@/shared/ui'
import { AccountMenu } from './AccountMenu'

// 수납 탭은 수납 화면이 생기는 P4에서 추가한다.
const tabs: (NavTabItem & { roles: Role[] })[] = [
  { to: '/desk/dongtanpass', label: '패스 확인', end: true, roles: DESK_ROLES },
  { to: '/desk/dongtanpass/redemptions', label: '패스 사용 내역', roles: DESK_ROLES },
  { to: '/desk/students', label: '학생', roles: DESK_ROLES },
  { to: '/partner/passes/new', label: '패스 발급', roles: PARTNER_ROLES },
  { to: '/partner/passes', label: '패스 목록', end: true, roles: PARTNER_ROLES },
  { to: '/admin/audit-logs', label: '기록', roles: ADMIN_ROLES },
  { to: '/admin/settings', label: '설정', roles: ADMIN_ROLES },
]

/**
 * 직원·원장·연계 학원 화면의 틀. 위에 붙어 있는 상단 바(로고 + 탭)와 넓은 본문.
 * 로그인 가드(RequireRole) 안에서만 그려진다. 탭은 로그인한 역할이 볼 수 있는 것만 보여준다.
 * 좁은 화면(560px 이하)에서도 상단 바는 한 줄이다. 내 계정 묶음은 이름 버튼 하나로 접고(AccountMenu),
 * 탭이 넘치면(관리자는 4개) 탭 줄만 가로로 밀린다.
 */
export function StaffLayout() {
  const { data: me } = useMe()
  // 로그아웃에 성공하면 로그인 상태가 비워지고, 가드(RequireRole)가 로그인 화면으로 보낸다.
  const logout = useLogout()
  const visibleTabs = tabs.filter((tab) => me && tab.roles.includes(me.role))
  const tabsRef = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  // 탭 줄이 가로로 밀리는 좁은 화면에서, 지금 화면의 탭이 밖에 있으면 보이는 곳으로 끌어온다.
  // 탭 줄 안에서만 민다. scrollIntoView는 페이지 전체를 세로로 움직일 수 있어 쓰지 않는다.
  useEffect(() => {
    const nav = tabsRef.current?.querySelector('nav')
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !current) return
    const left = current.offsetLeft - nav.offsetLeft
    if (left < nav.scrollLeft || left + current.offsetWidth > nav.scrollLeft + nav.clientWidth) {
      nav.scrollLeft = left - (nav.clientWidth - current.offsetWidth) / 2
    }
  }, [pathname])

  return (
    <>
      <header className="sticky top-0 z-5 border-b border-line bg-card">
        <div className="mx-auto flex max-w-[1080px] items-center gap-5 px-6 py-3 max-[560px]:gap-2 max-[560px]:px-3 max-[560px]:py-2.5">
          {/* ::after로 터치 영역을 44px 이상으로 넓힌다. */}
          <Link
            to="/"
            className="relative no-underline after:absolute after:-inset-3 after:content-['']"
          >
            <Logo label="JEY" markSize={22} hideLabelOnMobile className="text-[18px]" />
          </Link>
          {/* min-w-0: 탭 줄이 남은 폭만 차지하고, 넘치는 탭은 그 안에서 가로로 밀린다(관리자 탭은 750px 안팎부터 넘친다).
              스크롤바는 숨긴다. 자리를 차지하는 Windows 스크롤바가 상단 바를 높이고, 지금 탭은 위 효과가 보이게 끌어온다.
              스크롤 상자 밖은 잘리므로 포커스 링은 탭 안쪽에 그린다. */}
          <div ref={tabsRef} className="ml-2 min-w-0 max-[560px]:ml-0">
            <NavTabs
              label="직원 메뉴"
              items={visibleTabs}
              className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_a:focus-visible]:outline-offset-[-3px]"
            />
          </div>
          <AccountMenu
            name={me?.name}
            onLogout={() => logout.mutate()}
            loggingOut={logout.isPending}
          />
        </div>
      </header>
      <main className="mx-auto max-w-[1080px] px-6 pt-7 pb-16 max-[560px]:px-4">
        {/* 로그아웃된 줄 알고 자리를 뜨면 안 된다. 실패는 눈에 띄게 알린다. */}
        {logout.isError && (
          <Notice className="mb-5" requestId={supportRequestId(logout.error)}>
            로그아웃하지 못했어요. 아직 로그인된 상태예요. 다시 시도해 주세요.
          </Notice>
        )}
        <Outlet />
      </main>
    </>
  )
}
