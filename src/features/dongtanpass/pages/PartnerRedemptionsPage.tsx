import { useRef, useState, type FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { ApiError, supportRequestId } from '@/shared/api'
import { useMe } from '@/shared/auth'
import {
  formatDateTime,
  formatPercent,
  formatWon,
  isPeriodDate,
  periodErrors,
  readPage,
  todayInSeoul,
  type Period,
  type PeriodErrors,
} from '@/shared/lib'
import { usePartners } from '@/shared/partner'
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
  type PeriodFieldsHandle,
} from '@/shared/ui'
import { usePartnerRedemptions, type PartnerRedemptionFilters } from '../api'
import { CampusPassTabs } from '../components/CampusPassTabs'
import { defaultRedemptionPeriod, isPeriodTooLong } from '../redemptionPeriod'

// 학원 칩의 "전체". 학원 ID(숫자)와 겹치지 않는다.
const ALL = 'all'

/** 주소의 학원 ID. 1 이상의 정수가 아니면 없는 조건으로 본다. */
function readPartnerId(value: string | null): number | undefined {
  const id = value !== null && /^\d{1,9}$/.test(value) ? Number(value) : 0
  return id > 0 ? id : undefined
}

/**
 * 주소의 조건을 읽는다. 모양이 맞지 않는 날짜는 처음 기간(이번 달)으로 본다(주소를 손으로 고친 경우).
 * 학원은 관리자만 고른다. 연계 학원 계정은 자기 학원만 받으므로 주소에 있어도 보내지 않는다(다른 학원은 403이다).
 */
function readFilters(params: URLSearchParams, canPickPartner: boolean): PartnerRedemptionFilters {
  const initial = defaultRedemptionPeriod(todayInSeoul())
  const from = params.get('from')
  const to = params.get('to')
  const filters: {
    [K in keyof Required<PartnerRedemptionFilters>]: PartnerRedemptionFilters[K]
  } = {
    from: from !== null && isPeriodDate(from) ? from : initial.from,
    to: to !== null && isPeriodDate(to) ? to : initial.to,
    partnerId: canPickPartner ? readPartnerId(params.get('partnerId')) : undefined,
    page: readPage(params.get('page')),
  }
  return filters
}

/** 조건을 주소로 바꾼다. 조건에는 이름이나 전화번호가 없어(날짜, 학원) 주소에 두어도 된다. 첫 페이지는 적지 않는다. */
function toSearch({ page, ...rest }: PartnerRedemptionFilters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) params.set(key, String(value))
  }
  if (page > 0) params.set('page', String(page))
  return `?${params.toString()}`
}

/** 기간 칸의 오류. 서버는 기간을 반드시 받으므로 비워 둘 수 없고, 1년까지만 본다(데스크 사용 내역과 같다). */
function draftErrors(draft: Period, badInput: Record<keyof Period, boolean>): PeriodErrors {
  const errors = periodErrors(draft, badInput, { required: true })
  if (!errors.from && !errors.to && isPeriodTooLong(draft.from, draft.to)) {
    errors.to = '기간은 1년까지 볼 수 있어요.'
  }
  return errors
}

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '사용 내역을 불러오지 못했어요.'
  // 화면의 기간 칸이 막지만 주소를 손으로 고치면 온다.
  if (error.code === 'DONGTANPASS_INVALID_PERIOD')
    return '기간이 맞지 않아요. 시작일과 끝일을 고쳐 주세요.'
  if (error.code === 'DONGTANPASS_PERIOD_TOO_LONG')
    return '기간은 1년까지 볼 수 있어요. 기간을 줄여 주세요.'
  return error.message
}

/**
 * 연계 학원 사용 내역. 연계 학원이 사용 처리한 JEY 발급 패스를 사용일 기간으로 찾아본다(최신 사용 순, 처음에는 이번 달).
 * 연계 학원 계정(`/partner/redemptions`)은 자기 학원만, 관리자(`/admin/passes/redemptions`)는 모든 학원을 보고 학원으로 거른다.
 * JEY 지점 데스크의 사용 내역(`/desk/dongtanpass/redemptions`)과 따로다(백엔드 ADR-0041).
 * 조건과 페이지는 주소에 둔다.
 */
