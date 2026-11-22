import { useEffect, useId, useRef } from 'react'
import { formatMonth } from '@/features/billing/invoiceInput'
import { PAYMENT_METHOD_LABELS } from '@/features/billing/invoiceView'
import type { PaymentMethod } from '@/features/billing/api'
import { formatDateTime, formatWon } from '@/shared/lib'
import { invoicePath, redemptionInvoicePath, studentPath } from '@/shared/paths'
import { Button, ButtonLink, SummaryList } from '@/shared/ui'

/** 완료 화면에 보여 줄 것. 학부모 번호는 없다. */
export type DeskDoneSummary = {
  studentId: number
  studentName: string
  /** 반 이름. 정하지 않았으면 null */
  className: string | null
  passNo: string
  /** 사용 처리한 시각(서버 값) */
  redeemedAt: string
  /** 사용 기록 ID. 이 기록에서 수강료 청구를 만든다. */
  redemptionId: number
  /** 같은 화면에서 만든 청구(#228). 수강료 칸을 비워 청구하지 않았으면 null이다. */
  invoice: DeskDoneInvoice | null
}

export type DeskDoneInvoice = {
  invoiceId: number
  /** `2026-11` */
  targetMonth: string
  /** 청구 합계(서버 값) */
  totalAmount: number
  /** 같은 화면에서 기록한 결제의 수단. 결제를 나중에 받으면 null이다. */
  paidWith: PaymentMethod | null
}

type DeskDoneProps = DeskDoneSummary & { onNext: () => void }

/**
 * 데스크 처리 완료(DESIGN.md "Done", P3). 학생을 등록하고 패스를 사용 처리한 뒤 폼과 진행 카드 자리에 보여 준다.
 * 다음 할 일은 수강료 청구다(P4 수납). 그래서 DESIGN.md의 버튼 둘 위에 "수강료 청구 만들기"를 주 버튼으로 더했다
 * (DESIGN.md 갱신은 백엔드에 요청). 청구는 다른 화면에서 만들고, 사용 내역에서도 다시 들어갈 수 있다.
 */
export function DeskDone({
  studentId,
  studentName,
  className,
  passNo,
  redeemedAt,
  redemptionId,
  invoice,
  onNext,
}: DeskDoneProps) {
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  // 누른 버튼과 폼이 사라진다. 포커스를 제목으로 옮겨 끝났다는 것부터 읽게 한다.
  useEffect(() => titleRef.current?.focus(), [])

  return (
    <section
      aria-labelledby={titleId}
      className="mx-auto mt-[22px] max-w-[560px] rounded-lg bg-card px-7 py-9 text-center"
    >
      <span
        aria-hidden="true"
        className="mx-auto mb-[18px] grid size-[72px] place-items-center rounded-full bg-mint text-white motion-safe:animate-[pop_0.45s_cubic-bezier(0.2,1.4,0.4,1)_both]"
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <h2
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        className="text-[24px] font-bold tracking-[-0.03em] text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {invoice?.paidWith
          ? '결제까지 기록했어요'
          : invoice
            ? '청구까지 만들었어요'
            : '패스를 사용 처리했어요'}
      </h2>
      <p className="mt-1.5 text-sub">
        {invoice?.paidWith
          ? `${studentName} 학생을 등록하고 패스 사용, 청구, 결제 기록까지 마쳤어요. 장부에는 자동으로 적혀요.`
          : invoice
            ? `${studentName} 학생을 등록하고 패스 사용, 청구까지 마쳤어요. 결제는 청구 상세에서 기록해요.`
            : `${studentName} 학생을 등록하고 패스를 사용 처리했어요.`}
      </p>

      <SummaryList
        className="my-[22px]"
        items={[
          { label: '학생', value: studentName },
          { label: '반', value: className ?? '정하지 않음' },
          {
            label: '패스',
            value: (
              <>
                <span className="tracking-[0.04em]">{passNo}</span> 사용 완료
              </>
            ),
          },
          { label: '처리 시각', value: formatDateTime(redeemedAt) },
          ...(invoice
            ? [
                {
                  label: '청구',
                  value: `${formatMonth(invoice.targetMonth)} ${formatWon(invoice.totalAmount)}`,
                },
                {
                  label: '결제',
                  value: invoice.paidWith
                    ? `${PAYMENT_METHOD_LABELS[invoice.paidWith]} 기록함`
                    : '아직 안 받음',
                },
              ]
            : []),
        ]}
      />

      {invoice ? (
        <ButtonLink
          block
          variant={invoice.paidWith ? 'ghost' : 'primary'}
          to={invoicePath(invoice.invoiceId)}
        >
          {invoice.paidWith ? '청구 보기' : '청구 보고 결제 기록하기'}
        </ButtonLink>
      ) : (
        <ButtonLink block to={redemptionInvoicePath(redemptionId)}>
          수강료 청구 만들기
        </ButtonLink>
      )}
      <div className="mt-2.5 flex gap-2.5 max-[400px]:flex-col [&>*]:flex-1">
        <ButtonLink variant="ghost" to={studentPath(studentId)}>
          학생 정보 보기
        </ButtonLink>
        <Button variant="ghost" onClick={onNext}>
          다음 패스 확인하기
        </Button>
      </div>
    </section>
  )
}
