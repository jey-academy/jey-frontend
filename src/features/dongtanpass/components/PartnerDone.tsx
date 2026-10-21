import { useEffect, useId, useRef } from 'react'
import { formatDateTime, formatPercent, formatWon } from '@/shared/lib'
import { Button, SummaryList } from '@/shared/ui'
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

      <SummaryList
        className="my-[22px]"
        items={[
          { label: '원래 수강료', value: formatWon(result.originalFee) },
          {
            label: `할인 ${formatPercent(result.discountRate)}`,
            value: `- ${formatWon(result.discountAmount)}`,
          },
          { label: '학생', value: studentName },
          {
            label: '패스',
            value: (
              <>
                <span className="tracking-[0.04em]">{passNo}</span> 사용 완료
              </>
            ),
          },
          { label: '처리 시각', value: formatDateTime(result.redeemedAt) },
        ]}
      />

      <Button block onClick={onNext}>
        다음 패스 확인하기
      </Button>
    </section>
  )
}
