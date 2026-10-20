import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { todayInSeoul } from '@/shared/lib'
import { setupDialog } from '@/test/dialog'
import {
  expectNoRequests,
  jsonResponse,
  mockApi,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
} from '@/test/mockApi'
import { admin, staff, renderApp } from '@/test/renderApp'
import type { CampusIssuedPass, ConsentNotice, IssueStudent } from '../api'

setupMockApi()
setupDialog()

const PATH = '/admin/passes/new?studentId=5'
const STUDENT = 'GET /api/v1/students/5'
const NOTICE = 'GET /api/v1/dongtanpass/campus-passes/consent-notice'
const BENEFIT = 'GET /api/v1/dongtanpass/campus-benefit'
const ISSUE = 'POST /api/v1/dongtanpass/campus-passes'

const notice: ConsentNotice = {
  version: '2026-10-c1',
  text: 'JEY 어학원이 연계 학원에 학생 이름과 학부모 번호를 알려요\n보관 기간: 패스 만료 후 1년',
}

const student: IssueStudent = {
  id: 5,
  campusId: 1,
  classId: null,
  name: '김도윤',
  grade: 'MIDDLE_1',
  school: null,
  phone: null,
  status: 'ENROLLED',
  registeredAt: '2026-03-02',
  guardians: [
    { id: 7, relation: 'MOTHER', name: '이영희', phone: '010-****-5678', linkedToExisting: false },
  ],
  primaryContact: { name: '이영희', relation: 'MOTHER', phone: '010-****-5678' },
  siblings: [],
}

const issued: CampusIssuedPass = {
  id: 31,
  passNo: 'DT-J4K8QZ',
  linkToken: 'c4Mp9xQa2LtR7wZy',
  issuedAt: '2026-10-20T01:00:00Z',
  expiresOn: '2026-11-20',
  discountRate: 0.05,
}

function mockPage(target: IssueStudent = student) {
  const server = { student: target }
  mockApi({
    [STUDENT]: () => jsonResponse(server.student),
    [NOTICE]: () => jsonResponse(notice),
    [BENEFIT]: () => jsonResponse({ discountRate: 0.05 }),
  })
  return server
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

async function openPage() {
  renderApp(PATH, { me: admin })
  await screen.findByText(/학생 이름과 학부모 번호를 알려요/)
}

async function fillValid() {
  await userEvent.type(screen.getByLabelText('결제 금액(원)'), '320,000')
  await userEvent.click(screen.getByRole('radio', { name: '계좌이체' }))
  await userEvent.click(screen.getByRole('checkbox', { name: '학부모에게 알리고 동의를 받았어요' }))
}

async function submitAndConfirm() {
  await userEvent.click(screen.getByRole('button', { name: '패스 발급하기' }))
  const dialog = await screen.findByRole('dialog', { name: '이대로 발급할까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '발급하기' }))
}

test('직원은 이 화면을 볼 수 없고 아무것도 요청하지 않는다', async () => {
  renderApp(PATH, { me: staff })

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expectNoRequests()
})

test('학생 없이 들어오면 학생을 고르게 하고 아무것도 요청하지 않는다', async () => {
  renderApp('/admin/passes/new', { me: admin })

  expect(
    await screen.findByRole('heading', { level: 1, name: '발급할 학생을 먼저 골라 주세요' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '학생 목록으로' })).toHaveAttribute(
    'href',
    '/desk/students',
  )
  expectNoRequests()
})

test('없는 학생이면 그렇게 알린다', async () => {
  mockApi({
    [STUDENT]: () =>
      problemResponse(404, {
        code: 'MEMBER_STUDENT_NOT_FOUND',
        detail: '학생을 찾을 수 없습니다.',
      }),
  })
  renderApp(PATH, { me: admin })

  expect(
    await screen.findByRole('heading', { level: 1, name: '없는 학생이에요' }),
  ).toBeInTheDocument()
})

test('받는 학생과 대표 연락처(가린 번호), 지금 할인율을 보여 준다. 학부모 번호 입력 칸은 없다', async () => {
  mockPage()
  await openPage()

  expect(screen.getByRole('heading', { level: 1, name: 'JEY 패스 발급' })).toBeInTheDocument()
  expect(screen.getByText('이영희 010-****-5678')).toBeInTheDocument()
  expect(await screen.findByText('연계 학원 첫 달 수강료 5%')).toBeInTheDocument()
  expect(screen.queryByLabelText('학부모 휴대전화')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('학생 이름')).not.toBeInTheDocument()
  expect(screen.getByLabelText('결제일')).toHaveValue(todayInSeoul())
  expect(screen.getByRole('link', { name: '김도윤 학생 상세' })).toHaveAttribute(
    'href',
    '/desk/students/5',
  )
})

test('학생 ID와 근거 결제, 동의한 문구의 버전을 보내고 패스 번호·링크·할인율을 보여 준다', async () => {
  mockPage()
  mockApi({ [ISSUE]: () => jsonResponse(issued, 201) })
  await openPage()
  await fillValid()

  await userEvent.click(screen.getByRole('button', { name: '패스 발급하기' }))
  const dialog = await screen.findByRole('dialog', { name: '이대로 발급할까요?' })
  expect(within(dialog).getByText('김도윤')).toBeInTheDocument()
  expect(within(dialog).getByText('320,000원')).toBeInTheDocument()
  expect(within(dialog).getByText('계좌이체')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: '발급하기' }))

  expect(await screen.findByText('DT-J4K8QZ')).toBeInTheDocument()
  const request = requestOf(ISSUE)
  expect(request.body).toEqual({
    studentId: 5,
    paidOn: todayInSeoul(),
    paidAmount: 320000,
    paymentMethod: 'TRANSFER',
    consentConfirmed: true,
    noticeVersion: '2026-10-c1',
  })
  expect(request.headers.get('Idempotency-Key')).toBeTruthy()
  expect(screen.getByRole('textbox', { name: '학부모 링크' })).toHaveValue(
    `${window.location.origin}/p/c4Mp9xQa2LtR7wZy`,
  )
  expect(screen.getByText(/김도윤 학생 · 2026.11.20까지 사용 가능/)).toBeInTheDocument()
  expect(
    screen.getByText(
      '이 링크는 지금만 볼 수 있어요. 잃어버리면 JEY 패스 목록에서 링크를 새로 만들어 주세요.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByText(/연계 학원 첫 달 수강료 5% 할인/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '이 학생의 패스 보기' })).toHaveAttribute(
    'href',
    '/admin/passes?studentId=5',
  )
  // 다음 달 발급을 위해 결제 칸과 동의는 비운다.
  expect(screen.getByLabelText('결제 금액(원)')).toHaveValue('')
  expect(
    screen.getByRole('checkbox', { name: '학부모에게 알리고 동의를 받았어요' }),
  ).not.toBeChecked()
})

test('결제 칸이 비었으면 알리고 보내지 않는다', async () => {
  mockPage()
  await openPage()
  await userEvent.click(screen.getByRole('checkbox', { name: '학부모에게 알리고 동의를 받았어요' }))

  await userEvent.click(screen.getByRole('button', { name: '패스 발급하기' }))

  expect(screen.getByText('결제 금액을 입력해 주세요.')).toBeInTheDocument()
  expect(screen.getByText('결제 수단을 골라 주세요.')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(count(ISSUE)).toBe(0)
})

test('퇴원한 학생이면 알리고 발급 버튼을 막는다', async () => {
  mockPage({ ...student, status: 'WITHDRAWN' })
  await openPage()
  await fillValid()

  expect(
    screen.getByText('퇴원한 학생이에요. 재원 중인 학생에게만 발급할 수 있어요.'),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '패스 발급하기' })).toBeDisabled()
})

test('연락처가 없는 학생이면 학생 상세에서 더하게 하고 발급 버튼을 막는다', async () => {
  mockPage({ ...student, guardians: [], primaryContact: null })
  await openPage()
  await fillValid()

  expect(screen.getByText('없음')).toBeInTheDocument()
  expect(screen.getByText(/연락처가 없어 발급할 수 없어요/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '학생 상세' })).toHaveAttribute(
    'href',
    '/desk/students/5',
  )
  expect(screen.getByRole('button', { name: '패스 발급하기' })).toBeDisabled()
})

