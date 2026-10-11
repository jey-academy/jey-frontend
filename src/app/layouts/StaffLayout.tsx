import { Link, Outlet } from 'react-router'
import { DESK_ROLES, PARTNER_ROLES, useLogout, useMe, type Role } from '@/shared/auth'
import { Button, Logo, NavTabs, Notice, type NavTabItem } from '@/shared/ui'

// 수납 탭은 수납 화면이 생기는 P4에서 추가한다.
const tabs: (NavTabItem & { roles: Role[] })[] = [
  { to: '/desk/dongtanpass', label: '패스 확인', roles: DESK_ROLES },
  { to: '/partner/passes/new', label: '패스 발급', roles: PARTNER_ROLES },
  { to: '/partner/passes', label: '패스 목록', end: true, roles: PARTNER_ROLES },
]

/**
 * 직원·원장·연계 학원 화면의 틀. 위에 붙어 있는 상단 바(로고 + 탭)와 넓은 본문.
 * 로그인 가드(RequireRole) 안에서만 그려진다. 탭은 로그인한 역할이 볼 수 있는 것만 보여준다.
 */
export function StaffLayout() {
  const { data: me } = useMe()
  // 로그아웃에 성공하면 로그인 상태가 비워지고, 가드(RequireRole)가 로그인 화면으로 보낸다.
  const logout = useLogout()
  const visibleTabs = tabs.filter((tab) => me && tab.roles.includes(me.role))

  return (
    <>
      <header className="sticky top-0 z-5 border-b border-line bg-card">
        <div className="mx-auto flex max-w-[1080px] items-center gap-5 px-6 py-3 max-[560px]:flex-wrap max-[560px]:gap-2 max-[560px]:px-3 max-[560px]:py-2.5">
          {/* ::after로 터치 영역을 44px 이상으로 넓힌다. */}
          <Link
            to="/"
            className="relative no-underline after:absolute after:-inset-3 after:content-['']"
          >
            <Logo label="JEY" markSize={22} hideLabelOnMobile className="text-[18px]" />
          </Link>
          <NavTabs label="직원 메뉴" items={visibleTabs} className="ml-2 max-[560px]:ml-0" />
          <div className="ml-auto flex items-center gap-3">
            {me && (
              <span className="text-[14px] font-semibold whitespace-nowrap text-sub">
                {me.name}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              로그아웃
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1080px] px-6 pt-7 pb-16 max-[560px]:px-4">
        {/* 로그아웃된 줄 알고 자리를 뜨면 안 된다. 실패는 눈에 띄게 알린다. */}
        {logout.isError && (
          <Notice className="mb-5">
            로그아웃하지 못했어요. 아직 로그인된 상태예요. 다시 시도해 주세요.
          </Notice>
        )}
        <Outlet />
      </main>
    </>
  )
}
