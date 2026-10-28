import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { ApiError, supportRequestId } from '@/shared/api'
import {
  formatDate,
  formatPercent,
  formatWon,
  isPeriodDate,
  periodErrors,
  readPage,
} from '@/shared/lib'
import {
  campusPassesPath,
  campusPassIssuePath,
  parseStudentId,
  studentPath,
  STUDENTS_PATH,
} from '@/shared/paths'
import {
  Button,
  ButtonLink,
  EmptyState,
  FilterChips,
  Notice,
  Pagination,
  passStatusLabels,
  PeriodFields,
  Pill,
  usePeriodSearch,
} from '@/shared/ui'
import {
  useCampusPasses,
  useIssueStudent,
  type CampusPassFilters,
  type CampusPassItem,
} from '../api'
import { CampusPassTabs } from '../components/CampusPassTabs'
import { PassCancelModal } from '../components/PassCancelModal'
import { PassLinkModal } from '../components/PassLinkModal'
import { canCancel, canRegenerateLink, isPassState, passStates, toPassStatus } from '../passState'
import { isPaymentMethod, paymentMethodLabels } from '../paymentMethods'

// 상태 칩의 "전체". 서버의 상태 이름과 겹치지 않는다.
const ALL = 'all'
/** 기간이 틀렸다는 답. 화면의 칸이 막고 범위 밖 날짜는 readFilters가 버리지만, 주소에서 시작일과 끝일을 뒤바꾸면 온다. */
const INVALID_PERIOD = 'DONGTANPASS_INVALID_PERIOD'
/** 주소의 학생이 없다는 답(학생 조회) */
const STUDENT_NOT_FOUND = 'MEMBER_STUDENT_NOT_FOUND'

const statusOptions = [
  { value: ALL, label: '전체' },
  ...passStates.map((state) => ({
    value: state,
    label: passStatusLabels[toPassStatus(state) ?? 'valid'],
  })),
]

const linkClassName =
  'rounded-btn-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/** 주소의 조건을 읽는다. 모양이 맞지 않는 값은 없는 조건으로 본다(주소를 손으로 고친 경우). */
function readFilters(params: URLSearchParams): CampusPassFilters {
  const status = params.get('status')
  const from = params.get('from')
  const to = params.get('to')
  // 키를 모두 적어야 하는 타입이다. 조건이 늘었는데 여기서 읽는 것을 빠뜨리면 컴파일 에러가 난다.
  const filters: { [K in keyof Required<CampusPassFilters>]: CampusPassFilters[K] } = {
    studentId: parseStudentId(params.get('studentId') ?? undefined) ?? undefined,
    status: status !== null && isPassState(status) ? status : undefined,
    from: from !== null && isPeriodDate(from) ? from : undefined,
    to: to !== null && isPeriodDate(to) ? to : undefined,
    page: readPage(params.get('page')),
  }
  return filters
}

/** 조건을 주소로 바꾼다. 조건에는 이름이나 전화번호가 없어(학생 ID, 상태, 날짜) 주소에 두어도 된다. */
function toSearch({ page, ...rest }: CampusPassFilters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) params.set(key, String(value))
  }
  if (page > 0) params.set('page', String(page))
  const search = params.toString()
  return search ? `?${search}` : ''
}

function listErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '패스 목록을 불러오지 못했어요.'
  if (error.code === INVALID_PERIOD) return '기간이 맞지 않아요. 기간 칸을 고친 뒤 조회해 주세요.'
  return error.message
}

/**
 * JEY 발급 목록(관리자). JEY가 발급한 패스를 상태와 발급일로 걸러 보고, 쓰지 않은 패스의 링크를 새로 만들거나 취소한다.
 * 학생 상세에서 오면 `studentId`로 그 학생의 패스만 본다. 조건과 페이지는 주소에 둔다(연계 학원 장부와 같다).
 */
