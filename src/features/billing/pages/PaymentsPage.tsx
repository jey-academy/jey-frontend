import { Link, useSearchParams } from 'react-router'
import { ApiError, supportRequestId } from '@/shared/api'
import { useMe } from '@/shared/auth'
import { readCampusId, useCampuses } from '@/shared/campus'
import {
  formatDateTime,
  isPeriodDate,
  isPeriodTooLong,
  periodErrors,
  readPage,
  todayInSeoul,
  type Period,
  type PeriodErrors,
} from '@/shared/lib'
import { invoicePath, PAYMENTS_PATH, studentPath } from '@/shared/paths'
import {
  Button,
  ButtonLink,
  EmptyState,
  FilterChips,
  Notice,
  Pagination,
  PeriodFields,
  Pill,
  Table,
  Td,
  Th,
  usePeriodSearch,
} from '@/shared/ui'
import { usePayments, type PaymentListFilters } from '../api'
import { BillingTabs } from '../components/BillingTabs'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  paymentStatusColor,
  wonOrNull,
} from '../invoiceView'
import {
  defaultPaymentPeriod,
  PAYMENT_PERIOD_ERROR_CODES,
  paymentPeriodErrorText,
} from '../paymentPeriod'

// 지점 칩의 "전체". 숫자가 아니라 readCampusId가 전 지점(undefined)으로 읽는다.
const ALL = 'all'

const linkClassName =
  'rounded-btn-sm font-bold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/**
 * 주소의 조건을 읽는다. 읽을 수 없거나 받는 범위(2000~2099년) 밖의 날짜는 그 칸만 처음 기간(오늘)의 값으로 본다(주소를 손으로 고친 경우).
 * 지점은 관리자만 고른다. 직원은 소속 지점만 볼 수 있어 주소에 있어도 보내지 않는다(보내면 다른 지점은 403이다).
 */
function readFilters(params: URLSearchParams, canPickCampus: boolean): PaymentListFilters {
  const initial = defaultPaymentPeriod(todayInSeoul())
  const from = params.get('from')
  const to = params.get('to')
  return {
    from: from !== null && isPeriodDate(from) ? from : initial.from,
    to: to !== null && isPeriodDate(to) ? to : initial.to,
    campusId: canPickCampus ? readCampusId(params.get('campusId')) : undefined,
    page: readPage(params.get('page')),
  }
}

/** 조건을 주소로 바꾼다. 조건에는 이름이나 전화번호가 없어(날짜, 지점) 주소에 두어도 된다. 첫 페이지는 적지 않는다. */
function toSearch({ page, ...rest }: PaymentListFilters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) params.set(key, String(value))
  }
  if (page > 0) params.set('page', String(page))
  return `?${params.toString()}`
}

/**
 * 기간 칸의 오류. 서버의 기간 규칙을 모두 막는다(`usePeriodSearch`의 전제):
 * 비울 수 없고, 2000-01-01~2099-12-31 안이며(isPeriodDate), 시작일이 끝일보다 앞이고, 1년까지다.
 */
function draftErrors(draft: Period, badInput: Record<keyof Period, boolean>): PeriodErrors {
  const errors = periodErrors(draft, badInput, { required: true })
  if (!errors.from && !errors.to && isPeriodTooLong(draft.from, draft.to)) {
    errors.to = '기간은 1년까지 볼 수 있어요.'
  }
  return errors
}

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '결제 목록을 불러오지 못했어요.'
  return paymentPeriodErrorText(error.code) ?? error.message
}

/**
 * 데스크 수납: 결제 목록. 하루 정산 때 포스기 매출과 맞춰 본다. 처음에는 오늘 하루를 보여 준다.
 * 결제일 기간으로 찾고(최신 결제 순), 취소한 결제도 보인다(취소일이 아니라 원래 결제일로 잘린다).
 * 합계는 보이지 않는다. 서버가 합계를 주지 않고, 금액은 프론트에서 계산하지 않는다.
 * 관리자는 지점을 고를 수 있고(고르지 않으면 전 지점), 직원은 소속 지점만 본다.
 * 조건과 페이지는 주소에 둔다. 새로고침하거나 상세에서 뒤로 와도 보던 기간·지점·페이지가 유지된다.
 */
