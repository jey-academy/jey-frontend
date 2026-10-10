import { Link, Outlet } from 'react-router'
import { Logo, NavTabs, type NavTabItem } from '@/shared/ui'

// 수납 탭은 수납 화면이 생기는 P4에서 추가한다.
const tabs: NavTabItem[] = [
  { to: '/desk/gopass', label: '패스 확인' },
  { to: '/partner/passes/new', label: '패스 발급' },
  { to: '/partner/passes', label: '패스 목록', end: true },
]

/** 직원·원장·연계 학원 화면의 틀. 위에 붙어 있는 상단 바(로고 + 탭)와 넓은 본문. */
export function StaffLayout() {
  return (
    <>
      <header className="sticky top-0 z-5 border-b border-line bg-card">
        <div className="mx-auto flex max-w-[1080px] items-center gap-5 px-6 py-3 max-[560px]:flex-wrap max-[560px]:gap-2 max-[560px]:px-3 max-[560px]:py-2.5">
          <Link to="/" className="no-underline">
            <Logo label="JEY" markSize={22} hideLabelOnMobile className="text-[18px]" />
          </Link>
          <NavTabs label="직원 메뉴" items={tabs} className="ml-2 max-[560px]:ml-0" />
          <Link
            to="/"
            className="relative ml-auto text-[14px] font-semibold whitespace-nowrap text-sub no-underline after:absolute after:-inset-3 after:content-[''] hover:text-ink"
          >
            나가기
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[1080px] px-6 pt-7 pb-16 max-[560px]:px-4">
        <Outlet />
      </main>
    </>
  )
}
