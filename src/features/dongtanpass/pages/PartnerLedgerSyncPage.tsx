import { useSearchParams } from 'react-router'
import { ApiError, supportRequestId } from '@/shared/api'
import { retryErrorNotice, useRetryResults, type RetryResult } from '@/shared/ledgerSync'
import { formatDateTime, readPage } from '@/shared/lib'
import { usePartners } from '@/shared/partner'
import {
  Button,
  ButtonLink,
  EmptyState,
  FilterChips,
  Notice,
  Pagination,
  Table,
  Td,
  Th,
} from '@/shared/ui'
import {
  useRetryPartnerLedgerSync,
  useUnsyncedPartnerLedger,
  type PartnerLedgerSync,
  type PartnerLedgerSyncFilters,
  type PartnerLedgerSyncPage as LedgerPage,
} from '../api'
import { partnerKindText, partnerReasonText, partnerRetryResultText } from '../partnerLedgerSync'

const PATH = '/admin/ledger-sync/partners'
// 학원 칩의 "전체". 학원 ID(숫자)와 겹치지 않는다.
const ALL = 'all'
const RETRY_ERROR_CODES = {
  notRetryable: 'DONGTANPASS_PARTNER_LEDGER_SYNC_NOT_RETRYABLE',
  notFound: 'DONGTANPASS_PARTNER_LEDGER_SYNC_NOT_FOUND',
}

/** 주소의 학원 ID. 1 이상의 정수가 아니면 없는 조건(전 학원)으로 본다. */
function readPartnerId(value: string | null): number | undefined {
  const id = value !== null && /^\d{1,9}$/.test(value) ? Number(value) : 0
  return id > 0 ? id : undefined
}

function readFilters(params: URLSearchParams): PartnerLedgerSyncFilters {
  return { partnerId: readPartnerId(params.get('partnerId')), page: readPage(params.get('page')) }
}

/**
 * 목록을 받지 못했을 때의 안내. 받아 둔 목록이 있으면 그것이 이전 것일 수 있다고 알린다.
 * 받아 둔 목록이 0건이면 아래에 보일 것이 없으니(빈 안내는 숨긴다) 그사이 생겼을 수 있다고만 알린다.
 */
function loadErrorText(data: LedgerPage | undefined): string {
  if (!data) return '연계 학원 장부 미반영 목록을 불러오지 못했어요.'
  return data.totalElements === 0
    ? '최신 목록을 불러오지 못했어요. 그사이 생긴 미반영이 있을 수 있어요.'
    : '최신 목록을 불러오지 못했어요. 아래 내용은 이전 것일 수 있어요.'
}

/** 조건을 주소로 바꾼다(학원, 페이지). 첫 페이지와 전 학원은 적지 않는다. */
function toSearch({ partnerId, page }: PartnerLedgerSyncFilters): string {
  const params = new URLSearchParams()
  if (partnerId !== undefined) params.set('partnerId', String(partnerId))
  if (page > 0) params.set('page', String(page))
  const search = params.toString()
  return search === '' ? '' : `?${search}`
}

/**
 * 관리자의 연계 학원 장부 미반영 목록(백엔드 PR #104, ADR-0048). 패스 사용은 서버가 그 학원의 장부(구글 시트의 "JEY 패스" 탭)에
 * 한 줄씩 붙이는데, 쓰지 못한 기록이 여기 남는다. 구글 장애는 서버가 알아서 다시 하다가 끝내 실패하면 들어온다.
 * 관리자가 장부를 고친 뒤(탭·머리글·권한) "다시 반영"으로 넣는다. 패스 사용은 장부와 상관없이 이미 끝났다.
 * 수납 장부 미반영(billing의 LedgerSyncPage)과 같은 모양이다. 학원과 페이지는 주소에 둔다.
 */
