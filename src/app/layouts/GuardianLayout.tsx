import { Link, Outlet } from 'react-router'
import { Logo } from '@/shared/ui'

/** 학부모·학생 화면의 틀. 휴대폰 폭에 맞춘 좁은 한 줄 배치에 상단 로고만 둔다. */
export function GuardianLayout() {
  return (
    <div className="mx-auto max-w-[440px] px-5 pt-5 pb-12">
      <header className="mb-[18px] flex items-center justify-between">
        <Link to="/" className="no-underline">
          <Logo label="동탄고패스" markSize={22} className="text-[17px]" />
        </Link>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
