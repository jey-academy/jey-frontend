import { useCallback, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ApiError, isOutcomeUnknown, retryAfterPhrase, supportRequestId } from '@/shared/api'
import { readCampusId, useCampuses } from '@/shared/campus'
import { formatDateTime, readPage } from '@/shared/lib'
import { studentPath } from '@/shared/paths'
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
  useRetryLedgerSync,
  useUnsyncedLedger,
  type LedgerSync,
  type LedgerSyncFilters,
} from '../api'
import { reasonText, retryResultText } from '../ledgerSync'

const PATH = '/admin/ledger-sync'
// 지점 칩의 "전체". 지점 ID(숫자)와 겹치지 않는다.
const ALL = 'all'
// 위에 쌓아 두는 결과의 수. 오래된 것부터 빠진다.
const MAX_SHOWN_RESULTS = 5

const linkClassName =
  'rounded-btn-sm font-bold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/** 다시 반영의 결과나 오류. 줄(반영 기록)마다 마지막 것 하나다. */
type RetryResult = {
  /** 반영 기록 id(줄) */
  id: number
  /** 같은 결과가 또 와도 새로 그려 다시 읽히게 하는 번호 */
  seq: number
  tone: 'success' | 'warning' | 'error'
  text: string
  requestId: string | null
}

function readFilters(params: URLSearchParams): LedgerSyncFilters {
  return { campusId: readCampusId(params.get('campusId')), page: readPage(params.get('page')) }
}

/** 조건을 주소로 바꾼다(지점, 페이지). 첫 페이지와 전 지점은 적지 않는다. */
function toSearch({ campusId, page }: LedgerSyncFilters): string {
  const params = new URLSearchParams()
  if (campusId !== undefined) params.set('campusId', String(campusId))
  if (page > 0) params.set('page', String(page))
  const search = params.toString()
  return search === '' ? '' : `?${search}`
}

/**
 * 관리자의 장부 미반영 목록(P4 수납). 데스크 결제를 서버가 지점의 장부(구글 시트)에 쓰는데, 쓰지 못한 결제(또는 취소 표시를
 * 하지 못한 결제)가 여기 남는다. 구글 장애는 서버가 알아서 다시 하다가 끝내 실패하면 들어온다.
 * 관리자가 장부를 고친 뒤(탭·반 블록·빈 줄·권한) "다시 반영"으로 넣는다. 결제는 장부와 상관없이 이미 성공했다.
 * 지점과 페이지는 주소에 둔다.
 *
 * 다시 반영의 결과는 그 줄이 남아 있으면 줄 안에, 목록에서 빠졌으면(장부에 씀 등) 위에 쌓아 보인다.
 * 지점·페이지를 바꾸면 지운다(지금 목록과 상관없는 결과가 남지 않게).
 */