export function CampusPassesPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readFilters(searchParams)
  const list = useCampusPasses(filters)

  const [linkTarget, setLinkTarget] = useState<CampusPassItem | null>(null)
  const [cancelTarget, setCancelTarget] = useState<CampusPassItem | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const doneRef = useRef<HTMLDivElement>(null)

  // 학생과 상태는 지금 값을 이어받는다(칩이 apply로 덮는다). 다른 조건이나 페이지로 옮기면 취소 안내를 지운다.
  const { draft, setDraft, errors, periodRef, apply, handleSubmit, periodRejected } =
    usePeriodSearch({
      filters,
      toSearch,
      draftOf: ({ from, to }) => ({ from: from ?? '', to: to ?? '' }),
      validate: periodErrors,
      fromDraft: ({ from, to }, { studentId, status }) => ({
        studentId,
        status,
        from: from || undefined,
        to: to || undefined,
      }),
      query: list,
      invalidPeriodCodes: [INVALID_PERIOD],
      onLocationChange: () => setDone(null),
    })

  // 취소하면 그 줄의 버튼이 사라진다. 남긴 안내로 포커스를 옮긴다(장부와 같다).
  useEffect(() => {
    if (!done) return
    const timer = window.setTimeout(() => doneRef.current?.focus())
    return () => window.clearTimeout(timer)
  }, [done])

  const data = list.data
  const error = list.error
  // 학생을 뺀 조건(상태, 기간)이 걸려 있는지. 학생 조건은 위의 안내에서 따로 푼다.
  const filtered = toSearch({ ...filters, studentId: undefined, page: 0 }) !== ''
  const showingPreviousPage = list.isPlaceholderData

  return (
    <>
      <CampusPassTabs />
      <Heading />

      {filters.studentId !== undefined && <StudentFilter studentId={filters.studentId} />}

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
          onChange={(value) => apply({ status: isPassState(value) ? value : undefined })}
          className="w-full"
        />
        <PeriodFields
          ref={periodRef}
          labels={{ from: '발급일 시작', to: '발급일 끝' }}
          value={draft}
          onChange={setDraft}
          errors={errors}
        />
        <div className="mt-[27px] flex gap-2">
          <Button type="submit" className="h-[50px]" disabled={list.isFetching}>
            {list.isFetching ? '조회 중' : '조회'}
          </Button>
          {filtered && (
            <ButtonLink
              to={campusPassesPath(filters.studentId)}
              variant="ghost"
              className="h-[50px]"
            >
              조건 지우기
            </ButtonLink>
          )}
        </div>
      </form>

      <p className="mt-6 text-[14px] text-sub">{data ? `전체 ${data.totalElements}건` : ''}</p>

      {done && (
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
              ? `최신 내용을 불러오지 못했어요. 아래 목록은 이전 내용일 수 있어요. (${listErrorMessage(error)})`
              : listErrorMessage(error)}
          </Notice>
          {!periodRejected && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => void list.refetch()}
              disabled={list.isFetching}
            >
              {list.isFetching ? '불러오는 중' : '다시 불러오기'}
            </Button>
          )}
        </div>
      )}

      {data && data.totalElements === 0 && (
        <EmptyState
          title={filtered ? '조건에 맞는 패스가 없어요' : '아직 발급한 제이G패스가 없어요'}
          description={filtered ? undefined : '학생 상세에서 패스 발급을 눌러 발급해요.'}
          className="py-16"
        >
          {!filtered && filters.studentId === undefined && (
            <ButtonLink to={STUDENTS_PATH}>학생 목록으로</ButtonLink>
          )}
        </EmptyState>
      )}

      {data && data.totalElements > 0 && data.items.length === 0 && (
        <EmptyState
          title="이 페이지에는 패스가 없어요"
          description={`조건에 맞는 패스는 모두 ${data.totalElements}건이에요.`}
          className="py-16"
        >
          <ButtonLink to={`${location.pathname}${toSearch({ ...filters, page: 0 })}`}>
            첫 페이지로
          </ButtonLink>
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        <div
          className={showingPreviousPage ? 'opacity-60' : undefined}
          aria-busy={showingPreviousPage}
        >
          <PassList
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

      <PassLinkModal issuer="campus" pass={linkTarget} onClose={() => setLinkTarget(null)} />
      <PassCancelModal
        issuer="campus"
        pass={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onDone={setDone}
      />
    </>
  )
}

function Heading() {
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">
        제이G패스 (JEY 발급)
      </h1>
      <p className="mt-1 text-sub">
        JEY가 발급한 패스를 봐요. 학생은 연계 학원에 새로 등록할 때 이 패스로 할인받아요.
      </p>
    </>
  )
}

