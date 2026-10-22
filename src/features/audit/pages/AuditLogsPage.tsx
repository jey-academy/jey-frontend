import { Link, useSearchParams } from 'react-router'
import { ApiError, supportRequestId } from '@/shared/api'
import { useMe } from '@/shared/auth'
import { useCampuses } from '@/shared/campus'
import { isPeriodDate, periodErrors, readPage, type Period } from '@/shared/lib'
import { studentPath } from '@/shared/paths'
import {
  Button,
  ButtonLink,
  EmptyState,
  Notice,
  Pagination,
  PeriodFields,
  Pill,
  Segmented,
  SelectField,
  Table,
  Td,
  TextField,
  Th,
  usePeriodSearch,
} from '@/shared/ui'
import { useAuditLogs, type AuditLog, type AuditLogFilters } from '../api'
import {
  actionLabel,
  detailLines,
  knownActions,
  outcomeLabel,
  targetLabel,
  type Outcome,
} from '../labels'
import { formatOccurredAt } from '../period'

const PATH = '/admin/audit-logs'
// 결과 칸의 "전체". 행위 칸의 "전체"는 빈 값이다(행위 이름과 겹치지 않게).
const ALL = 'all'

const linkClassName =
  'rounded-btn-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
// 줄 안의 "이 계정만", "이 대상만". 값보다 눈에 덜 띄게 한다.
const narrowLinkClassName = `ml-2 text-[13px] text-sub underline ${linkClassName}`

/**
 * 주소나 입력칸의 글자를 1 이상의 정수로 읽는다. 숫자만으로 된 값이 아니거나 0이면 없는 것으로 본다.
 * 15자리까지만 받는다. 그보다 길면 Number로 바꿀 때 값이 달라질 수 있다(계정 ID 칸의 maxLength와 맞춘다).
 */
function readId(value: string | null): number | undefined {
  const id = value !== null && /^\d{1,15}$/.test(value) ? Number(value) : 0
  return id > 0 ? id : undefined
}

/**
 * 주소의 조건을 읽는다. 모양이 맞지 않는 값은 없는 조건으로 본다(주소를 손으로 고친 경우).
 * 행위와 대상 종류는 서버의 타입으로는 아무 문자열이지만, 지금 이름의 꼴(소문자·숫자·하이픈, 행위는 "모듈.사건"이라 점 포함)만 받는다.
 * 서버가 다른 꼴의 이름을 쓰면 그 조건이 조용히 버려지므로 여기를 같이 고친다.
 * 길이는 터무니없는 값을 보내지 않으려는 상한이다. page는 서버의 상한을 넘으면 첫 페이지로 본다(readPage).
 */
function readFilters(params: URLSearchParams): AuditLogFilters {
  const outcome = params.get('outcome')
  const action = params.get('action')
  const targetType = params.get('targetType')
  const from = params.get('from')
  const to = params.get('to')
  const validTargetType =
    targetType !== null && /^[a-z][a-z0-9-]{0,30}$/.test(targetType) ? targetType : undefined

  // 키를 모두 적어야 하는 타입이다. 조건이 늘었는데 여기서 읽는 것을 빠뜨리면 컴파일 에러가 난다.
  const filters: { [K in keyof Required<AuditLogFilters>]: AuditLogFilters[K] } = {
    outcome: outcome === 'DONE' || outcome === 'DENIED' ? outcome : undefined,
    actorId: readId(params.get('actorId')),
    action: action !== null && /^[a-z0-9][a-z0-9.-]{0,99}$/.test(action) ? action : undefined,
    targetType: validTargetType,
    // 대상의 ID만 보내면 서버가 거부한다. 종류가 없으면 ID도 버린다.
    targetId: validTargetType ? readId(params.get('targetId')) : undefined,
    from: from !== null && isPeriodDate(from) ? from : undefined,
    to: to !== null && isPeriodDate(to) ? to : undefined,
    page: readPage(params.get('page')),
  }
  return filters
}

/**
 * 조건을 주소로 바꾼다. 주소에는 이 화면이 쓰는 값만 남긴다.
 * 조건에는 이름이나 전화번호가 없어(ID, 행위 이름, 날짜) 주소에 두어도 된다.
 */
