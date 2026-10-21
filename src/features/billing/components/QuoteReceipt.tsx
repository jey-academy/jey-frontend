import { ApiError, isOutcomeUnknown, supportRequestId } from '@/shared/api'
import { formatWon } from '@/shared/lib'
import { Button, Notice, Receipt } from '@/shared/ui'
import type { Invoice } from '../api'
import { invoiceRows, policyText } from '../invoiceView'

/** 다시 계산하면 답이 달라질 수 있는 실패(응답 없음, 서버 오류, 요청이 너무 많음, 보내지 못함) */
function mayDifferOnRetry(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  // isRateLimited는 타입 가드라 || 뒤에서 error의 타입을 좁혀 버린다. 상태를 직접 본다.
  return isOutcomeUnknown(error) || error.status === 429 || error.notSent
}

type QuoteReceiptProps = {
  /** 지금 칸에 맞는 계산 결과. 칸이 덜 채워졌거나, 계산 중이거나, 실패했으면 null이다. */
  quote: Invoice | null
  /** 계산하는 중(칸을 고친 뒤 기다리는 동안 포함) */
  calculating: boolean
  /** 계산 요청의 실패. 없으면 null이다. */
  error: unknown
  /** 금액이 없을 때 그 까닭(만들기 버튼이 막힌 까닭과 같다). 계산 중이거나 실패했으면 보이지 않는다. */
  waitingFor: string
  onRetry: () => void
  className?: string
}

/** 서버가 미리 계산한 청구액(패스 할인 포함)을 영수증으로 보여 준다. 금액은 서버 값 그대로다. */
export function QuoteReceipt({
  quote,
  calculating,
  error,
  waitingFor,
  onRetry,
  className,
}: QuoteReceiptProps) {
  const rows = quote ? invoiceRows(quote) : []
  const failed = error !== null && !calculating

  return (
    <Receipt
      className={className}
      rows={rows}
      total={quote && { label: '받을 금액', value: formatWon(quote.totalAmount) }}
      empty={
        calculating ? (
          <p role="status">금액을 계산하고 있어요.</p>
        ) : failed ? null : (
          <p>{waitingFor}</p>
        )
      }
    >
      {quote && <p className="mt-3 text-[13px] text-sub">{policyText(quote.discountPolicy)}</p>}
      {failed && (
        <div className="mt-3">
          <Notice requestId={supportRequestId(error)}>
            {error instanceof ApiError
              ? `금액을 계산하지 못했어요. ${error.message}`
              : '금액을 계산하지 못했어요.'}
          </Notice>
          {mayDifferOnRetry(error) ? (
            <Button variant="ghost" size="sm" className="mt-3" onClick={onRetry}>
              다시 계산하기
            </Button>
          ) : (
            // 거부(429 말고 4xx)는 다시 해도 같다. 칸을 고치면 다시 계산한다.
            <p className="mt-2 text-[13px] text-sub">반·횟수나 할인을 고치면 다시 계산해요.</p>
          )}
        </div>
      )}
    </Receipt>
  )
}
