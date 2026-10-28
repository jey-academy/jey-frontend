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

// 로고 SVG의 가로·세로. 그림 둘레에 8% 안팎의 여백이 있어(원본 그대로 쓴다) 받은 크기보다 조금 크게 그린다.
const JEYG_MARK = { width: 1200, height: 1100, scale: 1.2 }

type JeygMarkProps = {
  /** 눈에 보이는 마크의 대략적인 높이(px) */
  size: number
  tone: 'night' | 'white'
}

/**
 * 제이G 로고(심볼). 원본의 형태·색을 바꾸지 않는 것이 사용 규칙이라 밝은 바탕에서는 그림을 그대로 쓴다.
 * 어두운 바탕에서는 원본의 흰 로고(reverse)와 같은 색으로, 모양만 오려 흰색으로 칠한다. 장식이라 읽히지 않는다.
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
        // 고대비 모드는 바탕색을 지워 마스크로 칠한 로고가 사라진다. 로고 색을 그대로 둔다.
        forcedColorAdjust: 'none',
      }}
    />
  )
}

type LogoProps = {
  /** 마크 옆에 쓰는 이름 */
  label: string
  /** 마크의 높이(px) */
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