export function PartnerRedemptionsPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: me } = useMe()
  const isAdmin = me?.role === 'ADMIN'
  const filters = readFilters(searchParams, isAdmin)
  const redemptions = usePartnerRedemptions(filters)
  const periodRef = useRef<PeriodFieldsHandle>(null)

  const [draft, setDraft] = useState<Period>({ from: filters.from, to: filters.to })
  const [errors, setErrors] = useState<PeriodErrors>({})

  // 다른 주소로 옮길 때마다(조회, 칩, 페이지, 뒤로 가기) 기간 칸을 적용된 조건으로 맞춘다(데스크 사용 내역과 같은 방식).
  // 렌더 도중에 setState를 부르는 것은 의도한 것이다. React가 이 렌더를 버리고 곧바로 다시 그린다.
  const [syncedWith, setSyncedWith] = useState(location.key)
  if (syncedWith !== location.key) {
    setSyncedWith(location.key)
    setDraft({ from: filters.from, to: filters.to })
    setErrors({})
  }

  /** 기간 칸의 값을 조건으로 적용한다. 학원은 지금 값을 이어받고 overrides가 그 위에 덮인다. 늘 첫 페이지부터 본다. */
  function apply(overrides: Partial<PartnerRedemptionFilters> = {}) {
    const found = draftErrors(draft, periodRef.current?.badInput() ?? { from: false, to: false })
    setErrors(found)
    if (Object.keys(found).length > 0) return
    const next = toSearch({
      from: draft.from,
      to: draft.to,
      partnerId: filters.partnerId,
      ...overrides,
      page: 0,
    })
    // 같은 조건이면 주소가 바뀌지 않아 요청도 나가지 않는다. 그동안 바뀐 것을 보려고 다시 누른 것이므로 새로 받는다.
    if (next === toSearch({ ...filters, page: 0 }) && filters.page === 0) void redemptions.refetch()
    else setSearchParams(next)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    apply()
  }

  const { data, error } = redemptions
  const filtered = searchParams.toString() !== ''
  const showingPreviousPage = redemptions.isPlaceholderData
  // 관리자가 모든 학원을 볼 때만 학원 칸을 둔다. 한 학원만 보면 모든 줄이 같은 학원이다.
  const showPartner = isAdmin && filters.partnerId === undefined
  const path = location.pathname

  return (
    <>
      {isAdmin && <CampusPassTabs />}
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">
        {isAdmin ? '연계 학원 사용 내역' : 'JEY 패스 사용 내역'}
      </h1>
      <p className="mt-1 text-sub">
        {isAdmin
          ? '연계 학원이 사용 처리한 JEY 발급 패스를 사용일로 찾아봐요. JEY 지점 데스크의 사용 내역과 따로예요.'
          : '이 학원에서 사용 처리한 JEY 패스를 사용일로 찾아봐요.'}
      </p>

      <form
        onSubmit={handleSubmit}
        role="search"
        noValidate
        className="mt-7 flex flex-wrap items-start gap-x-4 gap-y-4"
      >
        {isAdmin && (
          <PartnerChips
            value={filters.partnerId}
            // 기간 칸에 넣다 만 값도 함께 적용한다. 틀린 값이 있으면 학원도 바뀌지 않는다.
            onChange={(partnerId) => apply({ partnerId })}
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
            <ButtonLink to={path} variant="ghost" className="h-[50px]">
              이번 달로
            </ButtonLink>
          )}
        </div>
      </form>

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
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void redemptions.refetch()}
            disabled={redemptions.isFetching}
          >
            {redemptions.isFetching ? '불러오는 중' : '다시 불러오기'}
          </Button>
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
          <ButtonLink to={`${path}${toSearch({ ...filters, page: 0 })}`}>첫 페이지로</ButtonLink>
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        // 다른 페이지를 받는 동안에는 이전 페이지가 보인다. 숫자와 표를 함께 흐리게 해서 아직 바뀌지 않았음을 알린다.
        <div
          className={showingPreviousPage ? 'opacity-60' : undefined}
          aria-busy={showingPreviousPage}
        >
          <p className="mt-7 text-right text-[14px] text-sub">{`전체 ${data.totalElements}건`}</p>
          <Table caption="JEY 패스 사용 내역" stack className="mt-4">
            <thead>
              <tr>
                <Th>학생</Th>
                <Th>사용 일시</Th>
                <Th>패스 번호</Th>
                <Th>원래 수강료</Th>
                <Th>할인</Th>
                <Th>받을 금액</Th>
                {showPartner && <Th>연계 학원</Th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <Td className="font-bold">{item.studentName}</Td>
                  <Td label="사용 일시" className="tabular-nums">
                    {formatDateTime(item.redeemedAt)}
                  </Td>
                  <Td label="패스 번호" className="tabular-nums">
                    {item.passNo}
                  </Td>
                  <Td label="원래 수강료" className="tabular-nums">
                    {formatWon(item.originalFee)}
                  </Td>
                  <Td label="할인" className="tabular-nums">
                    {`${formatPercent(item.discountRate)} · ${formatWon(item.discountAmount)}`}
                  </Td>
                  <Td label="받을 금액" className="font-bold tabular-nums">
                    {formatWon(item.payableAmount)}
                  </Td>
                  {showPartner && <Td label="연계 학원">{item.partnerName}</Td>}
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

/**
 * 관리자의 학원 칩. 꺼진 학원도 보인다(꺼지기 전의 사용 내역이 있다).
 * 학원 목록을 받지 못해도 "전체"로는 볼 수 있다. 주소의 학원이 목록에 없으면 번호로라도 칩을 둔다.
 */
function PartnerChips({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (partnerId: number | undefined) => void
}) {
  const partners = usePartners()
  const names = new Map(partners.data?.map((partner) => [partner.id, partner.name]))
  const options = [
    { value: ALL, label: '전체' },
    ...(value !== undefined && !names.has(value)
      ? [{ value: String(value), label: `학원 ${value}` }]
      : []),
    ...(partners.data ?? []).map((partner) => ({ value: String(partner.id), label: partner.name })),
  ]
  return (
    <div className="w-full">
      <FilterChips
        label="연계 학원"
        name="partnerFilter"
        options={options}
        value={value === undefined ? ALL : String(value)}
        onChange={(next) => onChange(readPartnerId(next))}
      />
      {partners.error && (
        <div className="mt-3">
          <Notice requestId={supportRequestId(partners.error)}>
            학원 목록을 불러오지 못했어요. 다른 학원을 고를 수 없어요.
          </Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void partners.refetch()}
            disabled={partners.isFetching}
          >
            학원 다시 불러오기
          </Button>
        </div>
      )}
    </div>
  )
}
