import { cn } from '@/shared/lib/cn'
import { Logo } from './Logo'
import { Pill } from './Pill'
import type { PassStatus } from './passStatus'

type PassCardProps = {
  status: PassStatus
  /** 할인 대상 (예: "JEY 어학원 동탄관 첫 달 수강료") */
  benefitLabel: string
  /**
   * 퍼센트로 적은 할인율 (예: "5%", "7.25%"). 서버의 비율을 `formatPercent`로 바꿔서 준다.
   * 비율에 100을 곱해 숫자로 넘기면 7.000000000000001 같은 오차가 보일 수 있어 글자로 받는다.
   */
  discount: string
  /** 서버가 가려서 준 학생 이름 (예: "김*윤") */
  holderName: string
  /** 패스 번호 (예: "DT-7KQ4MX") */
  passNumber: string
  /** 화면에 보여줄 사용 기한 (예: "2026.11.16") */
  expiresOn: string
  className?: string
}

// 아래 색은 DESIGN.md 2장 "컴포넌트 내부 상수"의 PassCard 값이다. 토큰이 아니라서 이 파일 안에만 둔다.
const pillColors: Record<PassStatus, string> = {
  valid: 'bg-[rgba(24,180,126,.18)] text-[#5BE3B1]',
  used: 'bg-white/12 text-[#C9D1DC]',
  expired: 'bg-[rgba(229,72,77,.2)] text-[#FF9A9D]',
  canceled: 'bg-white/12 text-[#C9D1DC]',
}
const offPercentColor = 'text-[#C9D1DC]'
const rippleAccent = 'rgba(255,212,92,.45)'
const rippleWhite = 'rgba(255,255,255,.11)'

const stampLabels: Record<Exclude<PassStatus, 'valid'>, string> = {
  used: '사용 완료',
  expired: '기간 만료',
  canceled: '발급 취소',
}

/**
 * 동탄고 패스 카드. 쓸 수 없는 패스(사용 완료·만료·발급 취소)는 따로 색을 만들지 않고
 * 같은 카드의 채도를 낮춘 뒤 도장을 찍는다.
 * 아래에 `QrView`를 겹쳐 붙이려고 카드를 한 층 위(z-index 1)에 둔다.
 */
export function PassCard({
  status,
  benefitLabel,
  discount,
  holderName,
  passNumber,
  expiresOn,
  className,
}: PassCardProps) {
  const usable = status === 'valid'

  return (
    <article
      aria-label="동탄고패스 카드"
      className={cn(
        'relative isolate z-[1] flex aspect-[1/1.06] flex-col overflow-hidden rounded-pass px-[26px] pt-[26px] pb-6 text-white shadow-pass',
        'bg-[radial-gradient(120%_80%_at_100%_100%,var(--color-night-2)_0%,var(--color-night)_60%)]',
        'motion-safe:animate-[lift_0.7s_cubic-bezier(0.2,0.8,0.2,1)_both]',
        !usable && 'saturate-[.15]',
        className,
      )}
    >
      <svg
        viewBox="0 0 420 420"
        aria-hidden="true"
        className="absolute -right-[170px] -bottom-[170px] -z-1 size-[420px]"
      >
        <circle cx="210" cy="210" r="70" fill="none" stroke={rippleAccent} strokeWidth="2" />
        <g fill="none" stroke={rippleWhite} strokeWidth="1.5">
          <circle cx="210" cy="210" r="110" />
          <circle cx="210" cy="210" r="150" />
          <circle cx="210" cy="210" r="190" />
        </g>
      </svg>

      <div className="flex items-center justify-between">
        <Logo label="동탄고패스" tone="white" className="text-[19px]" />
        <Pill status={status} colorClassName={pillColors[status]} />
      </div>

      {/* 상태는 Pill이 이미 읽어 주므로 도장은 화면 낭독기에서 뺀다. */}
      {!usable && (
        <div
          aria-hidden="true"
          className="absolute top-[92px] right-[22px] -rotate-12 rounded-btn border-[3px] border-white/75 px-3.5 py-2 text-[20px] font-extrabold tracking-[0.02em] text-white/90"
        >
          {stampLabels[status]}
        </div>
      )}

      <div className="mt-auto">
        <div className="text-[15px] font-medium text-white/75">{benefitLabel}</div>
        <div
          className={cn(
            'mt-1.5 mb-0.5 text-[88px] leading-[0.95] font-extrabold tracking-[-0.05em] tabular-nums max-[560px]:text-[76px]',
            usable ? 'text-glow' : offPercentColor,
          )}
        >
          {discount}
          <small className="ml-1.5 text-[30px] font-bold tracking-[-0.02em] text-white">할인</small>
        </div>
      </div>

      <div className="mt-[26px] flex items-end justify-between border-t border-white/14 pt-[18px]">
        <div>
          <div className="text-[20px] font-bold">{holderName}</div>
          <div className="mt-0.5 text-[14px] tracking-[0.06em] text-white/65 tabular-nums">
            {passNumber}
          </div>
        </div>
        <div className="text-right text-[13px] text-white/65 tabular-nums">
          사용 기한
          <b className="block text-[16px] font-semibold text-white">{expiresOn}</b>
        </div>
      </div>
    </article>
  )
}
