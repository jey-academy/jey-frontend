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
