import { cn } from '@/shared/lib/cn'
import { partnerLogos } from './partnerLogos'

type PartnerLogoProps = {
  partnerId: number
  /** 그림의 높이(px) */
  height: number
  className?: string
}

/**
 * 연계 학원의 로고. 감싼 링크가 학원 이름을 가지므로 그림은 읽히지 않는다(alt="").
 * 로고가 없는 학원이면 아무것도 그리지 않는다. 먼저 partnerLogoName으로 있는지 본다.
 */
export function PartnerLogo({ partnerId, height, className }: PartnerLogoProps) {
  const logo = partnerLogos[partnerId]
  if (!logo) return null
  return (
    <img
      src={logo.url}
      alt=""
      width={Math.round((logo.width * height) / logo.height)}
      height={height}
      className={cn('flex-none', className)}
    />
  )
}
