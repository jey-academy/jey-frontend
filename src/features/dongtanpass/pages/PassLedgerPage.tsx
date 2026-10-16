import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { ApiError, supportRequestId } from '@/shared/api'
import { useMe } from '@/shared/auth'
import {
  formatDate,
  formatWon,
  isPeriodDate,
  PERIOD_MAX,
  PERIOD_MIN,
  readPage,
  saveFile,
} from '@/shared/lib'
import {
  Button,
  ButtonLink,
  EmptyState,
  FilterChips,
  Notice,
  Pagination,
  passStatusLabels,
  Pill,
  TextField,
} from '@/shared/ui'
import { downloadLedgerCsv, useLedger, type LedgerFilters, type LedgerItem } from '../api'
import { PassCancelModal } from '../components/PassCancelModal'
import { PassLinkModal } from '../components/PassLinkModal'
import { canCancel, canRegenerateLink, isPassState, passStates, toPassStatus } from '../passState'
import { isPaymentMethod, paymentMethodLabels } from '../paymentMethods'

const PATH = '/partner/passes'
// 상태 칩의 "전체". 서버의 상태 이름과 겹치지 않는다.
const ALL = 'all'
/** 꺼진 학원. 장부와 내려받기가 모두 이 답이다. */
const PARTNER_INACTIVE = 'DONGTANPASS_PARTNER_INACTIVE'
/** 기간이 틀렸다는 답(from이 to보다 뒤, 범위 밖). 화면의 칸이 막지만 주소를 손으로 고치면 온다. */
const INVALID_PERIOD = 'DONGTANPASS_INVALID_PERIOD'
/** 서버가 파일 이름을 주지 않았을 때 쓰는 이름 */
const CSV_FILENAME = 'dongtanpass-passes.csv'

const statusOptions = [
  { value: ALL, label: '전체' },
  ...passStates.map((state) => ({
    value: state,
    // 상태 이름은 줄의 Pill과 같은 말을 쓴다.
    label: passStatusLabels[toPassStatus(state) ?? 'valid'],
  })),
]

/** 주소의 조건을 읽는다. 모양이 맞지 않는 값은 없는 조건으로 본다(주소를 손으로 고친 경우). */
function readFilters(params: URLSearchParams): LedgerFilters {
  const status = params.get('status')
  const from = params.get('from')
  const to = params.get('to')
  // 키를 모두 적어야 하는 타입이다. 조건이 늘었는데 여기서 읽는 것을 빠뜨리면 컴파일 에러가 난다.
  const filters: { [K in keyof Required<LedgerFilters>]: LedgerFilters[K] } = {
    status: status !== null && isPassState(status) ? status : undefined,
    from: from !== null && isPeriodDate(from) ? from : undefined,
    to: to !== null && isPeriodDate(to) ? to : undefined,
    page: readPage(params.get('page')),
  }
  return filters
}

/** 조건을 주소로 바꾼다. 조건에는 이름이나 전화번호가 없어(상태, 날짜) 주소에 두어도 된다. 첫 페이지는 적지 않는다. */
function toSearch({ page, ...rest }: LedgerFilters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) params.set(key, String(value))
  }
  if (page > 0) params.set('page', String(page))
  const search = params.toString()
  return search ? `?${search}` : ''
}

type Draft = { from: string; to: string }
type DraftErrors = Partial<Record<keyof Draft, string>>

/** 기간 칸의 오류. 감사 로그의 기간 칸과 같은 규칙이다(`badDates`는 칸에 날짜로 읽히지 않는 글자가 있는지). */
function draftErrors(draft: Draft, badDates: { from: boolean; to: boolean }): DraftErrors {
  const errors: DraftErrors = {}
  if (badDates.from || (draft.from !== '' && !isPeriodDate(draft.from))) {
    errors.from = '날짜를 확인해 주세요.'
  }
  if (badDates.to || (draft.to !== '' && !isPeriodDate(draft.to))) {
    errors.to = '날짜를 확인해 주세요.'
  }
  // YYYY-MM-DD는 글자 순서가 날짜 순서와 같다.
  if (!errors.from && !errors.to && draft.from !== '' && draft.to !== '' && draft.from > draft.to) {
    errors.to = '끝일이 시작일보다 앞이에요.'
  }
  return errors
}

function ledgerErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '패스 목록을 불러오지 못했어요.'
  if (error.code === INVALID_PERIOD) return '기간이 맞지 않아요. 시작일과 끝일을 고쳐 주세요.'
  return error.message
}

