import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError } from '@/shared/api'
import { useCampuses, useClasses } from '@/shared/campus'
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
import { useRegisteredNotice, useStudents, type RegisteredNotice } from '../api'
import { contactOwnerLabel, gradeLabel, relationLabel, statusLabel } from '../labels'

const ALL = 'all'
// 서버가 받는 이름의 최대 길이
const NAME_MAX_LENGTH = 50

/** 주소의 page 값을 0 이상의 정수로 읽는다. 숫자만으로 된 값이 아니면 첫 페이지로 본다. */
function readPage(value: string | null): number {
  return value !== null && /^\d{1,6}$/.test(value) ? Number(value) : 0
}

/** 주소의 campusId 값을 읽는다. 숫자만으로 된 값이 아니면 전 지점으로 본다. */
function readCampusId(value: string | null): number | undefined {
  const id = value !== null && /^\d{1,9}$/.test(value) ? Number(value) : 0
  return id > 0 ? id : undefined
}

/**
 * 이름 칸에 넣은 값이 전화번호처럼 보이는지. 숫자가 모두 합쳐 4개 이상이면 그렇게 본다.
 * 검색어는 요청 주소에 실린다. 전화번호는 뒷자리라도 주소에 남기지 않으므로 보내기 전에 막는다.
 * 사이에 무엇을 끼워 넣었는지는 보지 않는다(010.1234.5678, (010)1234, 5 6 7 8). 구분 기호를 하나씩 따지면 빠지는 모양이 생긴다.
 * 전각 숫자(０１０)도 같은 숫자로 센다. 이름에 숫자가 4개 이상 들어가는 경우는 없다고 본다.
 */
function looksLikePhone(text: string): boolean {
  return text.normalize('NFKC').replace(/\D/g, '').length >= 4
}

/**
 * 학생 목록. 직원과 관리자가 본다. 직원도 다른 지점의 학생을 본다.
 * 지점과 페이지는 주소에 둔다. 새로고침하거나 다른 화면에 갔다 와도 보던 자리가 유지된다.
 * 이름은 주소에 두지 않는다. 학생 이름이 브라우저 기록과 접근 로그에 남기 때문이다.
 */
export function StudentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const campusId = readCampusId(searchParams.get('campusId'))
  const page = readPage(searchParams.get('page'))
  // 입력칸에 치고 있는 글자와, "찾기"를 눌러 실제로 적용한 이름을 따로 둔다.
  const [nameInput, setNameInput] = useState('')
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string>()
  // 등록 화면이 남긴 안내가 있으면 가져온다. 닫기 전에는 사라지지 않는다.
  const { peek: peekRegistered, clear: clearRegistered } = useRegisteredNotice()
  const [registered, setRegistered] = useState<RegisteredNotice | undefined>(peekRegistered)
  // 화면에 옮겨 담았으니 남겨 둔 것은 지운다. 다른 화면에 갔다 돌아왔을 때 다시 뜨지 않게 한다.
  useEffect(() => clearRegistered(), [clearRegistered])

  const campuses = useCampuses()
  const classes = useClasses()
  const students = useStudents({ campusId, name, page })

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
  function applyNameInput(): boolean {
    const next = nameInput.trim()
    if (looksLikePhone(next)) {
      setNameError('전화번호로는 찾을 수 없어요. 이름으로 찾아 주세요.')
      return false
    }
    setNameError(undefined)
    setName(next)
    return true
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (applyNameInput()) goTo({ campusId })
  }

  function handleCampusChange(value: string) {
    // 이름을 치다 말고 지점을 고르면, 입력칸에 보이는 이름도 함께 적용한다. 화면에 보이는 조건과 목록이 어긋나지 않게 한다.
    if (applyNameInput()) goTo({ campusId: value === ALL ? undefined : Number(value) })
  }

  const data = students.data
  const error = students.error
  const filtered = campusId !== undefined || name !== ''
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
          <p className="mt-1 text-sub">재원생과 퇴원생을 이름으로 찾아요.</p>
        </div>
        <ButtonLink to="/desk/students/new">학생 등록</ButtonLink>
      </div>

      {registered && (
        <Notice tone="success" className="mt-6">
          <p>{`${registered.name} 학생을 등록했어요.`}</p>
          {/* 같은 번호의 학부모가 이미 있으면 서버는 새로 만들지 않고 그 학부모에 연결한다.
              번호를 잘못 넣어 남의 학부모에 붙였는지 알아챌 수 있는 자리가 여기뿐이라 반드시 알린다. */}
          {registered.linkedGuardians.map((guardian) => (
            <p key={guardian.phone} className="mt-1 text-ink">
              {`${relationLabel(guardian.relation)}는 이미 등록된 학부모(${guardian.name}, ${guardian.phone})에 연결했어요. 다른 사람이라면 번호를 확인해 주세요.`}
            </p>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => setRegistered(undefined)}
          >
            닫기
          </Button>
        </Notice>
      )}

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
            label="이름"
            name="name"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="off"
            placeholder="성이나 이름 앞부분"
            error={nameError}
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
          <Notice>지점·반 이름을 불러오지 못했어요. 표의 지점과 반이 비어 보일 수 있어요.</Notice>
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
          <Notice>
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
            // 이름은 앞부분이 같아야 찾는다. "철수"로는 "김철수"를 찾지 못한다.
            name ? '이름은 앞부분부터 입력해야 찾을 수 있어요. 예: 김, 김철' : undefined
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
          <p className="mt-7 text-right text-[14px] text-sub">{`전체 ${data.totalElements}명`}</p>
          <Table caption="학생 목록" wide className="mt-4">
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
                    <Td className="font-semibold">{student.name}</Td>
                    <Td>{gradeLabel(student.grade)}</Td>
                    <Td className="text-sub">{student.school ?? '-'}</Td>
                    <Td className="text-sub">{campusNames.get(student.campusId) ?? '-'}</Td>
                    <Td className="text-sub">
                      {student.classId == null
                        ? '-'
                        : // 반 목록에는 운영 중인 반만 온다. 이름을 못 찾은 반은 꺼졌거나 방금 바뀐 반이다.
                          (classNames.get(student.classId) ??
                          (classes.data ? '목록에 없는 반' : '-'))}
                    </Td>
                    <Td>
                      <span className="text-sub">{contactOwnerLabel(contact.relation)}</span>{' '}
                      {/* 서버가 가운데를 가려서 준 번호를 그대로 보여준다. */}
                      <span className="tabular-nums">{contact.phone}</span>
                    </Td>
                    <Td>
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
