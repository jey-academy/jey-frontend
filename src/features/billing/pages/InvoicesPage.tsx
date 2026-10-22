import { Link, useSearchParams } from 'react-router'
import { ApiError, supportRequestId } from '@/shared/api'
import { useMe } from '@/shared/auth'
import { readCampusId, useCampuses } from '@/shared/campus'
import { readPage, todayInSeoul } from '@/shared/lib'
import { BILLING_PATH, invoicePath, studentPath } from '@/shared/paths'
import {
  Button,
  ButtonLink,
  EmptyState,
  FilterChips,
  Notice,
  Pagination,
  Pill,
  Table,
  Td,
  Th,
} from '@/shared/ui'
import { useInvoices, type Invoice, type InvoiceListFilters } from '../api'
import { BillingTabs } from '../components/BillingTabs'
import { formatMonth, isMonth, shiftMonth } from '../invoiceInput'
import {
  INVOICE_STATUS_LABELS,
  invoiceStatusColor,
  PAYMENT_METHOD_LABELS,
  wonOrNull,
} from '../invoiceView'

// 지점 칩의 "전체". 숫자가 아니라 readCampusId가 전 지점(undefined)으로 읽는다.
const ALL = 'all'

const linkClassName =
  'rounded-btn-sm font-bold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/**
 * 주소의 조건을 읽는다. 달이 없거나 모양이 틀리면 이번 달(한국 날짜)이다.
 * 지점은 관리자만 고른다. 직원은 소속 지점만 볼 수 있어 주소에 있어도 보내지 않는다(보내면 다른 지점은 403이다).
 */
function readFilters(params: URLSearchParams, canPickCampus: boolean): InvoiceListFilters {
  const month = params.get('month')
  return {
    targetMonth: month !== null && isMonth(month) ? month : todayInSeoul().slice(0, 7),
    campusId: canPickCampus ? readCampusId(params.get('campusId')) : undefined,
    page: readPage(params.get('page')),
  }
}

/** 조건을 주소로 바꾼다. 첫 페이지는 적지 않는다. */
function toSearch({ targetMonth, campusId, page }: InvoiceListFilters): string {
  const params = new URLSearchParams({ month: targetMonth })
  if (campusId !== undefined) params.set('campusId', String(campusId))
  if (page > 0) params.set('page', String(page))
  return `?${params.toString()}`
}

/** 반과 횟수. 반 나눔이면 반마다 적는다. */
function linesText(invoice: Invoice): string {
  return invoice.lines.map((line) => `${line.className} ${line.lessonCount}회`).join(', ')
}

/**
 * 데스크 수납: 그 달 청구 목록. 학생 ID 순이고 취소한 청구도 보인다. 처음에는 이번 달을 보여 준다.
 * 관리자는 지점을 고를 수 있고(고르지 않으면 전 지점), 직원은 소속 지점만 본다.
 * 달·지점·페이지는 주소에 둔다. 새로고침하거나 상세에서 뒤로 와도 보던 달·지점·페이지가 유지된다.
 */
