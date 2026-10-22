import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { setupDialog } from '@/test/dialog'
import {
  expectNoRequests,
  jsonResponse,
  mockApi,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
  unreadableResponse,
} from '@/test/mockApi'
import { admin, partner, renderApp } from '@/test/renderApp'
import type { CampusPassItem, CampusPassPage, IssueStudent } from '../api'

setupMockApi()
setupDialog()

const PATH = '/admin/passes'
const LIST = 'GET /api/v1/dongtanpass/campus-passes'
const link = (id: number) => `POST /api/v1/dongtanpass/campus-passes/${id}/link`
const cancel = (id: number) => `POST /api/v1/dongtanpass/campus-passes/${id}/cancel`

function item(overrides: Partial<CampusPassItem>): CampusPassItem {
  return {
    id: 1,
    passNo: 'DT-J4K8QZ',
    studentId: 5,
    studentName: '김도윤',
    // 발급일은 issuedOn 그대로 쓰는지 보려고 일부러 다른 날의 시각을 넣는다(장부 테스트와 같다).
    issuedAt: '2026-10-18T01:00:00Z',
    issuedOn: '2026-10-20',
    expiresOn: '2026-11-20',
    paidOn: '2026-10-19',
    paidAmount: 320000,
    paymentMethod: 'TRANSFER',
    discountRate: 0.075,
    state: 'ISSUED',
    ...overrides,
  }
}

const issued = item({})
const expired = item({
  id: 2,
  passNo: 'DT-EXP002',
  studentId: 6,
  studentName: '이서준',
  state: 'EXPIRED',
})
const redeemed = item({
  id: 3,
  passNo: 'DT-RED003',
  studentId: 7,
  studentName: '박하은',
  state: 'REDEEMED',
})

function page(items: CampusPassItem[]): CampusPassPage {
  return {
    items,
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages: items.length > 0 ? 1 : 0,
  }
}

const doyun: IssueStudent = {
  id: 5,
  campusId: 1,
  classId: null,
  name: '김도윤',
  grade: 'MIDDLE_1',
  school: null,
  phone: null,
  status: 'ENROLLED',
  registeredAt: '2026-03-02',
  guardians: [],
  primaryContact: { name: '이영희', relation: 'MOTHER', phone: '010-****-5678' },
  siblings: [],
}

function mockList(body: CampusPassPage = page([issued, expired, redeemed])) {
  mockApi({ [LIST]: () => jsonResponse(body) })
}

function count(key: string) {
  return requests().filter((request) => request.split('?')[0] === key).length
}

function lastListQuery() {
  const key = requests().findLast((request) => request.startsWith(LIST))
  if (!key) throw new Error('목록 요청이 없어요')
  const query: Record<string, string> = {}
  new URLSearchParams(key.split('?')[1] ?? '').forEach((value, name) => {
    query[name] = value
  })
  return query
}

function rowOf(passNo: string) {
  return screen.getByText(passNo).closest('li') as HTMLElement
}

async function openPage(path = PATH) {
  renderApp(path, { me: admin })
  await screen.findByRole('list', { name: '패스 목록' })
}

test('연계 학원 계정은 이 화면을 볼 수 없고 목록을 요청하지도 않는다', async () => {
  renderApp(PATH, { me: partner })

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expectNoRequests()
})

test('관리자 메뉴에 JEY 패스 탭이 있다', async () => {
  mockList()
  await openPage()

  expect(
    within(screen.getByRole('navigation', { name: '직원 메뉴' })).getByRole('link', {
      name: 'JEY 패스',
    }),
  ).toHaveAttribute('aria-current', 'page')
})

test('줄마다 학생(상세로 가는 링크)·상태·번호·발급일·기한·근거 결제·발급 때 할인율을 보여 준다', async () => {
  mockList()
  await openPage()

  const row = rowOf('DT-J4K8QZ')
  expect(within(row).getByRole('link', { name: '김도윤' })).toHaveAttribute(
    'href',
    '/desk/students/5',
  )
  expect(row).toHaveTextContent('사용 가능')
  expect(row).toHaveTextContent('발급일2026.10.20')
  expect(row).toHaveTextContent('사용 기한2026.11.20까지')
  expect(row).toHaveTextContent('320,000원 계좌이체')
  expect(row).toHaveTextContent('2026.10.19 결제')
  expect(row).toHaveTextContent('할인7.5%')
  expect(lastListQuery()).toEqual({})
})

