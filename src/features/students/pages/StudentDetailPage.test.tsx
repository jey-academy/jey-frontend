import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import type { AcademyClass, Campus } from '@/shared/campus'
import { setupDialog } from '@/test/dialog'
import {
  jsonResponse,
  mockApi,
  noContent,
  problemResponse,
  requests,
  setupMockApi,
} from '@/test/mockApi'
import { admin, partner, renderApp, staff } from '@/test/renderApp'
import type { Student } from '../api'

setupMockApi()
setupDialog()

const LIST = '/desk/students'
const PATH = '/desk/students/1'
const DETAIL = 'GET /api/v1/students/1'
const REMOVE_PHONE = 'DELETE /api/v1/students/1/phone'

const campuses: Campus[] = [
  { id: 1, name: '동탄관' },
  { id: 2, name: '능동관' },
]
const classes: AcademyClass[] = [{ id: 10, campusId: 1, name: '중1 정규' }]

// 전화번호는 서버가 가운데를 가려서 준다.
const doyun: Student = {
  id: 1,
  campusId: 1,
  classId: 10,
  name: '김도윤',
  grade: 'MIDDLE_1',
  school: '동탄중',
  phone: '010-****-0000',
  status: 'ENROLLED',
  registeredAt: '2026-09-01',
  guardians: [
    { id: 7, relation: 'MOTHER', name: '이영희', phone: '010-****-5678', linkedToExisting: false },
    { id: 8, relation: 'FATHER', name: '김철수', phone: '010-****-5432', linkedToExisting: false },
  ],
  primaryContact: { name: '이영희', relation: 'MOTHER', phone: '010-****-5678' },
  siblings: [
    { id: 2, name: '김서연', status: 'ENROLLED' },
    { id: 3, name: '김민준', status: 'WITHDRAWN' },
  ],
}
// 반·학교·학부모·형제가 없고 본인 번호만 있다.
const alone: Student = {
  ...doyun,
  classId: null,
  school: null,
  guardians: [],
  primaryContact: { name: '김도윤', relation: null, phone: '010-****-0000' },
  siblings: [],
}

function mockLookups() {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/classes': () => jsonResponse(classes),
  })
}

