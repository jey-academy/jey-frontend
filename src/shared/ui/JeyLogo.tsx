import { cn } from '@/shared/lib/cn'
import logoUrl from './assets/jey-logo.png'
import logoTaglineUrl from './assets/jey-logo-tagline.png'
import markUrl from './assets/jey-mark.png'

// 그림의 가로·세로(px). 높이만 받아 폭을 이 비율로 정한다.
const shapes = {
  /** 말풍선 + JEY 마크만. 좁은 화면의 상단 바 */
  mark: { url: markUrl, width: 158, height: 191 },
  /** 마크 + "JEY어학원" */
  logo: { url: logoUrl, width: 733, height: 191 },
  /** 마크 + "JEY어학원" + "바른영어". 크게 그릴 때(로그인) */
  tagline: { url: logoTaglineUrl, width: 733, height: 191 },
}

type JeyLogoProps = {
  variant: keyof typeof shapes
  /** 그림 전체의 높이(px) */
  height: number
  /** 감싼 링크 등이 이미 "JEY어학원"이라는 이름을 갖고 있으면 켠다. 그림은 화면 낭독기에 읽히지 않는다. */
  decorative?: boolean
  className?: string
}

/**
 * 학원 로고. 받은 로고 그림의 모양을 그대로 오려 낸 PNG를 마스크로 쓰고, 색은 토큰(`logo`)으로 칠한다.
 * 학원 이름을 그린 그림이라 화면 낭독기에는 "JEY어학원"으로 읽힌다. 제이G패스의 동심원 마크(Logo)와는 다른 것이다.
 */
export function JeyLogo({ variant, height, decorative = false, className }: JeyLogoProps) {
  const shape = shapes[variant]
  const mask = `url("${shape.url}")`
  return (
    <span
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'JEY어학원' })}
      className={cn('inline-block flex-none bg-logo', className)}
      style={{
        width: Math.round((shape.width * height) / shape.height),
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