test('사용 가능은 링크 새로 만들기·취소, 만료는 취소만, 사용된 패스는 버튼이 없다', async () => {
  mockList()
  await openPage()

  expect(
    within(rowOf('DT-J4K8QZ'))
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label')),
  ).toEqual(['링크 새로 만들기 (김도윤, DT-J4K8QZ)', '패스 취소 (김도윤, DT-J4K8QZ)'])
  expect(within(rowOf('DT-EXP002')).getByRole('button')).toHaveAccessibleName(
    '패스 취소 (이서준, DT-EXP002)',
  )
  expect(within(rowOf('DT-RED003')).queryByRole('button')).not.toBeInTheDocument()
})

test('학생 상세에서 오면 그 학생의 패스만 받고, 그 학생에게 발급하거나 모든 학생으로 돌아갈 수 있다', async () => {
  mockList(page([issued]))
  mockApi({ 'GET /api/v1/students/5': () => jsonResponse(doyun) })
  await openPage('/admin/passes?studentId=5')

  expect(lastListQuery()).toEqual({ studentId: '5' })
  // 학생을 받기 전에는 "한 학생의 패스만…"이 먼저 보인다. 이름이 나올 때까지 기다린다.
  await waitFor(() =>
    expect(screen.getByText(/학생의 패스만 보고 있어요/)).toHaveTextContent(
      '김도윤 학생의 패스만 보고 있어요.',
    ),
  )
  expect(screen.getByRole('link', { name: '이 학생에게 발급' })).toHaveAttribute(
    'href',
    '/admin/passes/new?studentId=5',
  )

  await userEvent.click(screen.getByRole('link', { name: '모든 학생 보기' }))
  await waitFor(() => expect(lastListQuery()).toEqual({}))
  expect(screen.queryByText(/학생의 패스만 보고 있어요/)).not.toBeInTheDocument()
})

test('학생 조건이 있을 때 상태를 고르면 학생 조건은 그대로 두고 함께 보낸다', async () => {
  mockList(page([issued]))
  mockApi({ 'GET /api/v1/students/5': () => jsonResponse(doyun) })
  await openPage('/admin/passes?studentId=5')

  await userEvent.click(screen.getByRole('radio', { name: '사용 완료' }))

  await waitFor(() => expect(lastListQuery()).toEqual({ studentId: '5', status: 'REDEEMED' }))
  // 조건 지우기는 상태·기간만 지운다.
  expect(screen.getByRole('link', { name: '조건 지우기' })).toHaveAttribute(
    'href',
    '/admin/passes?studentId=5',
  )
})

test('퇴원한 학생의 패스만 볼 때는 발급 버튼을 두지 않는다', async () => {
  mockList(page([issued]))
  mockApi({ 'GET /api/v1/students/5': () => jsonResponse({ ...doyun, status: 'WITHDRAWN' }) })
  await openPage('/admin/passes?studentId=5')

  // 학생을 받기 전에는 "한 학생의 패스만…"이 먼저 보인다. 이름이 나올 때까지 기다린다.
  await waitFor(() =>
    expect(screen.getByText(/학생의 패스만 보고 있어요/)).toHaveTextContent(
      '김도윤 학생의 패스만 보고 있어요.',
    ),
  )
  expect(screen.queryByRole('link', { name: '이 학생에게 발급' })).not.toBeInTheDocument()
})

test('발급한 패스가 없으면 학생 상세에서 발급하라고 알린다', async () => {
  mockList(page([]))
  renderApp(PATH, { me: admin })

  expect(
    await screen.findByRole('heading', { name: '아직 발급한 JEY 패스가 없어요' }),
  ).toBeInTheDocument()
  expect(screen.getByText('학생 상세에서 패스 발급을 눌러 발급해요.')).toBeInTheDocument()
})