function toSearch({ page, ...rest }: AuditLogFilters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) params.set(key, String(value))
  }
  // 첫 페이지는 주소에 적지 않는다. 그래서 조건이 없으면 주소가 비고 "조건 지우기"도 숨는다.
  if (page > 0) params.set('page', String(page))
  const search = params.toString()
  return search ? `?${search}` : ''
}

function hrefOf(filters: AuditLogFilters): string {
  return `${PATH}${toSearch(filters)}`
}

type Draft = { actorId: string; action: string; from: string; to: string }
type DraftErrors = Partial<Record<keyof Draft, string>>

function draftOf(filters: AuditLogFilters): Draft {
  return {
    actorId: filters.actorId === undefined ? '' : String(filters.actorId),
    action: filters.action ?? '',
    from: filters.from ?? '',
    to: filters.to ?? '',
  }
}

/** 입력칸의 오류 문구. 기간 칸 규칙은 `periodErrors`, `badInput`은 기간 칸에 날짜로 읽히지 않는 글자가 있는지다. */
function draftErrors(draft: Draft, badInput: Record<keyof Period, boolean>): DraftErrors {
  const errors: DraftErrors = periodErrors(draft, badInput)
  const actorId = draft.actorId.trim()
  if (actorId !== '' && readId(actorId) === undefined) {
    errors.actorId = '계정 ID는 1 이상의 숫자로 넣어 주세요.'
  }
  return errors
}

// 화면의 조건 칸은 이 경우를 막는다. 주소를 손으로 고쳤을 때 온다. 다시 불러와도 같은 답이다.
const INVALID_PERIOD = 'AUDIT_INVALID_PERIOD'

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '기록을 불러오지 못했어요.'
  if (error.code === INVALID_PERIOD)
    return '끝일이 시작일보다 앞이에요. 기간 칸을 고친 뒤 조회해 주세요.'
  return error.message
}

/**
 * 감사 로그. 관리자만 본다. 누가 언제 무엇에 무엇을 했는지, 어떤 시도가 거부됐는지를 최신순으로 보여준다.
 * 거부된 시도를 계정별로 모아 보는 것이 주된 쓰임새다(한 계정이 되풀이하면 가린 번호를 알아내려는 것일 수 있다).
 * 조건과 페이지는 주소에 둔다. 새로고침하거나 뒤로 가기로 돌아와도 보던 자리가 유지된다.
 */
