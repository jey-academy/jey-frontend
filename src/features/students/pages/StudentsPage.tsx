import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError } from '@/shared/api'
import { useCampuses, useClasses } from '@/shared/campus'
import {
  Button,
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
import { contactOwnerLabel, gradeLabel, statusLabel } from '../labels'

const ALL = 'all'

/** 주소의 page 값을 0 이상의 정수로 읽는다. 이상한 값이면 첫 페이지로 본다. */
function readPage(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 0
}

/** 주소의 campusId 값을 읽는다. 숫자가 아니면 전 지점으로 본다. */
function readCampusId(value: string | null): number | undefined {
  const id = Number(value)
  return value !== null && Number.isInteger(id) && id > 0 ? id : undefined
}

/**
 * 학생 목록. 직원과 관리자가 본다. 직원도 다른 지점의 학생을 본다.
 * 검색 조건과 페이지는 주소에 둔다. 새로고침하거나 다른 화면에 갔다 와도 보던 자리가 유지된다.
 */
export function StudentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const campusId = readCampusId(searchParams.get('campusId'))
  const name = searchParams.get('name')?.trim() ?? ''
  const page = readPage(searchParams.get('page'))

  const campuses = useCampuses()
  const classes = useClasses()
  const students = useStudents({ campusId, name, page })

  const campusNames = new Map(campuses.data?.map((campus) => [campus.id, campus.name]))
  const classNames = new Map(classes.data?.map((item) => [item.id, item.name]))

  // 조건이 바뀌면 첫 페이지부터 다시 본다. 비어 있는 조건은 주소에서 뺀다.
  function updateFilters(next: { campusId?: number; name: string }) {
    const params = new URLSearchParams()
    if (next.campusId) params.set('campusId', String(next.campusId))
    if (next.name) params.set('name', next.name)
    setSearchParams(params)
  }

  function goToPage(nextPage: number) {
    const params = new URLSearchParams(searchParams)
    if (nextPage > 0) params.set('page', String(nextPage))
    else params.delete('page')
    setSearchParams(params)
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = new FormData(event.currentTarget).get('name')
    updateFilters({ campusId, name: typeof input === 'string' ? input.trim() : '' })
  }

  const data = students.data
  const error = students.error
  const filtered = campusId !== undefined || name !== ''

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">학생</h1>
      <p className="mt-1 text-sub">재원생과 퇴원생을 이름으로 찾아요.</p>

      <div className="mt-7 flex flex-wrap items-end gap-x-6 gap-y-4">
        <Segmented
          label="지점"
          name="campusFilter"
          value={campusId === undefined ? ALL : String(campusId)}
          onChange={(value) =>
            updateFilters({ campusId: value === ALL ? undefined : Number(value), name })
          }
          options={[
            { value: ALL, label: '전체' },
            ...(campuses.data ?? []).map((campus) => ({
              value: String(campus.id),
              label: campus.name,
            })),
          ]}
          className="w-full max-w-[380px]"
        />
        {/* 주소의 이름이 바뀌면(뒤로 가기 등) 입력칸도 그 값으로 다시 채운다. */}
        <form key={name} onSubmit={handleSearch} role="search" className="flex items-end gap-2">
          <TextField
            label="이름"
            name="name"
            defaultValue={name}
            autoComplete="off"
            placeholder="성이나 이름 앞부분"
            className="w-[220px]"
          />
          <Button type="submit" className="h-[50px]">
            찾기
          </Button>
        </form>
      </div>

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

      {data &&
        (data.items.length === 0 ? (
          <EmptyState
            title={filtered ? '조건에 맞는 학생이 없어요' : '등록된 학생이 없어요'}
            description={
              // 이름은 앞부분이 같아야 찾는다. "철수"로는 "김철수"를 찾지 못한다.
              name ? '이름은 앞부분부터 입력해야 찾을 수 있어요. 예: 김, 김철' : undefined
            }
            className="py-16"
          >
            {page > 0 && (
              <Button variant="ghost" onClick={() => goToPage(0)}>
                첫 페이지로
              </Button>
            )}
          </EmptyState>
        ) : (
          <>
            <p className="mt-7 text-right text-[14px] text-sub">{`전체 ${data.totalElements}명`}</p>
            <Table
              caption="학생 목록"
              wide
              // 다음 페이지를 받는 동안에는 이전 페이지가 보인다. 흐리게 해서 아직 바뀌지 않았음을 알린다.
              className={students.isPlaceholderData ? 'mt-4 opacity-60' : 'mt-4'}
            >
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
                  const enrolled = student.status === 'ENROLLED'
                  const contact = student.primaryContact
                  return (
                    // 퇴원한 학생은 흐리게 보여 재원생과 한눈에 구분되게 한다.
                    <tr key={student.id} className={enrolled ? undefined : 'text-sub'}>
                      <Td className="font-semibold">{student.name}</Td>
                      <Td>{gradeLabel(student.grade)}</Td>
                      <Td className="text-sub">{student.school ?? '-'}</Td>
                      <Td className="text-sub">{campusNames.get(student.campusId) ?? '-'}</Td>
                      <Td className="text-sub">
                        {student.classId == null
                          ? '-'
                          : // 반 목록에는 운영 중인 반만 온다. 이름을 못 찾으면 꺼진 반이다.
                            (classNames.get(student.classId) ?? (classes.data ? '꺼진 반' : '-'))}
                      </Td>
                      <Td>
                        <span className="text-sub">{contactOwnerLabel(contact.relation)}</span>{' '}
                        {/* 서버가 가운데를 가려서 준 번호를 그대로 보여준다. */}
                        <span className="tabular-nums">{contact.phone}</span>
                      </Td>
                      <Td>
                        <Pill status={enrolled ? 'valid' : 'used'}>
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
              onChange={goToPage}
              disabled={students.isPlaceholderData}
              className="mt-6"
            />
          </>
        ))}
    </>
  )
}
