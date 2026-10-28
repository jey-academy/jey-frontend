import { Link, Outlet } from 'react-router'
import { Logo } from '@/shared/ui'

/** 학부모·학생 화면의 틀. 휴대폰 폭에 맞춘 좁은 한 줄 배치에 상단 로고만 둔다. */
export function GuardianLayout() {
  return (
    <div className="mx-auto max-w-[440px] px-5 pt-5 pb-12">
      <header className="mb-[18px] flex items-center justify-between">
        {/* ::after로 터치 영역을 44px 이상으로 넓힌다. */}
        <Link
          to="/"
          className="relative no-underline after:absolute after:-inset-3 after:content-['']"
        >
          <Logo label="제이G패스" markSize={22} className="text-[17px]" />
        </Link>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