export function PartnerLedgerSyncPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readFilters(searchParams)
  const ledger = useUnsyncedPartnerLedger(filters)
  const partners = usePartners()
  const results = useRetryResults()

  // 화면 안에서 학원·페이지를 바꿀 때만 결과를 지운다. 뒤로 가기나 "첫 페이지로"로 바뀌면 남는데,
  // 그 결과 문구는 그대로 맞아(그 줄에 무슨 일이 있었는지) 일부러 두었다.
  function go(next: PartnerLedgerSyncFilters) {
    results.clear()
    setSearchParams(toSearch(next))
  }

  const partnerNames = new Map(partners.data?.map((partner) => [partner.id, partner.name]))
  const partnerOptions = [
    { value: ALL, label: '전체' },
    // 주소의 학원이 목록에 없으면(받는 중, 받지 못함, 없는 학원) 번호로라도 칩을 둔다. 고른 칩이 사라지지 않게 한다.
    ...(filters.partnerId !== undefined && !partnerNames.has(filters.partnerId)
      ? [{ value: String(filters.partnerId), label: `학원 ${filters.partnerId}` }]
      : []),
    ...(partners.data ?? []).map((partner) => ({ value: String(partner.id), label: partner.name })),
  ]
  // 전 학원을 볼 때만 학원 칸을 둔다.
  const showPartner = filters.partnerId === undefined

  const { data, error } = ledger
  const showingPreviousPage = ledger.isPlaceholderData
  // 받아 둔 목록이 있는데 다시 받기에 실패했다. 표는 흐리게 두고 이전 내용이라고 알린다.
  const stale = data !== undefined && error !== null
  const shownIds = new Set(data?.items.map((item) => item.id))
  const detached = results.detached(shownIds)

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">
        연계 학원 장부 미반영
      </h1>
      <p className="mt-1 text-sub">
        연계 학원 장부(구글 시트의 &quot;JEY 패스&quot; 탭)에 쓰지 못한 패스 사용이에요. 장부를 고친
        뒤 다시 반영해 주세요. 패스 사용은 이미 끝났어요.
      </p>

      <FilterChips
        label="연계 학원"
        name="partnerFilter"
        options={partnerOptions}
        value={filters.partnerId === undefined ? ALL : String(filters.partnerId)}
        onChange={(value) => go({ partnerId: readPartnerId(value), page: 0 })}
        className="mt-6"
      />

      {/* 받아 둔 목록이 있으면 칩은 그대로 쓸 수 있다. 목록이 없을 때만 알린다. */}
      {partners.error && !partners.data && (
        <div className="mt-6">
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

      {detached.length > 0 && (
        <div className="mt-6 grid gap-2">
          {detached.map((result) => (
            <Notice key={result.seq} tone={result.tone} requestId={result.requestId}>
              {result.text}
            </Notice>
          ))}
        </div>
      )}

      {!data && !error && (
        <p role="status" className="py-24 text-center text-sub">
          연계 학원 장부 미반영 목록을 불러오고 있어요.
        </p>
      )}

      {error && (
        <div className="mt-6">
          <Notice requestId={supportRequestId(error)}>
            {`${loadErrorText(data)}${error instanceof ApiError ? ` ${error.message}` : ''}`}
          </Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void ledger.refetch()}
            disabled={ledger.isFetching}
          >
            {ledger.isFetching ? '불러오는 중' : '다시 불러오기'}
          </Button>
        </div>
      )}

      {/* 다시 받기에 실패했으면 "없다"고 단정하지 않는다(그사이 생겼을 수 있다). */}
      {data && data.totalElements === 0 && !error && (
        <EmptyState title="연계 학원 장부에 쓰지 못한 기록이 없어요" className="py-16" />
      )}

      {/* 미반영은 있는데 이 페이지가 비어 있다. 없는 페이지로 들어왔거나, 다시 반영해 줄이 빠졌다. */}
      {data && data.totalElements > 0 && data.items.length === 0 && (
        <EmptyState
          title="이 페이지에는 미반영이 없어요"
          description={`연계 학원 장부에 쓰지 못한 기록은 모두 ${data.totalElements}건이에요.`}
          className="py-16"
        >
          <ButtonLink to={`${PATH}${toSearch({ ...filters, page: 0 })}`}>첫 페이지로</ButtonLink>
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        // 다른 페이지를 받는 동안, 또는 다시 받기에 실패해 이전 내용일 때는 흐리게 해서 아직 최신이 아님을 알린다.
        <div
          className={showingPreviousPage || stale ? 'opacity-60' : undefined}
          aria-busy={showingPreviousPage}
        >
          <p className="mt-7 text-right text-[14px] text-sub">
            {`전체 ${data.totalElements}건${stale ? ' · 이전 내용' : ''}`}
          </p>
          <Table caption="연계 학원 장부 미반영" stack className="mt-4">
            <thead>
              <tr>
                <Th>학생</Th>
                {showPartner && <Th>연계 학원</Th>}
                <Th>구분</Th>
                <Th>까닭</Th>
                <Th>시도</Th>
                <Th>마지막 시도</Th>
                <Th>반영</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <PartnerLedgerRow
                  key={item.id}
                  item={item}
                  partnerName={
                    showPartner
                      ? (item.partnerName ??
                        partnerNames.get(item.partnerId) ??
                        `학원 ${item.partnerId}`)
                      : null
                  }
                  result={results.resultOf(item.id)}
                  onResult={results.add}
                />
              ))}
            </tbody>
          </Table>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            onChange={(nextPage) => go({ ...filters, page: nextPage })}
            disabled={showingPreviousPage}
            className="mt-6"
          />
        </div>
      )}
    </>
  )
}

