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
import { invoicePath, redemptionInvoicePath, studentPath } from '@/shared/paths'
import {
  Button,
  ButtonLink,
  EmptyState,
  FilterChips,
  Notice,
  Pagination,
  PeriodFields,
  Table,
  Td,
  Th,
  usePeriodSearch,
} from '@/shared/ui'
import { useRedemptions, type RedemptionFilters } from '../api'
import {
  defaultRedemptionPeriod,
  REDEMPTION_PERIOD_ERROR_CODES,
  redemptionPeriodErrorText,
} from '../redemptionPeriod'

const PATH = '/desk/dongtanpass/redemptions'
// 지점 칩의 "전체". 지점 ID(숫자)와 겹치지 않는다.
const ALL = 'all'

const linkClassName =
  'rounded-btn-sm font-bold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/**
 * 주소의 조건을 읽는다. 모양이 맞지 않는 날짜는 그 칸만 처음 기간(이번 달)의 값으로 본다(주소를 손으로 고친 경우).
 * 지점은 관리자만 고른다. 직원은 소속 지점만 볼 수 있어 주소에 있어도 보내지 않는다(보내면 다른 지점은 403이다).
 */
function readFilters(params: URLSearchParams, canPickCampus: boolean): RedemptionFilters {
  const initial = defaultRedemptionPeriod(todayInSeoul())
  const from = params.get('from')
  const to = params.get('to')
  const filters: { [K in keyof Required<RedemptionFilters>]: RedemptionFilters[K] } = {
    from: from !== null && isPeriodDate(from) ? from : initial.from,
    to: to !== null && isPeriodDate(to) ? to : initial.to,
    campusId: canPickCampus ? readCampusId(params.get('campusId')) : undefined,
    page: readPage(params.get('page')),
  }
  return filters
}

/** 조건을 주소로 바꾼다. 조건에는 이름이나 전화번호가 없어(날짜, 지점) 주소에 두어도 된다. 첫 페이지는 적지 않는다. */
function toSearch({ page, ...rest }: RedemptionFilters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) params.set(key, String(value))
  }
  if (page > 0) params.set('page', String(page))
  return `?${params.toString()}`
}

/** 기간 칸의 오류. 서버는 기간을 반드시 받으므로 비워 둘 수 없고, 1년까지만 본다. */
function draftErrors(draft: Period, badInput: Record<keyof Period, boolean>): PeriodErrors {
  const errors = periodErrors(draft, badInput, { required: true })
  if (!errors.from && !errors.to && isPeriodTooLong(draft.from, draft.to)) {
    errors.to = '기간은 1년까지 볼 수 있어요.'
  }
  return errors
}

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '사용 내역을 불러오지 못했어요.'
  return redemptionPeriodErrorText(error.code) ?? error.message
}

/**
 * 데스크의 패스 사용 내역. 사용 처리한 패스를 사용일 기간으로 찾아본다(최신 사용 순). 처음에는 이번 달을 보여 준다.
 * 관리자는 지점을 고를 수 있고(고르지 않으면 전 지점), 직원은 소속 지점만 본다.
 * 조건과 페이지는 주소에 둔다. 새로고침하거나 뒤로 가기로 돌아와도 보던 자리가 유지된다.
 */