test('링크 새로 만들기는 JEY 발급 패스의 주소로 보낸다', async () => {
  mockList()
  mockApi({ [link(1)]: () => jsonResponse({ id: 1, linkToken: 'newCampusToken' }) })
  await openPage()

  await userEvent.click(
    screen.getByRole('button', { name: '링크 새로 만들기 (김도윤, DT-J4K8QZ)' }),
  )
  const dialog = await screen.findByRole('dialog', { name: '링크를 새로 만들까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '새로 만들기' }))

  const done = await screen.findByRole('dialog', { name: '새 링크를 만들었어요' })
  expect(within(done).getByLabelText('학부모 링크')).toHaveValue(
    `${window.location.origin}/p/newCampusToken`,
  )
  expect(requestOf(link(1)).headers.get('Idempotency-Key')).toBeTruthy()
})

test('취소는 JEY 발급 패스의 주소로 보내고, 수강료 결제는 그대로라고 알리며 목록을 다시 받는다', async () => {
  mockList()
  mockApi({ [cancel(2)]: () => jsonResponse({ id: 2, state: 'CANCELED' }) })
  await openPage()

  await userEvent.click(screen.getByRole('button', { name: '패스 취소 (이서준, DT-EXP002)' }))
  const dialog = await screen.findByRole('dialog', { name: '패스를 취소할까요?' })
  expect(
    within(dialog).getByText('근거로 적은 수강료 결제는 그대로예요. 패스만 취소돼요.'),
  ).toBeInTheDocument()
  expect(within(dialog).queryByText(/환불/)).not.toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: '패스 취소하기' }))

  expect(
    await screen.findByText(
      '이서준 학생의 패스(DT-EXP002)를 취소했어요. 수강료 결제는 그대로예요.',
    ),
  ).toBeInTheDocument()
  expect(requestOf(cancel(2)).headers.get('Idempotency-Key')).toBeTruthy()
  await waitFor(() => expect(count(LIST)).toBe(2))
})

test('취소한 안내는 다른 조건으로 옮기면 지운다', async () => {
  mockList()
  mockApi({ [cancel(2)]: () => jsonResponse({ id: 2, state: 'CANCELED' }) })
  await openPage()

  await userEvent.click(screen.getByRole('button', { name: '패스 취소 (이서준, DT-EXP002)' }))
  const dialog = await screen.findByRole('dialog', { name: '패스를 취소할까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '패스 취소하기' }))
  await screen.findByText(/취소했어요/)

  await userEvent.click(screen.getByRole('radio', { name: '발급 취소' }))
  await waitFor(() => expect(screen.queryByText(/취소했어요/)).not.toBeInTheDocument())
})

test('그 사이 사용된 패스라는 답이면 알리고 목록을 다시 받는다', async () => {
  mockList()
  mockApi({
    [cancel(1)]: () =>
      problemResponse(409, {
        code: 'DONGTANPASS_PASS_ALREADY_REDEEMED',
        detail: '이미 사용된 패스입니다.',
      }),
  })
  await openPage()

  await userEvent.click(screen.getByRole('button', { name: '패스 취소 (김도윤, DT-J4K8QZ)' }))
  const dialog = await screen.findByRole('dialog', { name: '패스를 취소할까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '패스 취소하기' }))

  expect(
    await within(dialog).findByText('이미 사용된 패스입니다. 목록을 새로 불러왔어요.'),
  ).toBeInTheDocument()
  await waitFor(() => expect(count(LIST)).toBe(2))
})

test('서버가 기간이 틀렸다고 하면 다시 불러오기 대신 기간 칸을 고치게 한다', async () => {
  mockApi({
    [LIST]: () =>
      problemResponse(400, { code: 'DONGTANPASS_INVALID_PERIOD', detail: '기간이 잘못됐습니다.' }),
  })
  renderApp('/admin/passes?from=2026-10-01', { me: admin })

  expect(
    await screen.findByText('기간이 맞지 않아요. 기간 칸을 고친 뒤 조회해 주세요.'),
  ).toBeInTheDocument()
  // 다시 불러와도 같은 답이다.
  expect(screen.queryByRole('button', { name: '다시 불러오기' })).not.toBeInTheDocument()
})

test('주소의 학생이 없으면 그렇게 알린다', async () => {
  mockList(page([]))
  mockApi({
    'GET /api/v1/students/99': () =>
      problemResponse(404, {
        code: 'MEMBER_STUDENT_NOT_FOUND',
        detail: '학생을 찾을 수 없습니다.',
      }),
  })
  renderApp('/admin/passes?studentId=99', { me: admin })

  expect(await screen.findByText(/주소의 학생을 찾을 수 없어요/)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '이 학생에게 발급' })).not.toBeInTheDocument()
})

test('학생을 불러오지 못하면 알리고 다시 받게 한다', async () => {
  let fail = true
  mockList(page([issued]))
  mockApi({ 'GET /api/v1/students/5': () => (fail ? unreadableResponse() : jsonResponse(doyun)) })
  await openPage('/admin/passes?studentId=5')

  expect(await screen.findByText('학생 정보를 불러오지 못했어요.')).toBeInTheDocument()
  fail = false
  await userEvent.click(screen.getByRole('button', { name: '학생 정보 다시 불러오기' }))

  expect(await screen.findByRole('link', { name: '이 학생에게 발급' })).toBeInTheDocument()
  expect(screen.queryByText('학생 정보를 불러오지 못했어요.')).not.toBeInTheDocument()
})