/**
 * 연계 학원의 발급 장부. 발급한 패스를 상태와 발급일로 걸러 보고, 쓰지 않은 패스의 링크를 새로 만들거나 패스를 취소한다.
 * 조건과 페이지는 주소에 둔다. 새로고침하거나 뒤로 가기로 돌아와도 보던 자리가 유지된다.
 */
export function PassLedgerPage() {
  const { data: me } = useMe()
  // 장부 API는 연계 학원 계정만 부를 수 있다. 관리자도 이 화면(탭)을 열 수 있지만 요청을 보내지 않고 안내만 한다.
  const isPartner = me?.role === 'PARTNER'
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readFilters(searchParams)
  const ledger = useLedger(filters, { enabled: isPartner })
  const fromRef = useRef<HTMLInputElement>(null)
  const toRef = useRef<HTMLInputElement>(null)

  const [draft, setDraft] = useState<Draft>({ from: filters.from ?? '', to: filters.to ?? '' })
  const [errors, setErrors] = useState<DraftErrors>({})
  const [linkTarget, setLinkTarget] = useState<LedgerItem | null>(null)
  const [cancelTarget, setCancelTarget] = useState<LedgerItem | null>(null)
  // 취소하고 남기는 안내. 다른 조건이나 페이지로 옮기면 지운다.
  const [done, setDone] = useState<string | null>(null)
  const doneRef = useRef<HTMLDivElement>(null)
  const [download, setDownload] = useState<{ pending: boolean; error: unknown }>({
    pending: false,
    error: null,
  })

  // 다른 주소로 옮길 때마다(조회, 칩, 페이지, 뒤로 가기) 기간 칸을 적용된 조건으로 맞춘다(감사 로그와 같은 방식).
  // 렌더 도중에 setState를 부르는 것은 의도한 것이다. React가 이 렌더를 버리고 곧바로 다시 그린다.
  const [syncedWith, setSyncedWith] = useState(location.key)
  if (syncedWith !== location.key) {
    setSyncedWith(location.key)
    setDraft({ from: filters.from ?? '', to: filters.to ?? '' })
    setErrors({})
    setDone(null)
  }

  // 취소하면 그 줄의 버튼이 사라져, 창이 닫힐 때 포커스가 돌아갈 곳이 없다(문서 맨 위로 빠진다).
  // 남긴 안내로 옮겨, 키보드로 쓰는 사람이 보던 자리 근처에서 이어 가게 한다.
  // 다음 차례에 옮긴다. 지금은 창이 아직 열려 있어 바깥 화면이 막혀(inert) 포커스를 받지 못한다(Chrome에서 확인).
  useEffect(() => {
    if (!done) return
    const timer = window.setTimeout(() => doneRef.current?.focus())
    return () => window.clearTimeout(timer)
  }, [done])

  if (!isPartner) {
    return (
      <>
        <Heading />
        <Notice tone="info" className="mt-7 max-w-[560px]">
          패스 목록은 연계 학원 계정으로 봐요. 관리자 계정으로는 볼 수 없어요.
        </Notice>
      </>
    )
  }

  const error = ledger.error
  const inactiveError =
    error instanceof ApiError && error.code === PARTNER_INACTIVE
      ? error
      : download.error instanceof ApiError && download.error.code === PARTNER_INACTIVE
        ? download.error
        : null
  if (inactiveError) {
    return (
      <>
        <Heading />
        <Notice className="mt-7 max-w-[560px]">{inactiveError.message}</Notice>
      </>
    )
  }

  /** 기간 칸의 값을 조건으로 적용한다. 상태는 지금 값을 이어받고 overrides가 그 위에 덮인다. 늘 첫 페이지부터 본다. */
  function apply(overrides: Partial<LedgerFilters> = {}) {
    const found = draftErrors(draft, {
      from: fromRef.current?.validity.badInput ?? false,
      to: toRef.current?.validity.badInput ?? false,
    })
    setErrors(found)
    if (Object.keys(found).length > 0) return
    const next = toSearch({
      status: filters.status,
      from: draft.from || undefined,
      to: draft.to || undefined,
      ...overrides,
      page: 0,
    })
    // 같은 조건이면 주소가 바뀌지 않아 요청도 나가지 않는다. 그동안 바뀐 것을 보려고 다시 누른 것이므로 새로 받는다.
    if (next === toSearch(filters)) void ledger.refetch()
    else setSearchParams(next)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    apply()
  }

  async function handleDownload() {
    setDownload({ pending: true, error: null })
    try {
      // 화면에 걸려 있는 기간으로 받는다(칸에 넣다 만 값이 아니라).
      const file = await downloadLedgerCsv({ from: filters.from, to: filters.to })
      saveFile(file.blob, file.filename ?? CSV_FILENAME)
      setDownload({ pending: false, error: null })
    } catch (caught) {
      setDownload({ pending: false, error: caught })
    }
  }

  const data = ledger.data
  const filtered = toSearch({ ...filters, page: 0 }) !== ''
  const showingPreviousPage = ledger.isPlaceholderData

  return (
    <>
      <Heading />

      <form
        onSubmit={handleSubmit}
        role="search"
        noValidate
        className="mt-7 flex flex-wrap items-start gap-x-4 gap-y-4"
      >
        <FilterChips
          label="상태"
          name="statusFilter"
          options={statusOptions}
          value={filters.status ?? ALL}
          // 기간 칸에 넣다 만 값도 함께 적용한다. 틀린 값이 있으면 상태도 바뀌지 않는다.
          onChange={(value) => apply({ status: isPassState(value) ? value : undefined })}
          className="w-full"
        />
        <TextField
          ref={fromRef}
          label="발급일 시작"
          name="from"
          type="date"
          min={PERIOD_MIN}
          max={PERIOD_MAX}
          value={draft.from}
          onChange={(event) => setDraft((before) => ({ ...before, from: event.target.value }))}
          error={errors.from}
          className="w-[170px]"
        />
        <TextField
          ref={toRef}
          label="발급일 끝"
          name="to"
          type="date"
          min={PERIOD_MIN}
          max={PERIOD_MAX}
          value={draft.to}
          onChange={(event) => setDraft((before) => ({ ...before, to: event.target.value }))}
          error={errors.to}
          className="w-[170px]"
        />
        {/* TextField의 이름표 높이만큼 내려 입력칸과 나란히 둔다. */}
        <div className="mt-[27px] flex gap-2">
          <Button type="submit" className="h-[50px]" disabled={ledger.isFetching}>
            {ledger.isFetching ? '조회 중' : '조회'}
          </Button>
          {filtered && (
            <ButtonLink to={PATH} variant="ghost" className="h-[50px]">
              조건 지우기
            </ButtonLink>
          )}
        </div>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[14px] text-sub">{data ? `전체 ${data.totalElements}건` : ''}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span id="csv-hint" className="text-[13px] text-sub">
            CSV에는 발급일 기간만 적용돼요. 상태는 모두 들어가요.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleDownload()}
            disabled={download.pending}
            aria-describedby="csv-hint"
          >
            {download.pending ? '내려받는 중' : 'CSV 내려받기'}
          </Button>
        </div>
      </div>
      {download.error !== null && (
        <Notice className="mt-3" requestId={supportRequestId(download.error)}>
          {`CSV를 내려받지 못했어요. ${ledgerErrorMessage(download.error)}`}
        </Notice>
      )}

      {done && (
        // 포커스만 받고(tabIndex -1) Tab 순서에는 넣지 않는다.
        <div ref={doneRef} tabIndex={-1} className="mt-4 outline-hidden">
          <Notice tone="success">{done}</Notice>
        </div>
      )}

      {!data && !error && (
        <p role="status" className="py-24 text-center text-sub">
          패스 목록을 불러오고 있어요.
        </p>
      )}

      {error && (
        <div className="mt-6">
          <Notice requestId={supportRequestId(error)}>
            {data
              ? `최신 내용을 불러오지 못했어요. 아래 목록은 이전 내용일 수 있어요. (${ledgerErrorMessage(error)})`
              : ledgerErrorMessage(error)}
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

      {data && data.totalElements === 0 && (
        <EmptyState
          title={filtered ? '조건에 맞는 패스가 없어요' : '아직 발급한 패스가 없어요'}
          className="py-16"
        >
          {!filtered && <ButtonLink to="/partner/passes/new">패스 발급하기</ButtonLink>}
        </EmptyState>
      )}

      {/* 패스는 있는데 이 페이지가 비어 있다. 없는 페이지로 들어왔거나, 마지막 줄을 취소해 페이지가 줄었다. */}
      {data && data.totalElements > 0 && data.items.length === 0 && (
        <EmptyState
          title="이 페이지에는 패스가 없어요"
          description={`조건에 맞는 패스는 모두 ${data.totalElements}건이에요.`}
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
          <LedgerList
            items={data.items}
            onRegenerateLink={setLinkTarget}
            onCancel={setCancelTarget}
          />
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            onChange={(nextPage) => setSearchParams(toSearch({ ...filters, page: nextPage }))}
            disabled={showingPreviousPage}
            className="mt-6"
          />
        </div>
      )}

      <PassLinkModal pass={linkTarget} onClose={() => setLinkTarget(null)} />
      <PassCancelModal pass={cancelTarget} onClose={() => setCancelTarget(null)} onDone={setDone} />
    </>
  )
}

function Heading() {
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">패스 목록</h1>
      <p className="mt-1 text-sub">
        발급한 패스를 봐요. 링크를 잃어버린 학부모님께는 링크를 새로 만들어 보내 주세요.
      </p>
    </>
  )
}