function mockDetail(student: Student = doyun) {
  mockLookups()
  mockApi({ [DETAIL]: () => jsonResponse(student) })
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

/** 이름표 옆의 값(dt 다음의 dd). */
function valueOf(label: string) {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement
}

function section(title: string) {
  return screen.getByRole('heading', { level: 2, name: title }).parentElement as HTMLElement
}

// ── 보기 ─────────────────────────────────────────────────

test('학생의 기본 정보, 대표 연락처, 학부모, 형제를 보여준다', async () => {
  mockDetail()
  renderApp(PATH, { me: staff })

  const heading = await screen.findByRole('heading', { level: 1, name: '김도윤' })
  // 이름 옆의 상태. 형제의 상태와 구분해서 본다.
  expect(within(heading.parentElement!).getByText('재원')).toBeInTheDocument()
  expect(valueOf('학년')).toHaveTextContent('중1')
  expect(valueOf('학교')).toHaveTextContent('동탄중')
  expect(valueOf('등록일')).toHaveTextContent('2026.09.01')
  expect(valueOf('본인 번호')).toHaveTextContent('010-****-0000')
  // 지점과 반의 이름은 따로 받아 붙인다.
  await waitFor(() => expect(valueOf('지점')).toHaveTextContent('동탄관'))
  expect(valueOf('반')).toHaveTextContent('중1 정규')

  expect(section('대표 연락처')).toHaveTextContent('어머니이영희010-****-5678')
  const guardians = within(section('학부모')).getAllByRole('listitem')
  expect(guardians.map((item) => item.textContent)).toEqual([
    '어머니이영희010-****-5678',
    '아버지김철수010-****-5432',
  ])
  // 퇴원한 형제도 보여주고 상태로 구분한다.
  const siblings = within(section('형제')).getAllByRole('listitem')
  expect(siblings.map((item) => item.textContent)).toEqual(['김서연재원', '김민준퇴원'])
  // 학생 탭이 선택된 채로 남는다.
  expect(screen.getByRole('link', { name: '학생' })).toHaveAttribute('aria-current', 'page')
})

test('없는 값은 "-"로 보여주고, 본인 번호가 대표 연락처면 본인이라고 적는다', async () => {
  mockDetail(alone)
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  expect(valueOf('학교')).toHaveTextContent('-')
  expect(valueOf('반')).toHaveTextContent('-')
  expect(section('대표 연락처')).toHaveTextContent('본인김도윤010-****-0000')
  expect(section('학부모')).toHaveTextContent('연결된 학부모가 없어요.')
  expect(screen.queryByRole('heading', { level: 2, name: '형제' })).not.toBeInTheDocument()
})

test('본인 번호가 없으면 번호 지우기를 보여주지 않는다', async () => {
  mockDetail({ ...doyun, phone: null })
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  expect(valueOf('본인 번호')).toHaveTextContent('-')
  expect(screen.queryByRole('button', { name: '번호 지우기' })).not.toBeInTheDocument()
})

test('운영하지 않는 반에 속해 있으면 목록에 없는 반이라고 보여준다', async () => {
  mockDetail({ ...doyun, classId: 99 })
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  await waitFor(() => expect(valueOf('반')).toHaveTextContent('목록에 없는 반'))
})

test('퇴원한 학생은 퇴원이라고 보여준다', async () => {
  mockDetail({ ...doyun, status: 'WITHDRAWN', siblings: [] })
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  expect(screen.getByText('퇴원')).toBeInTheDocument()
})

// ── 이동 ─────────────────────────────────────────────────

test('목록에서 이름을 누르면 그 학생의 상세로 간다', async () => {
  mockDetail()
  mockApi({
    'GET /api/v1/students': () =>
      jsonResponse({
        items: [
          {
            id: 1,
            campusId: 1,
            classId: 10,
            name: '김도윤',
            grade: 'MIDDLE_1',
            school: '동탄중',
            status: 'ENROLLED',
            primaryContact: doyun.primaryContact,
          },
        ],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      }),
  })
  const { router } = renderApp(LIST, { me: staff })

  await userEvent.click(await screen.findByRole('link', { name: '김도윤' }))

  expect(await screen.findByRole('heading', { level: 1, name: '김도윤' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe(PATH)
})

test('형제를 누르면 그 학생의 상세로 간다', async () => {
  mockDetail()
  mockApi({
    'GET /api/v1/students/2': () =>
      jsonResponse({
        ...alone,
        id: 2,
        name: '김서연',
        siblings: [{ id: 1, name: '김도윤', status: 'ENROLLED' }],
      }),
  })
  const { router } = renderApp(PATH, { me: staff })

  await userEvent.click(await screen.findByRole('link', { name: '김서연' }))

  expect(await screen.findByRole('heading', { level: 1, name: '김서연' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/desk/students/2')
  expect(screen.getByRole('link', { name: '김도윤' })).toBeInTheDocument()
})

test('정보 수정과 학생 목록으로 가는 길이 있다', async () => {
  mockDetail()
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  expect(screen.getByRole('link', { name: '정보 수정' })).toHaveAttribute('href', `${PATH}/edit`)
  expect(screen.getByRole('link', { name: '학생 목록' })).toHaveAttribute('href', LIST)
})

// ── 받지 못할 때 ─────────────────────────────────────────

test('없는 학생이면 알리고 목록으로 가는 길을 준다', async () => {
  mockLookups()
  mockApi({
    [DETAIL]: () =>
      problemResponse(404, { detail: '없는 학생입니다.', code: 'MEMBER_STUDENT_NOT_FOUND' }),
  })
  renderApp(PATH, { me: staff })

  expect(await screen.findByRole('heading', { level: 1, name: '없는 학생이에요' })).toBeVisible()
  expect(screen.getByRole('link', { name: '학생 목록으로' })).toHaveAttribute('href', LIST)
  // 없는 학생은 다시 물어도 없다.
  expect(count(DETAIL)).toBe(1)
})

test.each(['abc', '0', '1e3', '-1', '1.5'])(
  '주소의 id가 숫자가 아니면(%s) 서버에 묻지 않고 없는 학생으로 알린다',
  async (id) => {
    renderApp(`${LIST}/${id}`, { me: staff })

    expect(await screen.findByRole('heading', { level: 1, name: '없는 학생이에요' })).toBeVisible()
    expect(requests().filter((request) => request.includes('/students/'))).toEqual([])
  },
)

test('학생을 받지 못하면 알리고, 다시 불러오면 보여준다', async () => {
  mockLookups()
  // 다시 시도하지 않는 오류로 답한다.
  mockApi({ [DETAIL]: () => problemResponse(403, { detail: '권한이 없습니다.' }) })
  renderApp(PATH, { me: staff })

  expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')

  mockApi({ [DETAIL]: () => jsonResponse(doyun) })
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

  expect(await screen.findByRole('heading', { level: 1, name: '김도윤' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('연계 학원은 이 화면을 볼 수 없다', async () => {
  renderApp(PATH, { me: partner })

  expect(
    await screen.findByRole('heading', { name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expect(requests()).toEqual([])
})

// ── 본인 번호 지우기 ─────────────────────────────────────

test('번호 지우기는 한 번 묻고, 지우면 상세를 다시 받아 보여준다', async () => {
  let removed = false
  mockLookups()
  mockApi({
    [DETAIL]: () => jsonResponse(removed ? { ...doyun, phone: null } : doyun),
    [REMOVE_PHONE]: () => {
      removed = true
      return noContent()
    },
  })
  renderApp(PATH, { me: admin })
  await userEvent.click(await screen.findByRole('button', { name: '번호 지우기' }))

  const dialog = await screen.findByRole('dialog', { name: '본인 번호를 지울까요?' })
  // 어느 번호를 지우는지 가린 번호로 보여준다.
  expect(dialog).toHaveTextContent('010-****-0000')
  expect(count(REMOVE_PHONE)).toBe(0)
  await userEvent.click(within(dialog).getByRole('button', { name: '지우기' }))

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(valueOf('본인 번호')).toHaveTextContent('-'))
  expect(screen.queryByRole('button', { name: '번호 지우기' })).not.toBeInTheDocument()
  expect(count(REMOVE_PHONE)).toBe(1)
})

test('묻는 창에서 닫기를 누르면 지우지 않는다', async () => {
  mockDetail()
  renderApp(PATH, { me: admin })
  await userEvent.click(await screen.findByRole('button', { name: '번호 지우기' }))

  const dialog = await screen.findByRole('dialog')
  await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(valueOf('본인 번호')).toHaveTextContent('010-****-0000')
  expect(count(REMOVE_PHONE)).toBe(0)
})

test('하나 남은 연락처면 지울 수 없다고 알리고 창을 그대로 둔다', async () => {
  mockDetail(alone)
  mockApi({
    [REMOVE_PHONE]: () =>
      problemResponse(409, {
        detail: '마지막 연락처는 지울 수 없습니다.',
        code: 'MEMBER_LAST_CONTACT',
      }),
  })
  renderApp(PATH, { me: admin })
  await userEvent.click(await screen.findByRole('button', { name: '번호 지우기' }))
  const dialog = await screen.findByRole('dialog')

  await userEvent.click(within(dialog).getByRole('button', { name: '지우기' }))

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '하나 남은 연락처라 지울 수 없어요. 다른 연락처를 먼저 넣어 주세요.',
  )
  expect(valueOf('본인 번호')).toHaveTextContent('010-****-0000')

  // 닫았다 다시 열면 지난 안내는 남아 있지 않다.
  await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
  await userEvent.click(screen.getByRole('button', { name: '번호 지우기' }))
  expect(within(await screen.findByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument()
})

test('지우기 응답을 받지 못하면 지워졌을 수 있다고 알리고 상세를 다시 받는다', async () => {
  mockDetail()
  mockApi({
    [REMOVE_PHONE]: () => {
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: admin })
  await userEvent.click(await screen.findByRole('button', { name: '번호 지우기' }))
  const dialog = await screen.findByRole('dialog')

  await userEvent.click(within(dialog).getByRole('button', { name: '지우기' }))

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('지워졌을 수도 있으니')
  // 알아서 다시 보내지 않고, 지금 상태를 다시 받아 온다.
  expect(count(REMOVE_PHONE)).toBe(1)
  await waitFor(() => expect(count(DETAIL)).toBe(2))
})
