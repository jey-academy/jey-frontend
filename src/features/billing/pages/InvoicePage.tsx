import { Link, useParams } from 'react-router'
import { ApiError, supportRequestId } from '@/shared/api'
import { formatWon } from '@/shared/lib'
import { parseRecordId, studentPath } from '@/shared/paths'
import { Button, ButtonLink, EmptyState, Notice, Pill, Receipt } from '@/shared/ui'
import { useBillingStudent, useInvoice, type Invoice } from '../api'
import { InvoiceActions } from '../components/InvoiceActions'
import { formatMonth } from '../invoiceInput'
import { INVOICE_STATUS_LABELS, invoiceRows, policyText } from '../invoiceView'

const REDEMPTIONS_PATH = '/desk/dongtanpass/redemptions'

// 상태 표시의 색. 결제 전은 할 일이 남았다는 뜻으로 주의 색이다.
const STATUS_COLORS: Record<string, string> = {
  ISSUED: 'bg-warn-bg text-warn',
  PAID: 'bg-mint-bg text-pill-valid',
  CANCELED: 'bg-gray-bg text-pill-used',
}

const linkClassName =
  'rounded-btn-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/**
 * 청구 상세(데스크, P4 수납). 줄마다 정가·할인·청구액과 합계를 보이고, 상태에 따라 결제를 기록하거나 취소한다.
 * 청구를 만든 뒤 완료 카드의 "결제 기록하기"로 들어온다. 직원은 소속 지점의 청구만 본다(다른 지점이면 403).
 */
export function InvoicePage() {
  const { id } = useParams()
  const invoiceId = parseRecordId(id)
  const invoice = useInvoice(invoiceId)
  const error = invoice.error
  const errorCode = error instanceof ApiError ? error.code : null

  if (invoiceId === null || errorCode === 'BILLING_INVOICE_NOT_FOUND') {
    return (
      <EmptyState
        headingLevel={1}
        title="없는 청구예요"
        description="주소가 잘못됐거나 다른 청구의 주소일 수 있어요."
      >
        <ButtonLink to={REDEMPTIONS_PATH}>패스 사용 내역으로</ButtonLink>
      </EmptyState>
    )
  }
  // 다시 불러와도 같은 답이다.
  if (errorCode === 'AUTH_CAMPUS_NOT_ALLOWED' && !invoice.data) {
    return (
      <EmptyState
        headingLevel={1}
        title="다른 지점의 청구예요"
        description="소속 지점의 청구만 볼 수 있어요."
      >
        <ButtonLink to={REDEMPTIONS_PATH}>패스 사용 내역으로</ButtonLink>
      </EmptyState>
    )
  }
  if (invoice.data) {
    return (
      <InvoiceView
        invoice={invoice.data}
        invoiceId={invoiceId}
        refetch={
          error
            ? {
                requestId: supportRequestId(error),
                retry: () => void invoice.refetch(),
                retrying: invoice.isFetching,
              }
            : null
        }
      />
    )
  }
  return (
    <>
      <Heading />
      {error ? (
        <div className="mt-7">
          <Notice requestId={supportRequestId(error)}>
            {error instanceof ApiError
              ? `청구를 불러오지 못했어요. ${error.message}`
              : '청구를 불러오지 못했어요.'}
          </Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void invoice.refetch()}
            disabled={invoice.isFetching}
          >
            {invoice.isFetching ? '불러오는 중' : '다시 불러오기'}
          </Button>
        </div>
      ) : (
        <p role="status" className="py-24 text-center text-sub">
          청구를 불러오고 있어요.
        </p>
      )}
    </>
  )
}

type RefetchFailure = { requestId: string | null; retry: () => void; retrying: boolean }

function InvoiceView({
  invoice,
  invoiceId,
  refetch,
}: {
  invoice: Invoice
  invoiceId: number
  /** 받아 둔 청구는 있는데 다시 받기에 실패했다. 아래 상태가 옛것일 수 있다. */
  refetch: RefetchFailure | null
}) {
  // 청구 응답에는 학생 이름이 없다. 학생을 따로 받는다(받지 못하면 번호로 보인다).
  const student = useBillingStudent(invoice.studentId)
  const studentName = student.data?.name ?? `학생 ${invoice.studentId}`
  const status = invoice.status ?? ''

  return (
    <>
      <Link to={studentPath(invoice.studentId)} className={`text-[14px] text-sub ${linkClassName}`}>
        {`${studentName} 학생 상세`}
      </Link>
      <Heading className="mt-2" />
      <p className="mt-3 flex flex-wrap items-center gap-2 text-[15px]">
        <span className="font-semibold">{studentName}</span>
        <span className="text-sub">{`· ${formatMonth(invoice.targetMonth)} · 청구 번호 ${invoiceId}`}</span>
        <Pill status="valid" colorClassName={STATUS_COLORS[status] ?? 'bg-gray-bg text-pill-used'}>
          {INVOICE_STATUS_LABELS[status] ?? status}
        </Pill>
      </p>

      {refetch && (
        <div className="mt-4">
          <Notice requestId={refetch.requestId}>
            청구를 새로 불러오지 못했어요. 아래 상태는 이전 내용일 수 있어요.
          </Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={refetch.retry}
            disabled={refetch.retrying}
          >
            {refetch.retrying ? '불러오는 중' : '청구 다시 불러오기'}
          </Button>
        </div>
      )}

      <div className="mt-6 grid items-start gap-[18px] min-[861px]:grid-cols-[minmax(0,1fr)_360px]">
        <Receipt
          title="청구 내역"
          rows={invoiceRows(invoice)}
          total={{ label: '청구 금액', value: formatWon(invoice.totalAmount) }}
        >
          <p className="mt-3 text-[13px] text-sub">{policyText(invoice.discountPolicy)}</p>
        </Receipt>
        <InvoiceActions invoice={invoice} invoiceId={invoiceId} />
      </div>
    </>
  )
}

function Heading({ className }: { className?: string }) {
  return (
    <h1 className={`text-[26px] font-extrabold tracking-[-0.03em] text-night ${className ?? ''}`}>
      수강료 청구
    </h1>
  )
}
