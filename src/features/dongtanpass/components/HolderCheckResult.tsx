import type { ReactNode } from 'react'
import { cn } from '@/shared/lib'
import type { HolderCheckResult } from '../api'

/**
 * 본인 확인 결과(DESIGN.md 진행 카드): 맞음은 체크, 맞지 않음은 ×와 다음 행동.
 * JEY 지점 데스크와 연계 학원이 같이 쓴다. 다음 행동은 쓰는 곳마다 다르다.
 */
export function HolderCheckResultList({
  result,
  nameFix,
  phoneFix,
}: {
  result: HolderCheckResult
  /** 이름이 맞지 않을 때 할 일 */
  nameFix: string
  /** 번호가 맞지 않을 때 할 일 */
  phoneFix: string
}) {
  return (
    <ul className="mt-2 grid gap-2 text-[14px]">
      <ResultLine ok={result.nameMatches} label="학생 이름" fix={nameFix} />
      <ResultLine ok={result.phoneMatches} label="학부모 번호" fix={phoneFix} />
    </ul>
  )
}

function ResultLine({ ok, label, fix }: { ok: boolean; label: string; fix: string }) {
  return (
    <li className="grid grid-cols-[18px_1fr] items-start gap-2">
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid size-[18px] place-items-center rounded-full text-[11px] font-bold text-white',
          ok ? 'bg-pill-valid' : 'bg-pill-expired',
        )}
      >
        {ok ? '✓' : '×'}
      </span>
      <div>
        <ResultLabel ok={ok}>{`${label} ${ok ? '맞음' : '맞지 않음'}`}</ResultLabel>
        {!ok && <p className="mt-0.5 text-sub">{fix}</p>}
      </div>
    </li>
  )
}

function ResultLabel({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <p className={cn('font-semibold', ok ? 'text-pill-valid' : 'text-pill-expired')}>{children}</p>
  )
}
