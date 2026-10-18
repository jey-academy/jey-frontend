import { ChoiceCard, Logo, MiniPassCard } from '@/shared/ui'

/**
 * 메인(`/`). 주로 패스를 받은 학부모·학생이 들어온다.
 * 패스는 연계 학원과 JEY 어학원이 서로 발급하므로(양방향) 문구에 학원 한쪽이나 할인율 숫자를 박지 않는다.
 * 로그인한 직원도 자동으로 옮기지 않는다. "학원 직원 로그인"을 누르면 로그인 화면이 역할의 첫 화면으로 보낸다.
 */
export function HomePage() {
  return (
    <div className="mx-auto max-w-[980px] px-6 pt-[22px] pb-14 max-[560px]:px-4 max-[560px]:pb-10">
      <header>
        <Logo label="동탄고 패스" className="text-[20px]" />
      </header>

      <main>
        <section className="grid items-center gap-10 pt-14 pb-10 max-[861px]:gap-6 max-[861px]:pt-8 max-[861px]:pb-6 min-[861px]:grid-cols-[1.1fr_0.9fr]">
          <div>
            {/* <br /> 앞의 공백은 지우지 않는다. 없으면 스크린 리더가 "첫 달,할인으로"처럼 붙여 읽는다. */}
            <h1 className="text-[44px] leading-[1.18] font-extrabold tracking-[-0.045em] max-[861px]:text-[34px] max-[861px]:leading-[1.24]">
              새 학원 첫 달, <br />
              할인으로 시작해요
            </h1>
            <p className="mt-4 max-w-[30em] text-[18px] text-sub max-[861px]:mt-3 max-[861px]:text-[17px]">
              동탄 연계 학원과 JEY 어학원이 서로 주는 할인 패스예요.
            </p>
          </div>
          <PassCardStack />
        </section>

        <nav
          aria-label="들어갈 화면"
          className="grid gap-4 max-[861px]:gap-3 min-[861px]:grid-cols-2"
        >
          <ChoiceCard
            to="/find"
            tone="glow"
            title="패스 링크 다시 받기"
            description="학부모·학생. 학생 이름과 학부모 번호로 새 링크를 받아요"
            icon={<LinkIcon />}
          />
          <ChoiceCard
            to="/login"
            tone="night"
            title="학원 직원 로그인"
            description="패스 발급과 확인"
            icon={<LockIcon />}
          />
        </nav>

        <p className="mt-7 text-center text-[14px] text-sub max-[560px]:text-[13px]">
          JEY 어학원과 동탄 연계 학원이 함께 운영해요
        </p>
      </main>
    </div>
  )
}

// 엇갈려 겹친 카드 두 장(DESIGN.md 메인 Hero). 휴대폰에서는 높이와 카드 폭을 줄여 선택 카드가 첫 화면에 더 보이게 한다.
function PassCardStack() {
  return (
    <div className="relative h-[300px] max-[861px]:mx-auto max-[861px]:h-[230px] max-[861px]:w-full max-[861px]:max-w-[400px] motion-safe:animate-[lift_0.7s_cubic-bezier(0.2,0.8,0.2,1)_both]">
      {/* 위치·기울기는 감싸는 칸이 정한다(카드 자신은 relative라서 바깥 position을 받지 않는다).
          휴대폰 폭은 260px이되, 칸이 328px보다 좁으면(360px 미만 화면) 뒤 카드가 왼쪽으로 잘리지 않게 칸에 맞춰 줄인다. */}
      <div className="absolute top-[90px] right-[70px] w-[300px] -rotate-5 max-[861px]:top-[72px] max-[861px]:right-[52px] max-[861px]:w-[min(260px,calc(100%_-_68px))]">
        <MiniPassCard layer="back" />
      </div>
      <div className="absolute top-2.5 right-2.5 w-[300px] rotate-6 max-[861px]:top-2 max-[861px]:right-1 max-[861px]:w-[min(260px,calc(100%_-_68px))]">
        <MiniPassCard layer="front" caption="첫 달 할인" />
      </div>
    </div>
  )
}

function LinkIcon() {
  return (
    <svg
      aria-hidden="true"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 14a4 4 0 0 1 0-5.66l3-3a4 4 0 0 1 5.66 5.66l-1.5 1.5" />
      <path d="M14 10a4 4 0 0 1 0 5.66l-3 3a4 4 0 0 1-5.66-5.66l1.5-1.5" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