/**
 * 미반영 한 줄. 패스를 찾지 못한 줄(있어서는 안 되는 자료)은 학생 이름 대신 "학생 이름 없음"이 보인다.
 * 패스 ID(`passId`, 장부의 패스 번호 DT-…와 다르다)는 늘 이름 아래에 둔다.
 * 줄 이름에는 패스 ID를 넣는다. 같은 학생의 줄이 둘이어도(할인해 줌, JEY에서 사용) 가를 수 있게 한다.
 */
function PartnerLedgerRow({
  item,
  partnerName,
  result,
  onResult,
}: {
  item: PartnerLedgerSync
  /** 전 학원을 볼 때만 있다. */
  partnerName: string | null
  /** 이 줄의 마지막 다시 반영 결과 */
  result: RetryResult | null
  onResult: (result: Omit<RetryResult, 'seq'>) => void
}) {
  const name = item.studentName ?? '학생 이름 없음'
  const who = `${name}(패스 ${item.passId})`
  const reason = partnerReasonText(item.reason)
  const retry = useRetryPartnerLedgerSync(item.id, {
    onSuccess: (answer) =>
      onResult({ id: item.id, ...partnerRetryResultText(answer, who), requestId: null }),
    onError: (error) =>
      onResult({ id: item.id, ...retryErrorNotice(error, who, RETRY_ERROR_CODES) }),
  })
  const buttonText = retry.isPending ? '반영하는 중' : '다시 반영'

  return (
    <tr>
      <Td>
        <span className="font-bold">{name}</span>
        <span className="mt-0.5 block text-[13px] text-sub tabular-nums">{`패스 ${item.passId}`}</span>
      </Td>
      {partnerName !== null && (
        <Td label="연계 학원" className="text-sub">
          {partnerName}
        </Td>
      )}
      <Td label="구분">{partnerKindText(item.kind)}</Td>
      <Td label="까닭">
        <span className="font-semibold">{reason.label}</span>
        <span className="mt-0.5 block text-[14px] text-sub">{reason.todo}</span>
      </Td>
      <Td label="시도" className="tabular-nums">
        {`${item.attempts}번`}
      </Td>
      <Td label="마지막 시도" className="tabular-nums">
        {formatDateTime(item.lastAttemptAt)}
      </Td>
      <Td actions>
        <div className="grid justify-items-start gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => retry.mutate()}
            disabled={retry.isPending}
            // 보이는 글자가 이름에 들어 있어야 한다(음성으로 누르는 사람).
            aria-label={`${who} ${buttonText}`}
          >
            {buttonText}
          </Button>
          {/* 줄이 남는 결과(또 못 씀, 반영 중, 오류)는 그 줄 안에 보인다. 같은 결과가 또 와도 새로 그린다. */}
          {result && !retry.isPending && (
            <Notice key={result.seq} tone={result.tone} requestId={result.requestId}>
              {result.text}
            </Notice>
          )}
        </div>
      </Td>
    </tr>
  )
}
