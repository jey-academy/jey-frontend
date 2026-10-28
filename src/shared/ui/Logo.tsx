import { cn } from '@/shared/lib/cn'
import jeygMarkUrl from './assets/jeyg-mark.svg'

type LogoMarkProps = {
  /** 한 변의 길이(px) */
  size?: number
  className?: string
}

/** 동심원 모양의 장식 마크(빈 화면 등). 장식이라 스크린 리더에는 읽히지 않는다. */
export function LogoMark({ size = 22, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn('flex-none', className)}
    >
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}

// 로고 SVG의 viewBox(1200×1100)와 확대 배율. 원본 그대로 쓰므로 그림 위아래에 여백(합쳐 약 19%)이 남는다.
// 1.2배로 그리면 눈에 보이는 높이가 size와 거의 같다.
const JEYG_MARK = { width: 1200, height: 1100, scale: 1.2 }

type JeygMarkProps = {
  /** 눈에 보이는 마크의 대략적인 높이(px) */
  size: number
  tone: 'night' | 'white'
}

/**
 * 제이G 로고(심볼). 원본의 형태·색을 바꾸지 않는 것이 사용 규칙이라 밝은 바탕에서는 그림을 그대로 쓴다
 * (tone이 night여도 마크는 원본 색 #111111, 글자만 night).
 * 어두운 바탕에서는 투명 원본의 모양을 오려 reverse의 로고 색(#FFFFFF)으로 칠한다.
 * reverse 원본은 검정 바탕까지 그려져 있어 카드 위에 검은 네모가 생기므로 쓰지 않는다. 장식이라 읽히지 않는다.
 */
function JeygMark({ size, tone }: JeygMarkProps) {
  const height = Math.round(size * JEYG_MARK.scale)
  const width = Math.round((JEYG_MARK.width * height) / JEYG_MARK.height)
  if (tone === 'night') {
    return <img src={jeygMarkUrl} alt="" width={width} height={height} className="flex-none" />
  }
  const mask = `url("${jeygMarkUrl}")`
  return (
    <span
      aria-hidden="true"
      className="inline-block flex-none bg-white"
      style={{
        width,
        height,
        WebkitMaskImage: mask,
        maskImage: mask,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        // 고대비(강제 색상) 모드는 바탕색을 시스템 색으로 바꿔, 마스크로 칠한 로고가 주변과 같은 색이 되어 사라진다. 흰색을 그대로 둔다.
        forcedColorAdjust: 'none',
      }}
    />
  )
}

type LogoProps = {
  /** 마크 옆에 쓰는 이름 */
  label: string
  /** 눈에 보이는 마크의 대략적인 높이(px). 기본 22. 그리는 요소는 여백 때문에 1.2배다 */
  markSize?: number
  /** `white`는 패스 카드처럼 어두운 바탕 위에서 쓴다. */
  tone?: 'night' | 'white'
  className?: string
}

/**
 * 제이G패스의 마크(제이G 로고) + 이름. 글자 크기와 색은 className으로 정한다.
 * 학원(JEY) 로고는 이것이 아니라 JeyLogo다.
 */
export function Logo({ label, markSize = 22, tone = 'night', className }: LogoProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-extrabold tracking-[-0.03em]',
        tone === 'white' ? 'text-white' : 'text-night',
        className,
      )}
    >
      <JeygMark size={markSize} tone={tone} />
      <span>{label}</span>
    </span>
  )
}
