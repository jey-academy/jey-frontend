import { ButtonLink } from '@/shared/ui'

// 임시 홈. P3에서 프로토타입 메인 화면으로 바꾼다.
export function HomePage() {
  return (
    <main className="mx-auto max-w-[980px] px-6 py-[22px]">
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">JEY</h1>
      <p className="text-sub">화면 준비 중이에요.</p>
      {/* 이미 로그인했으면 로그인 화면이 역할의 첫 화면으로 보낸다. */}
      <ButtonLink to="/login" variant="ghost" size="sm" className="mt-4">
        직원 로그인
      </ButtonLink>
    </main>
  )
}
