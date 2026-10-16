import { cn } from '@/shared/lib/cn'

type LogoMarkProps = {
  /** 한 변의 길이(px) */
  size?: number
  className?: string
}

/** 동심원 모양의 마크. 장식이라 스크린 리더에는 읽히지 않는다. */
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

type LogoProps = {
  /** 마크 옆에 쓰는 이름 */
  label: string
  markSize?: number
  /** 좁은 화면에서 이름을 숨기고 마크만 보여준다. 스크린 리더에는 이름이 계속 읽힌다. */
  hideLabelOnMobile?: boolean
  /** `white`는 패스 카드처럼 어두운 바탕 위에서 쓴다. */
  tone?: 'night' | 'white'
  className?: string
}

/** 마크 + 이름. 글자 크기와 색은 className으로 정한다. */
export function Logo({
  label,
  markSize,
  hideLabelOnMobile = false,
  tone = 'night',
  className,
}: LogoProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-extrabold tracking-[-0.03em]',
        tone === 'white' ? 'text-white' : 'text-night',
        className,
      )}
    >
      <LogoMark size={markSize} />
      <span className={cn(hideLabelOnMobile && 'max-[560px]:sr-only')}>{label}</span>
    </span>
  )
}