export function AuditLogsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readFilters(searchParams)
  const { data: me } = useMe()
  const campuses = useCampuses()
  const logs = useAuditLogs(filters)
  // 입력칸(계정, 행위, 기간)의 값은 "조회"를 눌러야 조건으로 적용된다. 입력칸이 없는 조건(결과, 대상)은 지금 값을 이어받는다.
  // 줄의 "이 계정만"과 조건 지우기는 주소를 바로 바꾸고, 칸은 그 조건으로 맞춰진다.
  const { draft, setDraft, errors, periodRef, apply, handleSubmit, periodRejected } =
    usePeriodSearch({
      filters,
      toSearch,
      draftOf,
      validate: draftErrors,
      fromDraft: (draft, { outcome, targetType, targetId }) => ({
        outcome,
        targetType,
        targetId,
        actorId: readId(draft.actorId.trim()),
        action: draft.action || undefined,
        from: draft.from || undefined,
        to: draft.to || undefined,
      }),
      query: logs,
      invalidPeriodCodes: [INVALID_PERIOD],
    })

  const campusNames = new Map(campuses.data?.map((campus) => [campus.id, campus.name]))

  function handleOutcomeChange(value: string) {
    // 입력칸에 넣다 만 값도 함께 적용한다. 화면에 보이는 조건과 표가 어긋나지 않게 한다.
    // 틀린 값이 있으면 결과도 바뀌지 않는다.
    apply({ outcome: value === ALL ? undefined : (value as Outcome) })
  }

  function change(key: keyof Draft, value: string) {
    setDraft((before) => ({ ...before, [key]: value }))
  }

  const data = logs.data
  const error = logs.error
  const filtered = toSearch({ ...filters, page: 0 }) !== ''
  // 같은 조건의 다른 페이지를 받는 동안 보여주는 이전 페이지인지
  const showingPreviousPage = logs.isPlaceholderData

  const actionOptions = [...knownActions]
  // 주소의 행위가 아는 이름이 아니어도 선택지로 보여준다. 빼 버리면 걸러진 표인데 아무것도 고르지 않은 것처럼 보인다.
  if (filters.action && !actionOptions.some((option) => option.value === filters.action)) {
    actionOptions.push({ value: filters.action, label: filters.action })
  }

  function actorCell(log: AuditLog) {
    if (log.actorId === null) return <span className="text-sub">로그인 없음</span>
    return (
      <>
        <span className="tabular-nums">{`계정 ${log.actorId}`}</span>
        {me?.id === log.actorId && <span className="text-sub"> (나)</span>}
        {filters.actorId !== log.actorId && (
          <Link
            to={hrefOf({ ...filters, actorId: log.actorId, page: 0 })}
            aria-label={`이 계정만 보기 (계정 ${log.actorId})`}
            className={narrowLinkClassName}
          >
            이 계정만
          </Link>
        )}
      </>
    )
  }

  function targetCell(log: AuditLog) {
    if (log.targetType === null) return <span className="text-sub">-</span>
    const label = targetLabel(log.targetType, log.targetId)
    const narrowed =
      filters.targetType === log.targetType && filters.targetId === (log.targetId ?? undefined)
    return (
      <>
        {log.targetType === 'student' && log.targetId !== null ? (
          <Link to={studentPath(log.targetId)} className={`tabular-nums ${linkClassName}`}>
            {label}
          </Link>
        ) : (
          <span className="tabular-nums">{label}</span>
        )}
        {log.targetId !== null && !narrowed && (
          <Link
            to={hrefOf({
              ...filters,
              targetType: log.targetType,
              targetId: log.targetId,
              page: 0,
            })}
            aria-label={`이 대상만 보기 (${label})`}
            className={narrowLinkClassName}
          >
            이 대상만
          </Link>
        )}
      </>
    )
  }

  return (
    <>
      <div>
        <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">기록</h1>
        <p className="mt-1 text-sub">
          누가 언제 무엇을 했는지, 어떤 시도가 거부됐는지 봐요. 이름과 전화번호는 남지 않아요.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        role="search"
        noValidate
        className="mt-7 flex flex-wrap items-start gap-x-4 gap-y-4"
      >
        <Segmented
          label="결과"
          name="outcomeFilter"
          value={filters.outcome ?? ALL}
          onChange={handleOutcomeChange}
          options={[
            { value: ALL, label: '전체' },
            { value: 'DONE', label: outcomeLabel('DONE') },
            { value: 'DENIED', label: outcomeLabel('DENIED') },
          ]}
          className="w-full max-w-[300px]"
        />
        <TextField
          label="계정 ID"
          name="actorId"
          value={draft.actorId}
          onChange={(event) => change('actorId', event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          maxLength={15}
          error={errors.actorId}
          className="w-[120px]"
        />
        <SelectField
          label="행위"
          name="action"
          value={draft.action}
          onChange={(event) => change('action', event.target.value)}
          className="w-[250px]"
        >
          <option value="">전체</option>
          {actionOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <PeriodFields
          ref={periodRef}
          labels={{ from: '시작일', to: '끝일' }}
          value={draft}
          onChange={(period) => setDraft((before) => ({ ...before, ...period }))}
          errors={errors}
        />
        {/* TextField의 이름표 높이만큼 내려 입력칸과 나란히 둔다. */}
        <div className="mt-[27px] flex gap-2">
          <Button type="submit" className="h-[50px]" disabled={logs.isFetching}>
            {logs.isFetching ? '조회 중' : '조회'}
          </Button>
          {filtered && (
            <ButtonLink to={PATH} variant="ghost" className="h-[50px]">
              조건 지우기
            </ButtonLink>
          )}
        </div>
      </form>

      {/* 대상 조건은 입력칸이 없다(줄의 "이 대상만"이나 주소로만 걸린다). 걸려 있다는 것과 푸는 길을 여기서 보여준다. */}
      {filters.targetType && (
        <p className="mt-5 text-[14px]">
          <span className="font-semibold">
            {`${targetLabel(filters.targetType, filters.targetId)}의 기록만 보고 있어요.`}
          </span>
          <Link
            to={hrefOf({ ...filters, targetType: undefined, targetId: undefined, page: 0 })}
            className={narrowLinkClassName}
          >
            대상 조건 풀기
          </Link>
        </p>
      )}

      {campuses.error && (
        <div className="mt-6">
          <Notice requestId={supportRequestId(campuses.error)}>
            지점 이름을 불러오지 못했어요. 표의 지점이 번호로 보여요.
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
          기록을 불러오고 있어요.
        </p>
      )}

      {error && (
        <div className="mt-6">
          <Notice requestId={supportRequestId(error)}>
            {data
              ? // 왜 못 받았는지도 알린다. 권한이 없어진 것과 연결이 끊긴 것은 할 일이 다르다.
                `최신 내용을 불러오지 못했어요. 아래 표는 이전 내용일 수 있어요. (${errorMessage(error)})`
              : errorMessage(error)}
          </Notice>
          {!periodRejected && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => void logs.refetch()}
              disabled={logs.isFetching}
            >
              {logs.isFetching ? '불러오는 중' : '다시 불러오기'}
            </Button>
          )}
        </div>
      )}

      {data && data.totalElements === 0 && (
        <EmptyState
          title={filtered ? '조건에 맞는 기록이 없어요' : '남은 기록이 없어요'}
          className="py-16"
        />
      )}

      {/* 기록은 있는데 이 페이지가 비어 있다. 없는 페이지로 들어온 경우다. 기록이 없다고 하면 안 된다. */}
      {data && data.totalElements > 0 && data.items.length === 0 && (
        <EmptyState
          title="이 페이지에는 기록이 없어요"
          description={`조건에 맞는 기록은 모두 ${data.totalElements}건이에요.`}
          className="py-16"
        >
          <ButtonLink to={hrefOf({ ...filters, page: 0 })}>첫 페이지로</ButtonLink>
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        // 다른 페이지를 받는 동안에는 이전 페이지가 보인다. 숫자와 표를 함께 흐리게 해서 아직 바뀌지 않았음을 알린다.
        <div
          className={showingPreviousPage ? 'opacity-60' : undefined}
          aria-busy={showingPreviousPage}
        >
          <p className="mt-7 text-right text-[14px] text-sub">{`전체 ${data.totalElements}건`}</p>
          <Table caption="기록 목록" wide className="mt-4">
            <thead>
              <tr>
                <Th>시각</Th>
                <Th>계정</Th>
                <Th>행위</Th>
                <Th>결과</Th>
                <Th>대상</Th>
                <Th>지점</Th>
                <Th>내용</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((log) => {
                const lines = detailLines(log.detail)
                return (
                  <tr key={log.id}>
                    <Td className="text-sub tabular-nums">{formatOccurredAt(log.occurredAt)}</Td>
                    <Td>{actorCell(log)}</Td>
                    <Td className="font-semibold">{actionLabel(log.action)}</Td>
                    <Td>
                      {/* Pill의 상태 이름은 패스의 것이다. 색만 빌려 쓴다(거부는 눈에 띄게, 그 밖은 차분하게). */}
                      <Pill status={log.outcome === 'DENIED' ? 'expired' : 'used'}>
                        {outcomeLabel(log.outcome)}
                      </Pill>
                    </Td>
                    <Td>{targetCell(log)}</Td>
                    <Td className="text-sub">
                      {log.campusId === null
                        ? '-'
                        : // 이름을 모르면(받는 중, 받지 못함, 목록에 없는 지점) ID로 보여준다. '-'는 지점과 무관한 기록에만 쓴다.
                          (campusNames.get(log.campusId) ?? `지점 ${log.campusId}`)}
                    </Td>
                    <Td className="text-[14px] text-sub">
                      {lines.length === 0
                        ? '-'
                        : lines.map((line) =>
                            line.alert ? (
                              // 색만으로 알리지 않는다. strong이라 화면 낭독기도 강조로 읽는다.
                              <strong key={line.text} className="block font-bold text-pill-expired">
                                {line.text}
                              </strong>
                            ) : (
                              <span key={line.text} className="block">
                                {line.text}
                              </span>
                            ),
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