// 넓은 화면에서는 머리 행이 있는 표처럼 칸을 맞추고, 좁은 화면(860px 이하)에서는 한 패스를 한 덩어리로 쌓는다.
// 좁은 화면에는 머리 행이 없으므로 칸마다 이름표를 붙이고, 넓은 화면에서는 그 이름표를 화면 낭독기에만 남긴다.
const columns =
  'min-[861px]:grid min-[861px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] min-[861px]:items-center min-[861px]:gap-4'
const cellLabel = 'text-sub min-[861px]:sr-only'

type LedgerListProps = {
  items: LedgerItem[]
  onRegenerateLink: (item: LedgerItem) => void
  onCancel: (item: LedgerItem) => void
}

/** 장부의 줄 목록. 학부모 번호는 장부에 없다(백엔드 ADR-0035). */
function LedgerList({ items, onRegenerateLink, onCancel }: LedgerListProps) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg bg-card">
      <div
        aria-hidden="true"
        className={`hidden bg-field px-[22px] py-2.5 text-[13px] font-semibold text-sub ${columns}`}
      >
        <span>학생</span>
        <span>발급일</span>
        <span>사용 기한</span>
        <span>결제</span>
        <span className="w-[218px]" />
      </div>
      <ul aria-label="패스 목록">
        {items.map((item) => (
          <LedgerRow
            key={item.id}
            item={item}
            onRegenerateLink={onRegenerateLink}
            onCancel={onCancel}
          />
        ))}
      </ul>
    </div>
  )
}

