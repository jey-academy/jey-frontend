import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ApiError, supportRequestId } from '@/shared/api'
import { readCampusId, useCampuses, useClasses } from '@/shared/campus'
import { readPage } from '@/shared/lib'
import {
  Button,
  ButtonLink,
  EmptyState,
  Notice,
  Pagination,
  Pill,
  Segmented,
  Table,
  Td,
  TextField,
  Th,
} from '@/shared/ui'
import { useStudents } from '../api'
import { RegisteredNoticeBanner } from '../components/RegisteredNoticeBanner'
import { contactOwnerLabel, gradeLabel, statusLabel } from '../labels'
import { studentPath } from '@/shared/paths'

const ALL = 'all'
// 서버가 받는 이름의 최대 길이
const NAME_MAX_LENGTH = 50

/** 찾기를 눌러 적용한 조건. 둘 중 하나만 있거나 둘 다 없다. */
type SearchTerm = { name?: string; phoneLast4?: string }

/**
 * 입력칸의 값을 검색 조건으로 읽는다. 받을 수 없는 값이면 null이다.
 * - 숫자 4자리면 전화번호 뒷자리로 찾는다(학부모나 학생 본인 번호). 사이의 공백과 -는 빼고, 전각 숫자(５６７８)도 받는다.
 * - 숫자로만 된 다른 값(567, 12345)은 받지 않는다. 숫자로만 된 이름은 없으니 뒷자리를 덜 쳤거나 더 친 것이다.
 *   이름으로 보내면 "이름은 앞부분부터…"라는 엉뚱한 안내가 뜬다.
 * - 그 밖에 숫자가 모두 합쳐 4개 이상이면 받지 않는다. 전화번호 전체나 일부일 수 있다. 이름으로 보내면 아무도 나오지 않고,
 *   번호가 캐시 키(조회 조건)에 남는다. 사이에 무엇을 끼워 넣었는지는 보지 않는다(010.1234.5678, (010)1234, 5.6.7.8).
 *   구분 기호를 하나씩 따지면 빠지는 모양이 생긴다. 이름에 숫자가 4개 이상 들어가는 경우는 없다고 본다.
 *   숫자는 다른 문자 체계의 숫자(٥٦٧٨)까지 센다. NFKC는 이런 숫자를 0~9로 바꾸지 않는다.
 * - 나머지는 이름의 앞부분이다.
 */
function readSearchTerm(text: string): SearchTerm | null {
  const trimmed = text.trim()
  const normalized = trimmed.normalize('NFKC')
  const compact = normalized.replace(/[\s-]/g, '')
  if (/^\d{4}$/.test(compact)) return { phoneLast4: compact }
  if (/^\p{Nd}+$/u.test(compact)) return null
  if ((normalized.match(/\p{Nd}/gu) ?? []).length >= 4) return null
  return trimmed === '' ? {} : { name: trimmed }
}

/**
 * 학생 목록. 직원과 관리자가 본다. 직원도 다른 지점의 학생을 본다.
 * 지점과 페이지는 주소에 둔다. 새로고침하거나 다른 화면에 갔다 와도 보던 자리가 유지된다.
 * 이름과 전화번호 뒷자리는 주소에 두지 않는다. 브라우저 기록과 접근 로그에 남기 때문이다.
 */
