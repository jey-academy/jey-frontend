import { useEffect, useId, useRef, type ReactNode } from 'react'
import { formatDateTime, formatPercent, formatWon } from '@/shared/lib'
import { Button } from '@/shared/ui'
import type { PartnerDoneSummary } from './PartnerRedeemFlow'

type PartnerDoneProps = PartnerDoneSummary & { onNext: () => void }

/**
 * 연계 학원의 사용 처리 완료. 학원이 이 금액으로 결제받으므로 받을 금액을 가장 크게 보여 준다.
 * 금액은 서버가 계산한 값 그대로다.
 */
export function PartnerDone({ studentName, passNo, result, onNext }: PartnerDoneProps) {
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  // 누른 버튼과 폼이 사라진다. 포커스를 제목으로 옮겨 끝났다는 것부터 읽게 한다.
  useEffect(() => titleRef.current?.focus(), [])

  return (
    <section
      aria-labelledby={titleId}
      className="mt-[22px] max-w-[560px] rounded-lg bg-card px-7 py-9 text-center"
    >
      <h2
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        className="text-[22px] font-bold tracking-[-0.03em] text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        패스를 사용 처리했어요
      </h2>
      <p className="mt-1.5 text-sub">이 금액으로 결제받아 주세요.</p>

      <p className="mt-6 text-[14px] font-semibold text-sub">받을 금액</p>
      <p className="mt-1 text-[40px] leading-tight font-extrabold tracking-[-0.03em] text-night tabular-nums">
        {formatWon(result.payableAmount)}
      </p>

      <dl className="my-[22px] grid gap-2.5 rounded-md bg-field px-[18px] py-4 text-left text-[15px]">
        <Row label="원래 수강료">{formatWon(result.originalFee)}</Row>
        <Row label={`할인 ${formatPercent(result.discountRate)}`}>
          {`- ${formatWon(result.discountAmount)}`}
        </Row>
        <Row label="학생">{studentName}</Row>
        <Row label="패스">
          <span className="tracking-[0.04em]">{passNo}</span> 사용 완료
        </Row>
        <Row label="처리 시각">{formatDateTime(result.redeemedAt)}</Row>
      </dl>

      <Button block onClick={onNext}>
        다음 패스 확인하기
      </Button>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-sub">{label}</dt>
      <dd className="text-right font-semibold tabular-nums">{children}</dd>
    </div>
  )
}