function LedgerRow({
  item,
  onRegenerateLink,
  onCancel,
}: { item: LedgerItem } & Omit<LedgerListProps, 'items'>) {
  const status = toPassStatus(item.state)
  const method = isPaymentMethod(item.paymentMethod)
    ? paymentMethodLabels[item.paymentMethod]
    : item.paymentMethod

  return (
    <li
      className={`grid gap-2 border-t border-line px-[22px] py-4 first:border-t-0 min-[861px]:first:border-t ${columns}`}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="font-bold">{item.studentName}</span>
        {status ? <Pill status={status} /> : <Pill status="used">{item.state}</Pill>}
        <span className="basis-full text-[13px] text-sub tabular-nums">
          <span className="sr-only">패스 번호 </span>
          {item.passNo}
        </span>
      </div>
      <dl className="contents text-[14px] tabular-nums">
        <div className="flex gap-2 min-[861px]:block">
          <dt className={cellLabel}>발급일</dt>
          {/* 발급일은 서버가 정한 한국 날짜(issuedOn)를 그대로 쓴다. 발급 시각(issuedAt)을 날짜로 바꾸면 한국 0~9시 발급이 전날로 보인다. */}
          <dd>{formatDate(item.issuedOn)}</dd>
        </div>
        <div className="flex gap-2 min-[861px]:block">
          <dt className={cellLabel}>사용 기한</dt>
          <dd>{`${formatDate(item.expiresOn)}까지`}</dd>
        </div>
        <div className="flex gap-2 min-[861px]:block">
          <dt className={cellLabel}>결제</dt>
          <dd>
            {`${formatWon(item.paidAmount)} ${method}`}
            <span className="block text-[13px] text-sub">{`${formatDate(item.paidOn)} 결제`}</span>
          </dd>
        </div>
      </dl>
      <div className="mt-1 flex flex-wrap gap-2 min-[861px]:mt-0 min-[861px]:w-[218px] min-[861px]:justify-end">
        {canRegenerateLink(item.state) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRegenerateLink(item)}
            aria-label={`링크 새로 만들기 (${item.studentName}, ${item.passNo})`}
          >
            링크 새로 만들기
          </Button>
        )}
        {canCancel(item.state) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCancel(item)}
            aria-label={`패스 취소 (${item.studentName}, ${item.passNo})`}
          >
            취소
          </Button>
        )}
      </div>
    </li>
  )
}