export function StudentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const campusId = readCampusId(searchParams.get('campusId'))
  const page = readPage(searchParams.get('page'))
  // 입력칸에 치고 있는 글자와, "찾기"를 눌러 실제로 적용한 조건을 따로 둔다.
  const [termInput, setTermInput] = useState('')
  const [term, setTerm] = useState<SearchTerm>({})
  const [termError, setTermError] = useState<string>()
  const campuses = useCampuses()
  const classes = useClasses()
  const students = useStudents({ campusId, ...term, page })

  const campusNames = new Map(campuses.data?.map((campus) => [campus.id, campus.name]))
  const classNames = new Map(classes.data?.map((item) => [item.id, item.name]))
  const lookupError = campuses.error ?? classes.error

  // 주소에는 이 화면이 쓰는 값만 남긴다. 조건이 바뀌면 첫 페이지부터 다시 본다.
  function goTo(next: { campusId?: number; page?: number }) {
    const params = new URLSearchParams()
    if (next.campusId) params.set('campusId', String(next.campusId))
    if (next.page) params.set('page', String(next.page))
    setSearchParams(params)
  }

  /** 입력칸의 값을 검색 조건으로 적용한다. 적용할 수 없는 값이면 안내하고 false를 돌려준다. */
  function applyTermInput(): boolean {
    const next = readSearchTerm(termInput)
    if (next === null) {
      setTermError('번호는 뒷자리 4자리만 넣어 주세요.')
      return false
    }
    setTermError(undefined)
    setTerm(next)
    return true
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (applyTermInput()) goTo({ campusId })
  }

  function handleCampusChange(value: string) {
    // 치다 말고 지점을 고르면, 입력칸에 보이는 값도 함께 적용한다. 화면에 보이는 조건과 목록이 어긋나지 않게 한다.
    if (applyTermInput()) goTo({ campusId: value === ALL ? undefined : Number(value) })
  }

  const data = students.data
  const error = students.error
  const filtered =
    campusId !== undefined || term.name !== undefined || term.phoneLast4 !== undefined
  // 같은 조건의 다음 페이지를 받는 동안 보여주는 이전 페이지인지
  const showingPreviousPage = students.isPlaceholderData

  const campusOptions = [
    { value: ALL, label: '전체' },
    ...(campuses.data ?? []).map((campus) => ({ value: String(campus.id), label: campus.name })),
  ]
  // 주소의 지점이 선택지에 없으면(지점 목록을 못 받았거나 없는 지점) 그대로 선택지로 보여준다.
  // 빼 버리면 지점으로 걸러진 목록인데 아무 지점도 고르지 않은 것처럼 보인다.
  if (campusId !== undefined && !campusNames.has(campusId)) {
    campusOptions.push({ value: String(campusId), label: `지점 ${campusId}` })
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">학생</h1>
          <p className="mt-1 text-sub">재원생과 퇴원생을 이름이나 전화번호 뒷자리로 찾아요.</p>
        </div>
        <ButtonLink to="/desk/students/new">학생 등록</ButtonLink>
      </div>

      {/* 등록 중에 다른 화면으로 떠났다가 목록으로 온 경우의 안내. 보통은 상세 화면이 보여준다. */}
      <RegisteredNoticeBanner className="mt-6" />

      <div className="mt-7 flex flex-wrap items-start gap-x-6 gap-y-4">
        <Segmented
          label="지점"
          name="campusFilter"
          value={campusId === undefined ? ALL : String(campusId)}
          onChange={handleCampusChange}
          options={campusOptions}
          className="w-full max-w-[380px]"
        />
        <form onSubmit={handleSearch} role="search" className="flex items-start gap-2">
          <TextField
            label="이름 또는 번호 뒷자리"
            name="term"
            value={termInput}
            onChange={(event) => setTermInput(event.target.value)}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="off"
            placeholder="김철 또는 5678"
            error={termError}
            className="w-[220px]"
          />
          {/* 이름표 높이만큼 내려 입력칸과 나란히 둔다. */}
          <Button type="submit" className="mt-[27px] h-[50px]">
            찾기
          </Button>
        </form>
      </div>

      {lookupError && (
        <div className="mt-6">
          {/* 요청이 둘이다. 실패한 쪽의 번호를, 둘 다 실패했으면 지점 쪽의 번호를 보여준다. */}
          <Notice requestId={supportRequestId(campuses.error) ?? supportRequestId(classes.error)}>
            지점·반 이름을 불러오지 못했어요. 표의 지점과 반이 비어 보일 수 있어요.
          </Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => {
              void campuses.refetch()
              void classes.refetch()
            }}
            disabled={campuses.isFetching || classes.isFetching}
          >
            지점·반 다시 불러오기
          </Button>
        </div>
      )}

      {!data && !error && (
        <p role="status" className="py-24 text-center text-sub">
          학생 목록을 불러오고 있어요.
        </p>
      )}

      {error && (
        <div className="mt-6">
          <Notice requestId={supportRequestId(error)}>
            {data
              ? '최신 내용을 불러오지 못했어요. 아래 표는 이전 내용일 수 있어요.'
              : error instanceof ApiError
                ? error.message
                : '학생 목록을 불러오지 못했어요.'}
          </Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void students.refetch()}
            disabled={students.isFetching}
          >
            {students.isFetching ? '불러오는 중' : '다시 불러오기'}
          </Button>
        </div>
      )}

      {data && data.totalElements === 0 && (
        <EmptyState
          title={filtered ? '조건에 맞는 학생이 없어요' : '등록된 학생이 없어요'}
          description={
            term.name
              ? // 이름은 앞부분이 같아야 찾는다. "철수"로는 "김철수"를 찾지 못한다.
                '이름은 앞부분부터 입력해야 찾을 수 있어요. 예: 김, 김철'
              : term.phoneLast4
                ? '학부모와 학생 본인 번호의 뒷자리에서 찾았어요. 뒷자리가 맞는지 확인해 주세요.'
                : undefined
          }
          className="py-16"
        />
      )}

      {/* 학생은 있는데 이 페이지가 비어 있다. 없는 페이지로 들어온 경우다. 학생이 없다고 하면 안 된다. */}
      {data && data.totalElements > 0 && data.items.length === 0 && (
        <EmptyState
          title="이 페이지에는 학생이 없어요"
          description={`조건에 맞는 학생은 모두 ${data.totalElements}명이에요.`}
          className="py-16"
        >
          <Button onClick={() => goTo({ campusId })}>첫 페이지로</Button>
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        // 다음 페이지를 받는 동안에는 이전 페이지가 보인다. 숫자와 표를 함께 흐리게 해서 아직 바뀌지 않았음을 알린다.
        <div
          className={showingPreviousPage ? 'opacity-60' : undefined}
          aria-busy={showingPreviousPage}
        >
          <div className="mt-7 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[14px] text-sub">
            {term.phoneLast4 && (
              // 같은 뒷자리면 모두 나온다. 맞은 번호가 대표 연락처가 아닐 수도 있어, 표의 번호만 보고 고르면 틀린다.
              <p>
                번호 뒷자리가 같은 학생이 모두 나와요. 학부모나 학생 본인 번호 가운데 하나가 맞은
                것이라 표의 대표 연락처와 다를 수 있어요. 이름으로 확인해 주세요.
              </p>
            )}
            <p className="ml-auto">{`전체 ${data.totalElements}명`}</p>
          </div>
          <Table caption="학생 목록" wide stack className="mt-4">
            <thead>
              <tr>
                <Th>이름</Th>
                <Th>학년</Th>
                <Th>학교</Th>
                <Th>지점</Th>
                <Th>반</Th>
                <Th>대표 연락처</Th>
                <Th>상태</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((student) => {
                const contact = student.primaryContact
                return (
                  // 퇴원한 학생은 흐리게 보여 재원생과 한눈에 구분되게 한다. 모르는 상태는 퇴원으로 단정하지 않는다.
                  <tr
                    key={student.id}
                    className={student.status === 'WITHDRAWN' ? 'text-sub' : undefined}
                  >
                    <Td className="font-semibold">
                      <Link
                        to={studentPath(student.id)}
                        className="rounded-btn-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        {student.name}
                      </Link>
                    </Td>
                    <Td label="학년">{gradeLabel(student.grade)}</Td>
                    <Td label="학교" className="text-sub">
                      {student.school ?? '-'}
                    </Td>
                    <Td label="지점" className="text-sub">
                      {campusNames.get(student.campusId) ?? '-'}
                    </Td>
                    <Td label="반" className="text-sub">
                      {student.classId == null
                        ? '-'
                        : // 반 목록에는 운영 중인 반만 온다. 이름을 못 찾은 반은 꺼졌거나 방금 바뀐 반이다.
                          (classNames.get(student.classId) ??
                          (classes.data ? '목록에 없는 반' : '-'))}
                    </Td>
                    <Td label="연락처">
                      {contact === null ? (
                        // 학부모도 본인 번호도 없는 학생이다. 등록과 삭제가 막고 있어 평소에는 없다. 상세에서 넣을 수 있다.
                        <span className="text-sub">연락처 없음</span>
                      ) : (
                        <>
                          <span className="text-sub">{contactOwnerLabel(contact.relation)}</span>{' '}
                          {/* 서버가 가운데를 가려서 준 번호를 그대로 보여준다. */}
                          <span className="tabular-nums">{contact.phone}</span>
                        </>
                      )}
                    </Td>
                    <Td label="상태">
                      <Pill status={student.status === 'ENROLLED' ? 'valid' : 'used'}>
                        {statusLabel(student.status)}
                      </Pill>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            onChange={(nextPage) => goTo({ campusId, page: nextPage })}
            disabled={showingPreviousPage}
            className="mt-6"
          />
        </div>
      )}
    </>
  )
}
