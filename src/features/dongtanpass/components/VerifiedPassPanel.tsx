import type { ReactNode } from 'react'
import { cn, formatDate, formatPercent } from '@/shared/lib'
import { StatusBanner, type PassStatus } from '@/shared/ui'
import type { VerifiedPass } from '../api'

type VerifiedPassPanelProps =
  /** 확인을 통과한 패스. 상태 띠 아래에 학생 줄을 그리고, 그 아래에 `children`(신규 등록 폼)을 둔다. */
  | { pass: VerifiedPass; status?: never; message?: never; children?: ReactNode }
  /** 쓸 수 없는 패스(409). 오류 응답에는 패스 정보가 없어 상태 띠만 그린다. */
  | { pass?: never; status: Exclude<PassStatus, 'valid'>; message: string; children?: never }

/** 데스크 패스 확인 결과(DESIGN.md "데스크 결과"의 본문 Panel): 상태 띠 → 학생 줄 → 신규 등록 폼. */
export function VerifiedPassPanel(props: VerifiedPassPanelProps) {
  return (
    <section aria-label="패스 확인 결과" className="overflow-hidden rounded-lg bg-card">
      {props.pass ? (
        <>
          <StatusBanner
            status="valid"
            description={`${formatDate(props.pass.expiresOn)}까지 쓸 수 있어요.`}
          />
          <WhoRow pass={props.pass} />
          {props.children}
        </>
      ) : (
        <StatusBanner status={props.status} description={props.message} />
      )}
    </section>
  )
}

// 이름(서버가 가린 값) + 패스 번호 | 발급 학원 | 사용 기한, 오른쪽에 할인 태그. 학부모 전화번호는 없다(ADR-0035).
function WhoRow({ pass }: { pass: VerifiedPass }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-[22px] py-5">
      <div className="min-w-0">
        <p className="text-[22px] font-bold tracking-[-0.03em]">{pass.studentName}</p>
        {/*
          모든 항목 앞에 구분선을 두고 줄 전체를 왼쪽으로 한 칸 민다. 줄 맨 앞에 오는 항목의 구분선은
          바깥 상자 밖으로 나가 잘리므로, 좁은 화면에서 줄이 바뀌어도 줄 끝·줄 앞에 구분선이 남지 않는다.
        */}
        <div className="mt-0.5 overflow-hidden">
          <p className="-ml-4 flex flex-wrap text-[14px] text-sub">
            <MetaItem className="tracking-[0.04em]">{pass.passNo}</MetaItem>
            <MetaItem>{pass.partnerName} 발급</MetaItem>
            <MetaItem>{formatDate(pass.expiresOn)}까지</MetaItem>
          </p>
        </div>
      </div>
      <span className="rounded-btn-sm bg-glow-soft px-2.5 py-1.5 text-[13px] font-bold text-glow-soft-ink">
        첫 달 {formatPercent(pass.discountRate)} 할인
      </span>
    </div>
  )
}

function MetaItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('relative pl-4 tabular-nums', className)}>
      <span aria-hidden="true" className="absolute left-1.5 text-line">
        |
      </span>
      {children}
    </span>
  )
}