test('서버가 학생 때문에 거부하면 그 안내를 보여 주고 학생을 다시 받는다', async () => {
  const server = mockPage()
  mockApi({
    [ISSUE]: () =>
      problemResponse(409, {
        code: 'DONGTANPASS_STUDENT_NOT_ENROLLED',
        detail: '재원 중인 학생에게만 발급할 수 있습니다.',
      }),
  })
  await openPage()
  await fillValid()
  const before = count(STUDENT)
  server.student = { ...student, status: 'WITHDRAWN' }

  await submitAndConfirm()

  expect(await screen.findByText('재원 중인 학생에게만 발급할 수 있습니다.')).toBeInTheDocument()
  await waitFor(() => expect(count(STUDENT)).toBeGreaterThan(before))
  expect(
    await screen.findByText('퇴원한 학생이에요. 재원 중인 학생에게만 발급할 수 있어요.'),
  ).toBeInTheDocument()
})

test('다른 지점의 학생이라는 답은 서버의 안내를 그대로 보여 준다', async () => {
  mockPage()
  mockApi({
    [ISSUE]: () =>
      problemResponse(409, {
        code: 'DONGTANPASS_STUDENT_NOT_AT_ISSUING_CAMPUS',
        detail: '패스를 발급하는 지점의 학생이 아닙니다.',
      }),
  })
  await openPage()
  await fillValid()

  await submitAndConfirm()

  expect(await screen.findByText('패스를 발급하는 지점의 학생이 아닙니다.')).toBeInTheDocument()
})

test('문구가 바뀌었다는 답이면 새 문구를 받아 다시 동의하게 한다', async () => {
  let version = notice.version
  mockPage()
  mockApi({
    [NOTICE]: () => jsonResponse({ ...notice, version }),
    [ISSUE]: () =>
      problemResponse(400, {
        code: 'DONGTANPASS_NOTICE_VERSION_MISMATCH',
        detail: '고지 문구가 바뀌었습니다.',
      }),
  })
  await openPage()
  await fillValid()
  version = '2026-10-c2'

  await submitAndConfirm()

  expect(
    await screen.findByText(
      '안내 문구가 바뀌었어요. 바뀐 문구를 학부모에게 다시 알리고 확인해 주세요.',
    ),
  ).toBeInTheDocument()
  const box = screen.getByRole('checkbox', { name: '학부모에게 알리고 동의를 받았어요' })
  await waitFor(() => expect(box).toHaveFocus())
  expect(box).not.toBeChecked()
  expect(screen.getByRole('button', { name: '패스 발급하기' })).toBeDisabled()
})