export function LedgerSyncPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readFilters(searchParams)
  const ledger = useUnsyncedLedger(filters)
  const campuses = useCampuses()
  const [results, setResults] = useState<RetryResult[]>([])
  const seq = useRef(0)

  // 줄이 화면에서 사라진 뒤에도 불린다(useRetryLedgerSync). 같은 줄의 옛 결과는 바꾼다.
  const addResult = useCallback((result: Omit<RetryResult, 'seq'>) => {
    seq.current += 1
    const next = { ...result, seq: seq.current }
    setResults((current) => [next, ...current.filter((item) => item.id !== result.id)])
  }, [])

  function go(next: LedgerSyncFilters) {
    setResults([])
    setSearchParams(toSearch(next))
  }

  const campusNames = new Map(campuses.data?.map((campus) => [campus.id, campus.name]))
  const campusOptions = [
    { value: ALL, label: '전체' },
    // 주소의 지점이 목록에 없으면(받는 중, 받지 못함, 없는 지점) 번호로라도 칩을 둔다. 고른 칩이 사라지지 않게 한다.
    ...(filters.campusId !== undefined && !campusNames.has(filters.campusId)
      ? [{ value: String(filters.campusId), label: `지점 ${filters.campusId}` }]
      : []),
    ...(campuses.data ?? []).map((campus) => ({ value: String(campus.id), label: campus.name })),
  ]
  // 전 지점을 볼 때만 지점 칸을 둔다.
  const showCampus = filters.campusId === undefined

  const { data, error } = ledger
  const showingPreviousPage = ledger.isPlaceholderData
  const shownIds = new Set(data?.items.map((item) => item.id))
  // 목록에서 빠진 줄의 결과(장부에 씀 등)는 위에 쌓는다. 남아 있는 줄의 결과는 그 줄 안에 보인다.
  const detached = results.filter((result) => !shownIds.has(result.id)).slice(0, MAX_SHOWN_RESULTS)

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">장부 미반영</h1>
      <p className="mt-1 text-sub">
        장부(구글 시트)에 쓰지 못한 데스크 결제예요. 장부를 고친 뒤 다시 반영해 주세요. 결제는 이미
        기록됐어요.
      </p>

      <FilterChips
        label="지점"
        name="campusFilter"
        options={campusOptions}
        value={filters.campusId === undefined ? ALL : String(filters.campusId)}
        onChange={(value) => go({ campusId: readCampusId(value), page: 0 })}
        className="mt-6"
      />

      {campuses.error && (
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
          장부 미반영 목록을 불러오고 있어요.
        </p>
      )}

      {error && (
        <div className="mt-6">
          <Notice requestId={supportRequestId(error)}>
            {`${data ? '최신 목록을 불러오지 못했어요. 아래 내용은 이전 것일 수 있어요.' : '장부 미반영 목록을 불러오지 못했어요.'}${
              error instanceof ApiError ? ` ${error.message}` : ''
            }`}
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
        <EmptyState title="장부에 쓰지 못한 결제가 없어요" className="py-16" />
      )}

      {/* 미반영은 있는데 이 페이지가 비어 있다. 없는 페이지로 들어왔거나, 다시 반영해 줄이 빠졌다. */}
      {data && data.totalElements > 0 && data.items.length === 0 && (
        <EmptyState
          title="이 페이지에는 미반영이 없어요"
          description={`장부에 쓰지 못한 결제는 모두 ${data.totalElements}건이에요.`}
          className="py-16"
        >
          <ButtonLink to={`${PATH}${toSearch({ ...filters, page: 0 })}`}>첫 페이지로</ButtonLink>
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        // 다른 페이지를 받는 동안에는 이전 페이지가 보인다. 흐리게 해서 아직 바뀌지 않았음을 알린다.
        <div
          className={showingPreviousPage ? 'opacity-60' : undefined}
          aria-busy={showingPreviousPage}
        >
          <p className="mt-7 text-right text-[14px] text-sub">{`전체 ${data.totalElements}건`}</p>
          <Table caption="장부 미반영" stack className="mt-4">
            <thead>
              <tr>
                <Th>학생</Th>
                {showCampus && <Th>지점</Th>}
                <Th>대상 월</Th>
                <Th>까닭</Th>
                <Th>시도</Th>
                <Th>마지막 시도</Th>
                <Th>반영</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <LedgerRow
                  key={item.id}
                  item={item}
                  campusName={
                    showCampus ? (campusNames.get(item.campusId) ?? `지점 ${item.campusId}`) : null
                  }
                  result={results.find((result) => result.id === item.id) ?? null}
                  onResult={addResult}
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
 * 미반영 한 줄. 학생을 찾지 못한 줄(있어서는 안 되는 자료)은 이름이 없어 번호로 보인다.
 * 줄 이름에는 결제 번호를 넣는다. 같은 학생·같은 달 줄이 둘이어도(결제와 그 취소 표시) 가를 수 있게 한다.
 */
function LedgerRow({
  item,
  campusName,
  result,
  onResult,
}: {
  item: LedgerSync
  /** 전 지점을 볼 때만 있다. */
  campusName: string | null
  /** 이 줄의 마지막 다시 반영 결과 */
  result: RetryResult | null
  onResult: (result: Omit<RetryResult, 'seq'>) => void
}) {
  const name = item.studentName ?? `학생 ${item.studentId}`
  const who = `${name} ${item.targetMonth}(결제 ${item.paymentId})`
  const reason = reasonText(item.reason, item.targetMonth)
  const retry = useRetryLedgerSync(item.id, {
    onSuccess: (answer) =>
      onResult({ id: item.id, ...retryResultText(answer, who, item.targetMonth), requestId: null }),
    onError: (error) => onResult({ id: item.id, ...retryErrorNotice(error, who) }),
  })
  const buttonText = retry.isPending ? '반영하는 중' : '다시 반영'

  return (
    <tr>
      <Td>
        <Link to={studentPath(item.studentId)} className={linkClassName}>
          {name}
        </Link>
      </Td>
      {campusName !== null && (
        <Td label="지점" className="text-sub">
          {campusName}
        </Td>
      )}
      <Td label="대상 월" className="tabular-nums">
        {item.targetMonth}
      </Td>
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
      {reason.final ? (
        // 다시 해도 같은 결과다. 버튼을 두지 않는다.
        <Td label="반영" className="text-[14px] text-sub">
          직접 적어 주세요
        </Td>
      ) : (
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
      )}
    </tr>
  )
}

/** 다시 반영의 오류 안내. 어느 경우든 목록은 다시 받기 시작했다(useRetryLedgerSync의 onSettled). */
function retryErrorNotice(error: unknown, who: string): Omit<RetryResult, 'id' | 'seq'> {
  const requestId = supportRequestId(error)
  if (!(error instanceof ApiError)) {
    return { tone: 'error', text: `${who}: 다시 반영하지 못했어요.`, requestId }
  }
  if (isOutcomeUnknown(error)) {
    return {
      tone: 'warning',
      text: `${who}: ${error.message} 반영됐을 수도 있어요. 목록을 다시 받아요. 줄이 남아 있으면 다시 눌러 주세요.`,
      requestId,
    }
  }
  if (error.status === 429) {
    return {
      tone: 'warning',
      text: `${who}: 요청이 너무 많아요. ${retryAfterPhrase(error)}에 다시 눌러 주세요.`,
      requestId: null,
    }
  }
  if (error.code === 'BILLING_LEDGER_SYNC_NOT_RETRYABLE') {
    return {
      tone: 'warning',
      text: `${who}: 이미 반영됐거나 서버가 다시 하는 중이에요. 목록을 다시 받아요.`,
      requestId: null,
    }
  }
  if (error.code === 'BILLING_LEDGER_SYNC_NOT_FOUND') {
    return {
      tone: 'warning',
      text: `${who}: 반영 기록을 찾지 못했어요. 목록을 다시 받아요.`,
      requestId: null,
    }
  }
  return { tone: 'error', text: `${who}: ${error.message}`, requestId }
}
