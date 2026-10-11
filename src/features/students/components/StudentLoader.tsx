import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import { ApiError } from '@/shared/api'
import { Button, ButtonLink, EmptyState, Notice } from '@/shared/ui'
import { useStudent, type Student } from '../api'
import { parseStudentId, STUDENTS_PATH } from '../paths'

type StudentLoaderProps = {
  /**
   * 학생을 받은 뒤에 그릴 화면. `refetchFailed`는 보여주는 내용이 이전 것일 수 있다는 뜻이다
   * (받아 둔 학생은 있는데 다시 받기에 실패함).
   */
  children: (student: Student, state: { refetchFailed: boolean }) => ReactNode
}

/**
 * 주소의 id로 학생을 받아 화면에 넘긴다. 상세 화면과 수정 화면이 같이 쓴다.
 * 받는 중, 없는 학생, 받지 못함은 여기서 안내한다.
 */
export function StudentLoader({ children }: StudentLoaderProps) {
  const id = parseStudentId(useParams().id)
  const student = useStudent(id)
  const error = student.error

  if (id === null || (error instanceof ApiError && error.status === 404)) {
    return (
      <EmptyState
        headingLevel={1}
        title="없는 학생이에요"
        description="주소가 잘못됐거나 다른 학생의 주소일 수 있어요."
      >
        <ButtonLink to={STUDENTS_PATH}>학생 목록으로</ButtonLink>
      </EmptyState>
    )
  }

  if (student.data) return children(student.data, { refetchFailed: error !== null })

  if (error) {
    return (
      <div className="mt-6">
        <Notice>
          {error instanceof ApiError ? error.message : '학생 정보를 불러오지 못했어요.'}
        </Notice>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={() => void student.refetch()}
          disabled={student.isFetching}
        >
          {student.isFetching ? '불러오는 중' : '다시 불러오기'}
        </Button>
      </div>
    )
  }

  return (
    <p role="status" className="py-24 text-center text-sub">
      학생 정보를 불러오고 있어요.
    </p>
  )
}