export function RedemptionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: me } = useMe()
  const isAdmin = me?.role === 'ADMIN'
  const filters = readFilters(searchParams, isAdmin)
  const redemptions = useRedemptions(filters)
  const campuses = useCampuses()
  // 지점은 지금 값을 이어받는다(칩이 apply로 덮는다).
  const { draft, setDraft, errors, periodRef, apply, handleSubmit, periodRejected } =
    usePeriodSearch({
      filters,
      toSearch,
      draftOf: ({ from, to }) => ({ from, to }),
      validate: draftErrors,
      fromDraft: ({ from, to }, { campusId }) => ({ from, to, campusId }),
      query: redemptions,
      invalidPeriodCodes: REDEMPTION_PERIOD_ERROR_CODES,
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

  const { data, error } = redemptions
  const filtered = searchParams.toString() !== ''
  const showingPreviousPage = redemptions.isPlaceholderData

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">패스 사용 내역</h1>
      <p className="mt-1 text-sub">데스크에서 사용 처리한 동탄고 패스를 사용일로 찾아봐요.</p>

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
          labels={{ from: '사용일 시작', to: '사용일 끝' }}
          value={draft}
          onChange={setDraft}
          errors={errors}
        />
        {/* TextField의 이름표 높이만큼 내려 입력칸과 나란히 둔다. */}
        <div className="mt-[27px] flex gap-2">
          <Button type="submit" className="h-[50px]" disabled={redemptions.isFetching}>
            {redemptions.isFetching ? '조회 중' : '조회'}
          </Button>
          {filtered && (
            <ButtonLink to={PATH} variant="ghost" className="h-[50px]">
              이번 달로
            </ButtonLink>
          )}
        </div>
      </form>

      {/* 지점 목록은 관리자의 칩과 지점 칸이 쓴다. 한 지점을 골라 칸이 없어도 칩이 비므로 알린다. 직원은 쓰지 않는다. */}
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
          사용 내역을 불러오고 있어요.
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
              onClick={() => void redemptions.refetch()}
              disabled={redemptions.isFetching}
            >
              {redemptions.isFetching ? '불러오는 중' : '다시 불러오기'}
            </Button>
          )}
        </div>
      )}

      {data && data.totalElements === 0 && (
        <EmptyState title="이 기간에 사용한 패스가 없어요" className="py-16" />
      )}

      {/* 내역은 있는데 이 페이지가 비어 있다. 없는 페이지로 들어온 경우다. */}
      {data && data.totalElements > 0 && data.items.length === 0 && (
        <EmptyState
          title="이 페이지에는 사용 내역이 없어요"
          description={`이 기간의 사용 내역은 모두 ${data.totalElements}건이에요.`}
          className="py-16"
        >
          <ButtonLink to={`${PATH}${toSearch({ ...filters, page: 0 })}`}>첫 페이지로</ButtonLink>
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        // 다른 페이지를 받는 동안에는 이전 페이지가 보인다. 숫자와 표를 함께 흐리게 해서 아직 바뀌지 않았음을 알린다.
        <div
          className={showingPreviousPage ? 'opacity-60' : undefined}
          aria-busy={showingPreviousPage}
        >
          <p className="mt-7 text-right text-[14px] text-sub">{`전체 ${data.totalElements}건`}</p>
          <Table caption="패스 사용 내역" stack className="mt-4">
            <thead>
              <tr>
                <Th>학생</Th>
                <Th>사용 일시</Th>
                <Th>패스 번호</Th>
                <Th>발급 학원</Th>
                {showCampus && <Th>지점</Th>}
                <Th>수강료 청구</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.redemptionId}>
                  <Td>
                    <Link to={studentPath(item.studentId)} className={linkClassName}>
                      {/* 학생을 찾지 못한 기록(있어서는 안 되는 자료)도 상세로 가는 길은 둔다. */}
                      {item.studentName ?? `학생 ${item.studentId}`}
                    </Link>
                  </Td>
                  <Td label="사용 일시" className="tabular-nums">
                    {formatDateTime(item.redeemedAt)}
                  </Td>
                  <Td label="패스 번호" className="tabular-nums">
                    {item.passNo}
                  </Td>
                  <Td label="발급 학원">{item.partnerName}</Td>
                  {showCampus && (
                    <Td label="지점" className="text-sub">
                      {/* 이름을 모르면(받는 중, 받지 못함, 목록에 없는 지점) 번호로 보여 준다. */}
                      {campusNames.get(item.campusId) ?? `지점 ${item.campusId}`}
                    </Td>
                  )}
                  <Td label="수강료 청구">
                    {/* 열린 청구(결제 전·결제함)가 있으면 그 청구로, 없거나 취소했으면 새로 만든다. */}
                    <Link
                      to={
                        item.invoiceId === null
                          ? redemptionInvoicePath(item.redemptionId)
                          : invoicePath(item.invoiceId)
                      }
                      aria-label={`${item.studentName ?? `학생 ${item.studentId}`} ${item.passNo} ${item.invoiceId === null ? '청구 만들기' : '청구 보기'}`}
                      className={`font-semibold ${linkClassName}`}
                    >
                      {item.invoiceId === null ? '청구 만들기' : '청구 보기'}
                    </Link>
                  </Td>
                </tr>
              ))}
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
