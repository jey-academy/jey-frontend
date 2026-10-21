import { useEffect, useId, useRef, type ReactNode } from 'react'
import { formatDateTime } from '@/shared/lib'
import { redemptionInvoicePath, studentPath } from '@/shared/paths'
import { Button, ButtonLink } from '@/shared/ui'

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
}

type DeskDoneProps = DeskDoneSummary & { onNext: () => void }

/**
 * 데스크 처리 완료(DESIGN.md "Done", P3). 학생을 등록하고 패스를 사용 처리한 뒤 폼과 진행 카드 자리에 보여 준다.
 * 다음 할 일은 수강료 청구다(P4 수납). 청구는 다른 화면에서 만든다(사용 내역에서도 다시 들어갈 수 있다).
 */
export function DeskDone({
  studentId,
  studentName,
  className,
  passNo,
  redeemedAt,
  redemptionId,
  onNext,
}: DeskDoneProps) {
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  // 누른 버튼과 폼이 사라진다. 포커스를 제목으로 옮겨 끝났다는 것부터 읽게 한다.
  useEffect(() => titleRef.current?.focus(), [])

  return (
    <section
      aria-labelledby={titleId}
      className="mt-[22px] max-w-[560px] rounded-lg bg-card px-7 py-9 text-center"
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
        패스를 사용 처리했어요
      </h2>
      <p className="mt-1.5 text-sub">{studentName} 학생을 등록하고 패스를 사용 처리했어요.</p>

      <dl className="my-[22px] grid gap-2.5 rounded-md bg-field px-[18px] py-4 text-left text-[15px]">
        <Row label="학생">{studentName}</Row>
        <Row label="반">{className ?? '정하지 않음'}</Row>
        <Row label="패스">
          <span className="tracking-[0.04em]">{passNo}</span> 사용 완료
        </Row>
        <Row label="처리 시각">{formatDateTime(redeemedAt)}</Row>
      </dl>

      <ButtonLink block to={redemptionInvoicePath(redemptionId, studentId)}>
        수강료 청구 만들기
      </ButtonLink>
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

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-sub">{label}</dt>
      <dd className="text-right font-semibold tabular-nums">{children}</dd>
    </div>
  )
}
