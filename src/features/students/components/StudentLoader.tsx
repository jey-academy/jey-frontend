import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import { ApiError, supportRequestId } from '@/shared/api'
import { Button, ButtonLink, EmptyState, Notice } from '@/shared/ui'
import { useStudent, type Student } from '../api'
import { parseStudentId, STUDENTS_PATH } from '@/shared/paths'

type StudentLoaderProps = {
  /**
   * 받아 둔 학생이 있어도 새로 받은 뒤에 화면을 그린다(수정 화면).
   * 수정은 값을 통째로 바꾸므로, 받아 둔 지 오래된 값으로 폼을 채우면 그사이 다른 사람이 고친 것을 되돌린다.
   */
  fresh?: boolean
  /**
   * 학생을 받은 뒤에 그릴 화면. `refetchFailed`는 보여주는 내용이 이전 것일 수 있다는 뜻이다
   * (받아 둔 학생은 있는데 다시 받기에 실패함). `refetchRequestId`는 그 안내 아래에 보여줄 요청 번호다.
   */
  children: (
    student: Student,
    state: { refetchFailed: boolean; refetchRequestId: string | null },
  ) => ReactNode
}

/**
 * 주소의 id로 학생을 받아 화면에 넘긴다. 상세 화면과 수정 화면이 같이 쓴다.
 * 받는 중, 없는 학생, 받지 못함은 여기서 안내한다.
 * 받아 둔 학생이 있어도 다시 받았을 때 없는 학생이면 없는 학생으로 안내한다.
 */
export function StudentLoader({ fresh = false, children }: StudentLoaderProps) {
  const id = parseStudentId(useParams().id)
  const student = useStudent(id, { fresh })
  const error = student.error

  // 상태 코드가 아니라 코드로 가린다. 주소가 틀려서 오는 404까지 없는 학생이라고 하면 안 된다.
  if (id === null || (error instanceof ApiError && error.code === 'MEMBER_STUDENT_NOT_FOUND')) {
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

  // 새로 받기에 실패했으면 받아 둔 값으로 그리되, 이전 내용일 수 있다고 알리게 한다.
  if (student.data && (!fresh || student.isFetchedAfterMount)) {
    return children(student.data, {
      refetchFailed: error !== null,
      refetchRequestId: supportRequestId(error),
    })
  }

  if (error && !student.data) {
    return (
      <div className="mt-6">
        <Notice requestId={supportRequestId(error)}>
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
