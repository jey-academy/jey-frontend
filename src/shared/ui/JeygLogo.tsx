import { cn } from '@/shared/lib/cn'
import verticalUrl from './assets/jeyg-logo-vertical.svg'

// 그림(SVG viewBox)의 가로·세로. 높이만 받아 폭을 이 비율로 정한다.
const VERTICAL = { width: 1500, height: 1650 }

type JeygLogoProps = {
  /** 그림 전체의 높이(px). 원본의 여백(위 약 6%, 아래 약 14%)이 들어 있다 */
  height: number
  className?: string
}

/**
 * 제이G 로고 세로형(심볼 + "제이지러닝" + "JGlearning" + 문구). 로그인 화면처럼 크게 보일 때 쓴다.
 * 사용 규칙이 원본의 모양·비율·글자·색을 바꾸지 않는 것이라 그림을 그대로 쓴다.
 * 패스의 작은 마크는 Logo, 직원 상단 바의 학원 로고는 JeyLogo다.
 */
export function JeygLogo({ height, className }: JeygLogoProps) {
  return (
    <img
      src={verticalUrl}
      alt="제이지러닝"
      width={Math.round((VERTICAL.width * height) / VERTICAL.height)}
      height={height}
      className={cn('flex-none', className)}
    />
  )
}
