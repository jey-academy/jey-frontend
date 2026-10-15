import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect } from 'vitest'
import type { AcademyClass, Campus } from '@/shared/campus'
import { jsonResponse, mockApi, requests } from '@/test/mockApi'
import type { Guardian, Student } from '../api'

// 학생 상세 화면의 테스트들(StudentDetailPage.*.test.tsx)이 같이 쓰는 자료와 도우미.
// 학생의 모양이 바뀌면 여기만 고친다. 파일마다 다른 값은 그 파일에서 덮어쓴다.

export const PATH = '/desk/students/1'
export const DETAIL = 'GET /api/v1/students/1'

export const campuses: Campus[] = [
  { id: 1, name: '동탄관' },
  { id: 2, name: '능동관' },
]
export const classes: AcademyClass[] = [{ id: 10, campusId: 1, name: '중1 정규' }]

// 전화번호는 서버가 가운데를 가려서 준다.
export const mother: Guardian = {
  id: 7,
  relation: 'MOTHER',
  name: '이영희',
  phone: '010-****-5678',
  linkedToExisting: false,
}
export const father: Guardian = {
  id: 8,
  relation: 'FATHER',
  name: '김철수',
  phone: '010-****-5432',
  linkedToExisting: false,
}

/** 학부모 둘이 연결된 학생. 반·학교·본인 번호·형제는 없다. */
export const doyun: Student = {
  id: 1,
  campusId: 1,
  classId: null,
  name: '김도윤',
  grade: 'MIDDLE_1',
  school: null,
  phone: null,
  status: 'ENROLLED',
  registeredAt: '2026-09-01',
  guardians: [mother, father],
  primaryContact: { name: '이영희', relation: 'MOTHER', phone: '010-****-5678' },
  siblings: [],
}

/** 지점·반 목록 조회를 흉내 낸다. */
export function mockLookups() {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/classes': () => jsonResponse(classes),
  })
}

/** 상세 조회와 지점·반 목록을 흉내 낸다. 상세는 호출할 때마다 `server.student`의 지금 값을 돌려준다. */
export function mockDetail(student: Student = doyun) {
  const server = { student }
  mockLookups()
  mockApi({ [DETAIL]: () => jsonResponse(server.student) })
  return server
}

export function count(key: string) {
  return requests().filter((request) => request === key).length
}

/** 학부모 표의 줄들. 줄의 버튼은 빼고 관계·이름·번호만 본다. */
export function guardianRows() {
  const card = screen.getByRole('heading', { level: 2, name: '학부모' }).parentElement!
  return within(card)
    .queryAllByRole('listitem')
    .map((item) => {
      const row = item.cloneNode(true) as HTMLElement
      row.querySelectorAll('button').forEach((button) => button.remove())
      return row.textContent
    })
}

/** 화면이 뜨기를 기다렸다가 버튼을 눌러 창을 연다. */
export async function open(button: string, dialogName: string) {
  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  await userEvent.click(screen.getByRole('button', { name: button }))
  return screen.findByRole('dialog', { name: dialogName })
}

export async function fill(dialog: HTMLElement, label: string, value: string) {
  const input = within(dialog).getByLabelText(label)
  await userEvent.clear(input)
  if (value) await userEvent.type(input, value)
}

export function press(dialog: HTMLElement, name: string) {
  return userEvent.click(within(dialog).getByRole('button', { name }))
}

export function closed() {
  return waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}