export function PaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: me } = useMe()
  const isAdmin = me?.role === 'ADMIN'
  const filters = readFilters(searchParams, isAdmin)
  const payments = usePayments(filters)
  const campuses = useCampuses()
  // 지점은 지금 값을 이어받는다(칩이 apply로 덮는다).
  const { draft, setDraft, errors, periodRef, apply, handleSubmit, periodRejected } =
    usePeriodSearch({
      filters,
      toSearch,
      draftOf: ({ from, to }) => ({ from, to }),
      validate: draftErrors,
      fromDraft: ({ from, to }, { campusId }) => ({ from, to, campusId }),
      query: payments,
      invalidPeriodCodes: PAYMENT_PERIOD_ERROR_CODES,
    })

  const campusNames = new Map(campuses.data?.map((campus) => [campus.id, campus.name]))
  const campusOptions = [
    { value: ALL, label: '전체' },
    // 주소의 지점이 목록에 없으면(받는 중, 받지 못함, 없는 지점) 번호로라도 칩을 둔다. 고른 칩이 사라지지 않게 한다.
    ...(filters.campusId !== undefined && !campusNames.has(filters.campusId)
      ? [{ value: String(filters.campusId), label: `지점 ${filters.campusId}` }]
      : []),
    ...(campuses.data ?? []).map((campus) => ({ value: String(campus.id), label: campus.name })),
  ]
  // 관리자가 전 지점을 볼 때만 지점 칸을 둔다. 한 지점만 보면 모든 줄이 같은 지점이다.
  const showCampus = isAdmin && filters.campusId === undefined

  const { data, error } = payments
  const filtered = searchParams.toString() !== ''
  const showingPreviousPage = payments.isPlaceholderData
  // 받아 둔 목록은 있는데 다시 받기에 실패했다(아래 표는 이전 내용일 수 있다).
  const stale = data !== undefined && error !== null

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">수납</h1>
      <p className="mt-1 text-sub">
        결제일로 결제 기록을 찾아 포스기 매출과 맞춰 봐요. 취소한 결제는 원래 결제일 목록에 보여요.
      </p>
      <BillingTabs />

      <form
        onSubmit={handleSubmit}
        role="search"
        noValidate
        className="mt-7 flex flex-wrap items-start gap-x-4 gap-y-4"
      >
        {isAdmin && (
          <FilterChips
            label="지점"
            name="campusFilter"
            options={campusOptions}
            value={filters.campusId === undefined ? ALL : String(filters.campusId)}
            // 기간 칸에 넣다 만 값도 함께 적용한다. 틀린 값이 있으면 지점도 바뀌지 않는다.
            onChange={(value) => apply({ campusId: readCampusId(value) })}
            className="w-full"
          />
        )}
        <PeriodFields
          ref={periodRef}
          labels={{ from: '결제일 시작', to: '결제일 끝' }}
          value={draft}
          onChange={setDraft}
          errors={errors}
        />
        {/* TextField의 이름표 높이만큼 내려 입력칸과 나란히 둔다. */}
        <div className="mt-[27px] flex gap-2">
          <Button type="submit" className="h-[50px]" disabled={payments.isFetching}>
            {payments.isFetching ? '조회 중' : '조회'}
          </Button>
          {filtered && (
            <ButtonLink to={PAYMENTS_PATH} variant="ghost" className="h-[50px]">
              오늘로
            </ButtonLink>
          )}
        </div>
      </form>

      {/* 지점 목록은 관리자의 칩과 지점 칸이 쓴다. 직원은 쓰지 않는다. */}
      {campuses.error && isAdmin && (
        <div className="mt-6">
          <Notice requestId={supportRequestId(campuses.error)}>
            지점 이름을 불러오지 못했어요. 다른 지점을 고를 수 없고, 지점이 번호로 보여요.
          </Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void campuses.refetch()}
            disabled={campuses.isFetching}
          >
            지점 다시 불러오기
          </Button>
        </div>
      )}

      {!data && !error && (
        <p role="status" className="py-24 text-center text-sub">
          결제 목록을 불러오고 있어요.
        </p>
      )}

      {error && (
        <div className="mt-6">
          <Notice requestId={supportRequestId(error)}>
            {data
              ? `최신 내용을 불러오지 못했어요. 아래 표는 이전 내용일 수 있어요. (${errorMessage(error)})`
              : errorMessage(error)}
          </Notice>
          {!periodRejected && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => void payments.refetch()}
              disabled={payments.isFetching}
            >
              {payments.isFetching ? '불러오는 중' : '다시 불러오기'}
            </Button>
          )}
        </div>
      )}

      {data && data.totalElements === 0 && (
        <EmptyState title="이 기간에 기록한 결제가 없어요" className="py-16" />
      )}

      {/* 결제는 있는데 이 페이지가 비어 있다. 없는 페이지로 들어온 경우다. */}
      {data && data.totalElements > 0 && data.items.length === 0 && (
        <EmptyState
          title="이 페이지에는 결제가 없어요"
          description={`이 기간의 결제는 모두 ${data.totalElements}건이에요.`}
          className="py-16"
        >
          <ButtonLink to={`${PAYMENTS_PATH}${toSearch({ ...filters, page: 0 })}`}>
            첫 페이지로
          </ButtonLink>
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        // 다른 페이지를 받는 동안에는 이전 페이지가 보인다. 숫자와 표를 함께 흐리게 해서 아직 바뀌지 않았음을 알린다.
        // 다시 받기에 실패해 이전 내용을 보일 때도 흐리게 하고 건수 옆에 적는다. 위의 안내는 페이지를 넘기면 밀려 안 보인다.
        <div
          className={showingPreviousPage || stale ? 'opacity-60' : undefined}
          aria-busy={showingPreviousPage}
        >
          <p className="mt-7 text-right text-[14px] text-sub">
            {stale ? `전체 ${data.totalElements}건 · 이전 내용` : `전체 ${data.totalElements}건`}
          </p>
          <Table caption="결제 목록" stack className="mt-4">
            <thead>
              <tr>
                <Th>학생</Th>
                <Th>결제 시각</Th>
                <Th>수단</Th>
                <Th numeric>수강료</Th>
                <Th numeric>교재비</Th>
                <Th>상태</Th>
                {showCampus && <Th>지점</Th>}
                <Th>청구</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((payment) => {
                const name = payment.studentName ?? `학생 ${payment.studentId}`
                // 취소한 결제의 금액은 그어서 흐리게 보인다. 눈으로 더해 포스기와 맞출 때 섞이지 않게 한다.
                const canceled = payment.status === 'CANCELED'
                const amountClass = canceled ? 'tabular-nums text-sub line-through' : 'tabular-nums'
                const amountText = (amount: number) => (
                  <>
                    {canceled && <span className="sr-only">취소한 금액 </span>}
                    {wonOrNull(amount) ?? '확인 필요'}
                  </>
                )
                return (
                  <tr key={payment.paymentId}>
                    <Td>
                      <Link to={studentPath(payment.studentId)} className={linkClassName}>
                        {name}
                      </Link>
                    </Td>
                    <Td label="결제 시각" className="tabular-nums">
                      {formatDateTime(payment.paidAt)}
                    </Td>
                    <Td label="수단">
                      {/* 모르는 수단은 코드 그대로 보인다. */}
                      {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                    </Td>
                    <Td label="수강료" numeric className={amountClass}>
                      {amountText(payment.amount)}
                    </Td>
                    <Td label="교재비" numeric className={amountClass}>
                      {amountText(payment.bookFee)}
                    </Td>
                    <Td label="상태">
                      <Pill status="valid" colorClassName={paymentStatusColor(payment.status)}>
                        {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                      </Pill>
                      {/* 취소한 결제는 언제 취소했는지 함께 본다(환불은 데스크에서 따로 한다). */}
                      {payment.canceledAt && (
                        <span className="ml-2 text-[13px] text-sub tabular-nums">
                          {`취소 ${formatDateTime(payment.canceledAt)}`}
                        </span>
                      )}
                    </Td>
                    {showCampus && (
                      <Td label="지점" className="text-sub">
                        {campusNames.get(payment.campusId) ?? `지점 ${payment.campusId}`}
                      </Td>
                    )}
                    <Td label="청구">
                      <Link
                        to={invoicePath(payment.invoiceId)}
                        aria-label={`${name} 결제 ${payment.paymentId}의 청구 보기`}
                        className={linkClassName}
                      >
                        청구 보기
                      </Link>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            onChange={(nextPage) => setSearchParams(toSearch({ ...filters, page: nextPage }))}
            disabled={showingPreviousPage}
            className="mt-6"
          />
        </div>
      )}
    </>
  )
}