export function InvoicesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: me } = useMe()
  const isAdmin = me?.role === 'ADMIN'
  const filters = readFilters(searchParams, isAdmin)
  const invoices = useInvoices(filters)
  const campuses = useCampuses()
  const thisMonth = todayInSeoul().slice(0, 7)

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

  const { data, error } = invoices
  const showingPreviousPage = invoices.isPlaceholderData
  // 받아 둔 목록은 있는데 다시 받기에 실패했다(아래 표는 이전 내용일 수 있다).
  const stale = data !== undefined && error !== null
  // 달을 옮기면 첫 페이지부터 본다. 지점은 그대로다.
  const monthPath = (month: string) =>
    `${BILLING_PATH}${toSearch({ targetMonth: month, campusId: filters.campusId, page: 0 })}`
  const monthName = formatMonth(filters.targetMonth)

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">수납</h1>
      <p className="mt-1 text-sub">그 달의 수강료 청구와 결제 여부를 봐요.</p>
      <BillingTabs />

      <div className="mt-7 grid gap-4">
        {isAdmin && (
          <FilterChips
            label="지점"
            name="campusFilter"
            options={campusOptions}
            value={filters.campusId === undefined ? ALL : String(filters.campusId)}
            onChange={(value) =>
              setSearchParams(toSearch({ ...filters, campusId: readCampusId(value), page: 0 }))
            }
          />
        )}
        <nav aria-label="대상 월" className="flex flex-wrap items-center gap-2">
          <ButtonLink
            variant="ghost"
            size="sm"
            to={monthPath(shiftMonth(filters.targetMonth, -1))}
            aria-label="이전 달"
          >
            ‹
          </ButtonLink>
          <h2 className="min-w-[128px] text-center text-[18px] font-bold" aria-live="polite">
            {monthName}
          </h2>
          <ButtonLink
            variant="ghost"
            size="sm"
            to={monthPath(shiftMonth(filters.targetMonth, 1))}
            aria-label="다음 달"
          >
            ›
          </ButtonLink>
          {filters.targetMonth !== thisMonth && (
            <ButtonLink variant="ghost" size="sm" to={monthPath(thisMonth)}>
              이번 달로
            </ButtonLink>
          )}
        </nav>
      </div>

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
          청구 목록을 불러오고 있어요.
        </p>
      )}

      {error && (
        <div className="mt-6">
          <Notice requestId={supportRequestId(error)}>
            {data
              ? `최신 내용을 불러오지 못했어요. 아래 표는 이전 내용일 수 있어요. (${errorMessage(error)})`
              : errorMessage(error)}
          </Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void invoices.refetch()}
            disabled={invoices.isFetching}
          >
            {invoices.isFetching ? '불러오는 중' : '다시 불러오기'}
          </Button>
        </div>
      )}

      {data && data.totalElements === 0 && (
        <EmptyState title={`${monthName} 청구가 없어요`} className="py-16" />
      )}

      {/* 청구는 있는데 이 페이지가 비어 있다. 없는 페이지로 들어온 경우다. */}
      {data && data.totalElements > 0 && data.items.length === 0 && (
        <EmptyState
          title="이 페이지에는 청구가 없어요"
          description={`${monthName} 청구는 모두 ${data.totalElements}건이에요.`}
          className="py-16"
        >
          <ButtonLink to={monthPath(filters.targetMonth)}>첫 페이지로</ButtonLink>
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        // 다른 페이지를 받는 동안에는 이전 페이지가 보인다. 숫자와 표를 함께 흐리게 해서 아직 바뀌지 않았음을 알린다.
        <div
          // 다시 받기에 실패해 이전 내용을 보일 때도 흐리게 하고 건수 옆에 적는다(위의 안내가 밀려 안 보일 수 있다).
          className={showingPreviousPage || stale ? 'opacity-60' : undefined}
          aria-busy={showingPreviousPage}
        >
          <p className="mt-7 text-right text-[14px] text-sub">
            {stale ? `전체 ${data.totalElements}건 · 이전 내용` : `전체 ${data.totalElements}건`}
          </p>
          <Table caption={`${monthName} 청구`} stack className="mt-4">
            <thead>
              <tr>
                <Th>학생</Th>
                <Th>반·횟수</Th>
                <Th numeric>청구 금액</Th>
                <Th>상태</Th>
                <Th>결제 수단</Th>
                {showCampus && <Th>지점</Th>}
                <Th>청구</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((invoice, index) => {
                const name = invoice.studentName ?? `학생 ${invoice.studentId}`
                const status = invoice.status ?? ''
                return (
                  // 만든 청구라 번호가 있어야 하지만, 없어도 줄의 key가 겹치지 않게 한다.
                  <tr key={invoice.id ?? `no-id-${index}`}>
                    <Td>
                      <Link to={studentPath(invoice.studentId)} className={linkClassName}>
                        {name}
                      </Link>
                    </Td>
                    <Td label="반·횟수">{linesText(invoice)}</Td>
                    <Td label="청구 금액" numeric className="tabular-nums">
                      {wonOrNull(invoice.totalAmount) ?? '확인 필요'}
                    </Td>
                    <Td label="상태">
                      <Pill status="valid" colorClassName={invoiceStatusColor(status)}>
                        {/* 모르는 상태는 코드 그대로, 비어 있으면(목록에는 없어야 하는 값) 확인하라고 보인다. */}
                        {INVOICE_STATUS_LABELS[status] ?? (status || '확인 필요')}
                      </Pill>
                    </Td>
                    <Td label="결제 수단">
                      {/* 결제함(PAID)일 때만 결제가 있다. 취소한 결제는 이 응답에 실리지 않는다.
                          모르는 수단은 코드 그대로 보인다(빈칸이면 결제 없음과 구분되지 않는다). */}
                      {invoice.payment
                        ? (PAYMENT_METHOD_LABELS[invoice.payment.method] ?? invoice.payment.method)
                        : '—'}
                    </Td>
                    {showCampus && (
                      <Td label="지점" className="text-sub">
                        {campusNames.get(invoice.campusId) ?? `지점 ${invoice.campusId}`}
                      </Td>
                    )}
                    <Td label="청구">
                      {invoice.id !== null ? (
                        <Link
                          to={invoicePath(invoice.id)}
                          aria-label={`${name} ${monthName} 청구 보기`}
                          className={linkClassName}
                        >
                          청구 보기
                        </Link>
                      ) : (
                        '—'
                      )}
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

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '청구 목록을 불러오지 못했어요.'
}
