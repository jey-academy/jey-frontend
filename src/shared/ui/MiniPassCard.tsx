import { cn } from '@/shared/lib/cn'
import { Logo } from './Logo'

type MiniPassCardProps = {
  /**
   * `front`는 앞에 놓는 카드(강조 링 + 문구), `back`은 뒤에 겹치는 카드(한 톤 밝은 바탕, 흰 링만).
   * 두 장을 엇갈려 겹쳐 쓴다.
   */
  layer?: 'front' | 'back'
  /** 앞 카드 아래쪽의 큰 노란 글자 (예: "첫 달 할인"). 뒤 카드에는 쓰지 않는다. */
  caption?: string
  className?: string
}

// 아래 색은 DESIGN.md 2장 "컴포넌트 내부 상수"의 메인 미니 카드 값이다. 토큰이 아니라서 이 파일 안에만 둔다.
const backBackground =
  'bg-[radial-gradient(120%_90%_at_100%_100%,#2A4F86_0%,var(--color-night-2)_62%)]'
const rippleAccent = 'rgba(255,212,92,.5)'
const rippleWhite = 'rgba(255,255,255,.12)'

/**
 * 메인 화면의 작은 패스 카드 그림. 실제 패스가 아니라 장식이라 스크린 리더에는 읽히지 않는다.
 * 할인율은 패스마다 서버가 정하므로 숫자를 넣지 않는다.
 * 카드는 감싼 칸의 폭을 꽉 채운다. 위치와 기울기는 쓰는 쪽이 감싸는 요소로 정한다.
 * (카드 자신이 relative라서 className으로 absolute를 주면 부딪친다. cn은 클래스를 합치지 않고 이어 붙이기만 한다.)
 */
export function MiniPassCard({ layer = 'front', caption, className }: MiniPassCardProps) {
  const front = layer === 'front'

  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative isolate aspect-[1.58] w-full overflow-hidden rounded-[22px] px-[22px] py-5 text-white shadow-mini',
        front
          ? 'bg-[radial-gradient(120%_90%_at_100%_100%,var(--color-night-2)_0%,var(--color-night)_62%)]'
          : backBackground,
        className,
      )}
    >
      <svg
        viewBox="0 0 260 260"
        className="absolute -right-[110px] -bottom-[110px] -z-1 size-[260px]"
      >
        {front ? (
          <>
            <circle cx="130" cy="130" r="40" fill="none" stroke={rippleAccent} strokeWidth="2" />
            <g fill="none" stroke={rippleWhite} strokeWidth="1.5">
              <circle cx="130" cy="130" r="75" />
              <circle cx="130" cy="130" r="110" />
            </g>
          </>
        ) : (
          <g fill="none" stroke={rippleWhite} strokeWidth="1.5">
            <circle cx="130" cy="130" r="60" />
            <circle cx="130" cy="130" r="95" />
            <circle cx="130" cy="130" r="128" />
          </g>
        )}
      </svg>
      <Logo label="동탄고 패스" tone="white" markSize={18} className="text-[15px]" />
      {front && caption && (
        <p className="absolute bottom-[18px] left-[22px] text-[32px] leading-[1.05] font-extrabold tracking-[-0.045em] text-glow">
          {caption}
        </p>
      )}
    </div>
  )
}
