import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { UNSURE_RESEND_AS_IS } from '@/shared/api'
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
  unreadableResponse,
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
  // 지금 설정(BENEFIT, 5%)과 일부러 다르게 둔다. 결과에는 발급 때 패스에 남은 값을 보여 줘야 한다.
  discountRate: 0.07,
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
  expect(screen.getByText(/연계 학원 첫 달 수강료 7% 할인/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '이 학생의 패스 보기' })).toHaveAttribute(
    'href',
    '/admin/passes?studentId=5',
  )
  // 다음 발급을 위해 결제 금액·수단과 동의는 비운다(결제일은 남긴다).
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

test('발급한 뒤 이 학생의 패스를 보러 가면 방금 발급한 패스가 목록에 있다', async () => {
  const server = { items: [] as unknown[] }
  mockPage()
  mockApi({
    'GET /api/v1/dongtanpass/campus-passes': () =>
      jsonResponse({
        items: server.items,
        page: 0,
        size: 20,
        totalElements: server.items.length,
        totalPages: server.items.length > 0 ? 1 : 0,
      }),
    [ISSUE]: () => {
      server.items = [
        {
          id: issued.id,
          passNo: issued.passNo,
          studentId: 5,
          studentName: '김도윤',
          issuedAt: issued.issuedAt,
          issuedOn: '2026-10-20',
          expiresOn: issued.expiresOn,
          paidOn: '2026-10-20',
          paidAmount: 320000,
          paymentMethod: 'TRANSFER',
          discountRate: issued.discountRate,
          state: 'ISSUED',
        },
      ]
      return jsonResponse(issued, 201)
    },
  })
  // 목록을 먼저 본 뒤(받아 둔 빈 목록이 생긴다) 발급 화면으로 간다.
  renderApp('/admin/passes?studentId=5', { me: admin })
  await screen.findByRole('heading', { name: '아직 발급한 JEY 패스가 없어요' })
  await userEvent.click(await screen.findByRole('link', { name: '이 학생에게 발급' }))
  await screen.findByText(/학생 이름과 학부모 번호를 알려요/)
  await fillValid()
  await submitAndConfirm()

  await userEvent.click(await screen.findByRole('link', { name: '이 학생의 패스 보기' }))

  expect(await screen.findByText('DT-J4K8QZ')).toBeInTheDocument()
})

test('발급 응답을 받지 못하면 입력과 동의를 남긴 채 그대로 다시 누르게 하고, 같은 키로 다시 보낸다', async () => {
  mockPage()
  mockApi({ [ISSUE]: () => unreadableResponse() })
  await openPage()
  await fillValid()
  await submitAndConfirm()

  expect(await screen.findByText(new RegExp(UNSURE_RESEND_AS_IS))).toBeInTheDocument()
  const firstKey = requestOf(ISSUE).headers.get('Idempotency-Key')
  expect(screen.getByLabelText('결제 금액(원)')).toHaveValue('320,000')
  expect(screen.getByRole('checkbox', { name: '학부모에게 알리고 동의를 받았어요' })).toBeChecked()

  mockApi({ [ISSUE]: () => jsonResponse(issued, 201) })
  await submitAndConfirm()

  expect(await screen.findByText('DT-J4K8QZ')).toBeInTheDocument()
  expect(requestOf(ISSUE).headers.get('Idempotency-Key')).toBe(firstKey)
  expect(count(ISSUE)).toBe(2)
})

test('문구가 바뀌었다는 답 뒤 다시 동의하면 안내가 사라지고 새 문구의 버전으로 보낸다', async () => {
  let version = notice.version
  let reject = true
  mockPage()
  mockApi({
    [NOTICE]: () => jsonResponse({ ...notice, version }),
    [ISSUE]: () =>
      reject
        ? problemResponse(400, {
            code: 'DONGTANPASS_NOTICE_VERSION_MISMATCH',
            detail: '고지 문구가 바뀌었습니다.',
          })
        : jsonResponse(issued, 201),
  })
  await openPage()
  await fillValid()
  version = '2026-10-c2'
  await submitAndConfirm()
  const box = screen.getByRole('checkbox', { name: '학부모에게 알리고 동의를 받았어요' })
  await waitFor(() => expect(box).toHaveFocus())

  reject = false
  await userEvent.click(box)
  expect(screen.queryByText(/안내 문구가 바뀌었어요/)).not.toBeInTheDocument()
  await submitAndConfirm()

  expect(await screen.findByText('DT-J4K8QZ')).toBeInTheDocument()
  expect(requestOf(ISSUE).body).toMatchObject({ noticeVersion: '2026-10-c2' })
})

test('발급 응답의 할인율을 읽지 못해도 링크는 보여 준다', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  mockPage()
  mockApi({ [ISSUE]: () => jsonResponse({ ...issued, discountRate: 0.123456 }, 201) })
  await openPage()
  await fillValid()

  await submitAndConfirm()

  expect(await screen.findByRole('textbox', { name: '학부모 링크' })).toHaveValue(
    `${window.location.origin}/p/c4Mp9xQa2LtR7wZy`,
  )
  expect(screen.getByText(/할인율 확인 필요/)).toBeInTheDocument()
  expect(consoleError).toHaveBeenCalled()
  consoleError.mockRestore()
})

