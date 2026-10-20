export const STUDENTS_PATH = '/desk/students'

export function studentPath(id: number): string {
  return `${STUDENTS_PATH}/${id}`
}

export function studentEditPath(id: number): string {
  return `${STUDENTS_PATH}/${id}/edit`
}

/** 주소의 학생 id를 읽는다. 1 이상의 정수(15자리까지)가 아니면 null이다(서버에 묻지 않고 없는 학생으로 본다). */
export function parseStudentId(value: string | undefined): number | null {
  if (value === undefined || !/^\d{1,15}$/.test(value)) return null
  const id = Number(value)
  return id > 0 ? id : null
}

/** JEY 발급 목록(관리자). 학생 상세와 발급 화면이 이 주소로 보낸다. */
export const CAMPUS_PASSES_PATH = '/admin/passes'

/** JEY 발급 목록. `studentId`를 주면 그 학생의 패스만 본다. */
export function campusPassesPath(studentId?: number): string {
  return studentId === undefined
    ? CAMPUS_PASSES_PATH
    : `${CAMPUS_PASSES_PATH}?studentId=${studentId}`
}

/** 그 학생에게 JEY 패스를 발급하는 화면 */
export function campusPassIssuePath(studentId: number): string {
  return `${CAMPUS_PASSES_PATH}/new?studentId=${studentId}`
}