/** 한 학생의 패스만 볼 때의 안내. 그 학생에게 바로 발급하거나 모든 학생으로 돌아간다. */
function StudentFilter({ studentId }: { studentId: number }) {
  const student = useIssueStudent(studentId)
  const name = student.data?.name
  const error = student.error
  // 주소의 학생이 없다. 목록이 비어 "아직 발급한 패스가 없어요"로만 보이면 없는 학생을 정상처럼 안내하게 된다.
  const missing = error instanceof ApiError && error.code === STUDENT_NOT_FOUND
  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-field px-[18px] py-3.5 text-[15px]">
        <p className="mr-auto">
          {missing ? (
            '주소의 학생을 찾을 수 없어요. 없는 학생이거나 주소가 잘못됐을 수 있어요.'
          ) : name ? (
            <>
              <Link to={studentPath(studentId)} className={`font-semibold ${linkClassName}`}>
                {name}
              </Link>
              {' 학생의 패스만 보고 있어요.'}
            </>
          ) : (
            '한 학생의 패스만 보고 있어요.'
          )}
        </p>
        {student.data?.status === 'ENROLLED' && (
          <ButtonLink to={campusPassIssuePath(studentId)} size="sm">
            이 학생에게 발급
          </ButtonLink>
        )}
        <ButtonLink to={campusPassesPath()} variant="ghost" size="sm">
          모든 학생 보기
        </ButtonLink>
      </div>
      {/* 받아 둔 이름이 없는데 실패했다. 발급 버튼이 까닭 없이 사라지지 않게 알리고 다시 받게 한다. */}
      {error && !missing && !student.data && (
        <div className="mt-3">
          <Notice requestId={supportRequestId(error)}>학생 정보를 불러오지 못했어요.</Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void student.refetch()}
            disabled={student.isFetching}
          >
            {student.isFetching ? '불러오는 중' : '학생 정보 다시 불러오기'}
          </Button>
        </div>
      )}
    </>
  )
}

// 넓은 화면에서는 머리 행이 있는 표처럼 칸을 맞추고, 좁은 화면(860px 이하)에서는 한 패스를 한 덩어리로 쌓는다(장부와 같다).
const columns =
  'min-[861px]:grid min-[861px]:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.6fr)_auto] min-[861px]:items-center min-[861px]:gap-4'
const cellLabel = 'text-sub min-[861px]:sr-only'

type PassListProps = {
  items: CampusPassItem[]
  onRegenerateLink: (item: CampusPassItem) => void
  onCancel: (item: CampusPassItem) => void
}

/** 목록의 줄. 학부모 번호는 없다. 할인율은 발급 때 남긴 값이다. */
function PassList({ items, onRegenerateLink, onCancel }: PassListProps) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg bg-card">
      <div
        aria-hidden="true"
        className={`hidden bg-field px-[22px] py-2.5 text-[13px] font-semibold text-sub ${columns}`}
      >
        <span>학생</span>
        <span>발급일</span>
        <span>사용 기한</span>
        <span>근거 결제</span>
        <span>할인</span>
        <span className="w-[218px]" />
      </div>
      <ul aria-label="패스 목록">
        {items.map((item) => (
          <PassRow
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

function PassRow({
  item,
  onRegenerateLink,
  onCancel,
}: { item: CampusPassItem } & Omit<PassListProps, 'items'>) {
  const status = toPassStatus(item.state)
  const method = isPaymentMethod(item.paymentMethod)
    ? paymentMethodLabels[item.paymentMethod]
    : item.paymentMethod

  return (
    <li
      className={`grid gap-2 border-t border-line px-[22px] py-4 first:border-t-0 min-[861px]:first:border-t ${columns}`}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Link to={studentPath(item.studentId)} className={`font-bold ${linkClassName}`}>
          {item.studentName}
        </Link>
        {status ? <Pill status={status} /> : <Pill status="used">{item.state}</Pill>}
        <span className="basis-full text-[13px] text-sub tabular-nums">
          <span className="sr-only">패스 번호 </span>
          {item.passNo}
        </span>
      </div>
      <dl className="contents text-[14px] tabular-nums">
        <div className="flex gap-2 min-[861px]:block">
          <dt className={cellLabel}>발급일</dt>
          {/* 서버가 정한 한국 날짜(issuedOn)를 그대로 쓴다. 발급 시각(issuedAt)을 날짜로 바꾸면 한국 0~9시 발급이 전날로 보인다. */}
          <dd>{formatDate(item.issuedOn)}</dd>
        </div>
        <div className="flex gap-2 min-[861px]:block">
          <dt className={cellLabel}>사용 기한</dt>
          <dd>{`${formatDate(item.expiresOn)}까지`}</dd>
        </div>
        <div className="flex gap-2 min-[861px]:block">
          <dt className={cellLabel}>근거 결제</dt>
          <dd>
            {`${formatWon(item.paidAmount)} ${method}`}
            <span className="block text-[13px] text-sub">{`${formatDate(item.paidOn)} 결제`}</span>
          </dd>
        </div>
        <div className="flex gap-2 min-[861px]:block">
          <dt className={cellLabel}>할인</dt>
          <dd>{formatPercent(item.discountRate)}</dd>
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