test('거부 뒤 학생을 다시 받지 못하면 학생 정보가 이전 것일 수 있다고 알리고 다시 받게 한다', async () => {
  let failStudent = false
  mockPage()
  mockApi({
    [STUDENT]: () => (failStudent ? unreadableResponse() : jsonResponse(student)),
    [ISSUE]: () =>
      problemResponse(409, {
        code: 'DONGTANPASS_STUDENT_HAS_NO_CONTACT',
        detail: '학부모나 학생의 연락처가 없어 발급할 수 없습니다. 연락처를 먼저 더해 주세요.',
      }),
  })
  await openPage()
  await fillValid()
  failStudent = true

  await submitAndConfirm()

  expect(
    await screen.findByText('학생 정보를 새로 불러오지 못했어요. 아래는 이전 내용일 수 있어요.'),
  ).toBeInTheDocument()
  failStudent = false
  await userEvent.click(screen.getByRole('button', { name: '학생 정보 다시 불러오기' }))
  await waitFor(() =>
    expect(screen.queryByText(/학생 정보를 새로 불러오지 못했어요/)).not.toBeInTheDocument(),
  )
})

test('그 사이 학생이 지워졌다는 답이면 학생을 다시 받아 없는 학생이라고 알린다', async () => {
  const server = mockPage()
  let gone = false
  mockApi({
    [STUDENT]: () =>
      gone
        ? problemResponse(404, {
            code: 'MEMBER_STUDENT_NOT_FOUND',
            detail: '학생을 찾을 수 없습니다.',
          })
        : jsonResponse(server.student),
    [ISSUE]: () =>
      problemResponse(404, {
        code: 'DONGTANPASS_STUDENT_NOT_FOUND',
        detail: '학생을 찾을 수 없습니다.',
      }),
  })
  await openPage()
  await fillValid()
  gone = true

  await submitAndConfirm()

  expect(
    await screen.findByRole('heading', { level: 1, name: '없는 학생이에요' }),
  ).toBeInTheDocument()
})

test('답을 받지 못한 뒤 고지 문구가 바뀌어 다시 동의하면, 이 학생의 패스 목록부터 확인하라고 경고한다', async () => {
  let version = notice.version
  mockPage()
  mockApi({
    [NOTICE]: () => jsonResponse({ ...notice, version }),
    [ISSUE]: () => unreadableResponse(),
  })
  const { queryClient } = renderApp(PATH, { me: admin })
  await screen.findByText(/학생 이름과 학부모 번호를 알려요/)
  await fillValid()
  await submitAndConfirm()
  await screen.findByText(new RegExp(UNSURE_RESEND_AS_IS))

  version = '2026-10-c2'
  await queryClient.refetchQueries({ queryKey: ['dongtanpass', 'campus-consent-notice'] })
  const box = screen.getByRole('checkbox', { name: '학부모에게 알리고 동의를 받았어요' })
  await waitFor(() => expect(box).not.toBeChecked())
  await userEvent.click(box)
  await userEvent.click(screen.getByRole('button', { name: '패스 발급하기' }))

  const dialog = await screen.findByRole('dialog', { name: '이대로 발급할까요?' })
  expect(dialog).toHaveTextContent('이미 발급됐을 수 있어요')
  expect(within(dialog).getByRole('link', { name: '패스 목록(새 탭)' })).toHaveAttribute(
    'href',
    '/admin/passes?studentId=5',
  )
  const firstKey = requestOf(ISSUE).headers.get('Idempotency-Key')

  // 확인하고도 보낸다. 새 버전이라 새 키로 나간다. 이번에는 답을 받아(거부) 결과를 안다.
  mockApi({
    [ISSUE]: () =>
      problemResponse(400, { code: 'DONGTANPASS_INVALID_PAID_AMOUNT', detail: '금액 오류' }),
  })
  await userEvent.click(within(dialog).getByRole('button', { name: '그래도 발급하기' }))
  await screen.findByText('금액 오류')
  expect(requestOf(ISSUE).body).toMatchObject({ noticeVersion: '2026-10-c2' })
  expect(requestOf(ISSUE).headers.get('Idempotency-Key')).not.toBe(firstKey)

  // 경고를 보고 보냈으니, 또 내용을 바꿔도 다시 경고하지 않는다.
  const amount = screen.getByLabelText('결제 금액(원)')
  await userEvent.clear(amount)
  await userEvent.type(amount, '330,000')
  await userEvent.click(screen.getByRole('button', { name: '패스 발급하기' }))
  expect(await screen.findByRole('dialog', { name: '이대로 발급할까요?' })).not.toHaveTextContent(
    '이미 발급됐을 수 있어요',
  )
})

test('같은 내용으로 다시 보내 답을 받으면 결과를 안 것이라, 그 뒤 내용을 바꿔도 경고하지 않는다', async () => {
  mockPage()
  mockApi({ [ISSUE]: () => unreadableResponse() })
  await openPage()
  await fillValid()
  await submitAndConfirm()
  await screen.findByText(new RegExp(UNSURE_RESEND_AS_IS))
  mockApi({
    [ISSUE]: () =>
      problemResponse(400, { code: 'DONGTANPASS_INVALID_PAID_AMOUNT', detail: '금액 오류' }),
  })
  await submitAndConfirm()
  await screen.findByText('금액 오류')

  const amount = screen.getByLabelText('결제 금액(원)')
  await userEvent.clear(amount)
  await userEvent.type(amount, '330,000')
  await userEvent.click(screen.getByRole('button', { name: '패스 발급하기' }))

  expect(await screen.findByRole('dialog', { name: '이대로 발급할까요?' })).not.toHaveTextContent(
    '이미 발급됐을 수 있어요',
  )
})
