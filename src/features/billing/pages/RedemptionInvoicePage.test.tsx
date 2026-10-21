import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { UNSURE_RESEND_AS_IS } from '@/shared/api'
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
import { admin, partner, renderApp, staff } from '@/test/renderApp'
import type { BillingStudent, DiscountType, Invoice, InvoiceRequest } from '../api'

setupMockApi()

const PATH = '/desk/billing/new?redemptionId=300&studentId=16'
const STUDENT = 'GET /api/v1/students/16'
const CLASSES = 'GET /api/v1/classes'
const DISCOUNTS = 'GET /api/v1/discount-types'
const QUOTE = 'POST /api/v1/billing/quote'
const ISSUE = 'POST /api/v1/dongtanpass/redemptions/300/invoice'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const student: BillingStudent = {
  id: 16,
  campusId: 1,
  classId: 10,
  name: '김하윤',
  grade: 'MIDDLE_1',
  school: null,
  phone: null,
  status: 'ENROLLED',
  registeredAt: '2026-10-18',
  guardians: [],
  primaryContact: null,
  siblings: [],
}

const classes = [
  { id: 10, campusId: 1, name: '중1 정규' },
  { id: 11, campusId: 1, name: '중1 문법' },
  // 다른 지점의 반. 이 학생에게는 고를 수 없다.
  { id: 20, campusId: 2, name: '능동 중1' },
]

const discount = (code: string, name: string, rate: number, active = true): DiscountType => ({
  id: code.length,
  code,
  name,
  rate,
  active,
})

const discountTypes: DiscountType[] = [
  // 패스 할인은 서버가 붙인다. 직원이 고르는 목록에 없다.
  discount('DONGTAN_PASS', '동탄고 패스', 0.05),
  discount('SIBLING_5', '형제 할인', 0.05),
  discount('MULTI_3', '다과목 할인', 0.03),
  discount('OLD_10', '지난 행사 할인', 0.1, false),
  discount('STAFF_10', '직원 자녀 할인', 0.1),
  discount('EARLY_2', '조기 등록 할인', 0.02),
]

/** 서버의 미리 계산. 280,000원 반 · 9회 · 5%면 315,000 − 15,750 = 299,250원이다(손 계산 장부와 같은 값). */
function quoteOf(body: InvoiceRequest): Invoice {
  const lines = body.lines.map((line) => {
    const discounts = (body.discountCodes ?? []).map((code) => ({
      code,
      name: code === 'DONGTAN_PASS' ? '동탄고 패스' : '형제 할인',
      rate: 0.05,
      amount: 15_750,
    }))
    const listAmount = 35_000 * line.lessonCount
    return {
      classId: line.classId,
      className: classes.find((item) => item.id === line.classId)?.name ?? '?',
      lessonCount: line.lessonCount,
      listAmount,
      chargeAmount: listAmount - 15_750 * discounts.length,
      discounts,
    }
  })
  return {
    id: null,
    status: null,
    studentId: body.studentId,
    campusId: 1,
    targetMonth: body.targetMonth,
    discountPolicy: 'ADDITIVE',
    payment: null,
    lines,
    totalAmount: lines.reduce((sum, line) => sum + line.chargeAmount, 0),
  }
}

function mockPage(overrides: Partial<BillingStudent> = {}) {
  mockApi({
    [STUDENT]: () => jsonResponse({ ...student, ...overrides }),
    [CLASSES]: () => jsonResponse(classes),
    [DISCOUNTS]: () => jsonResponse(discountTypes),
    [QUOTE]: ({ body }) => jsonResponse(quoteOf(body as InvoiceRequest)),
    [ISSUE]: () => jsonResponse({ redemptionId: 300, invoiceId: 501, totalAmount: 299_250 }, 201),
  })
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

async function openPage(me = staff) {
  const rendered = renderApp(PATH, { me })
  await screen.findByRole('heading', { level: 1, name: '수강료 청구 만들기' })
  // 반 목록을 받아 학생의 지금 반이 골라질 때까지
  await waitFor(() => expect(screen.getByRole('combobox', { name: '반' })).toHaveValue('10'))
  return rendered
}

const lessonCount = (name = '수업 횟수') => screen.getByRole('textbox', { name })
const createButton = () => screen.getByRole('button', { name: '청구 만들기' })
const receipt = () => screen.getByRole('region', { name: '결제 금액' })

async function typeCount(text: string, name?: string) {
  await userEvent.clear(lessonCount(name))
  await userEvent.type(lessonCount(name), text)
}

/** 금액을 받아 "청구 만들기"를 누를 수 있을 때까지 */
async function waitForQuote() {
  await waitFor(() => expect(createButton()).toBeEnabled())
}

beforeEach(() => {
  // 한국의 오늘은 2026-10-21이다. 대상 월은 10월과 11월에서 고른다.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T10:00:00+09:00') })
})

afterEach(() => {
  vi.useRealTimers()
})

test('연계 학원은 이 화면을 볼 수 없고 아무것도 요청하지 않는다', async () => {
  renderApp(PATH, { me: partner })

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expectNoRequests()
})

test.each([
  ['사용 기록이 없는 주소', '/desk/billing/new?studentId=16'],
  ['학생이 없는 주소', '/desk/billing/new?redemptionId=300'],
  ['사용 기록 번호가 글자인 주소', '/desk/billing/new?redemptionId=abc&studentId=16'],
])('%s면 사용 내역으로 안내하고 아무것도 요청하지 않는다', async (_name, path) => {
  renderApp(path, { me: staff })

  expect(
    await screen.findByRole('heading', {
      level: 1,
      name: '청구할 패스 사용 기록을 먼저 골라 주세요',
    }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '패스 사용 내역으로' })).toHaveAttribute(
    'href',
    '/desk/dongtanpass/redemptions',
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
  renderApp(PATH, { me: staff })

  expect(
    await screen.findByRole('heading', { level: 1, name: '없는 학생이에요' }),
  ).toBeInTheDocument()
})

test('학생의 지금 반을 미리 고르고, 반은 학생 지점의 것만, 할인은 켜진 추가 할인만 보여 준다', async () => {
  mockPage()
  await openPage()

  const classOptions = within(screen.getByRole('combobox', { name: '반' }))
    .getAllByRole('option')
    .map((option) => option.textContent)
  expect(classOptions).toEqual(['반 고르기', '중1 정규', '중1 문법'])

  const discountGroup = screen.getByRole('group', { name: '추가 할인 (선택)' })
  expect(
    within(discountGroup)
      .getAllByRole('checkbox')
      .map((box) => box.getAttribute('aria-label') ?? box.closest('label')?.textContent),
  ).toEqual(['형제 할인 5%', '다과목 할인 3%', '직원 자녀 할인 10%', '조기 등록 할인 2%'])

  // 대상 월은 이번 달이 먼저 골라져 있다.
  const months = screen.getByRole('radiogroup', { name: '대상 월' })
  expect(within(months).getByRole('radio', { name: '2026년 10월' })).toBeChecked()
  expect(within(months).getByRole('radio', { name: '2026년 11월' })).not.toBeChecked()

  // 횟수를 적기 전에는 계산하지 않고, 만들 수 없는 까닭을 알린다.
  expect(createButton()).toBeDisabled()
  expect(screen.getByText('반과 수업 횟수를 적으면 금액을 계산해요.')).toBeInTheDocument()
  expect(count(QUOTE)).toBe(0)
})

test('반이 없는 학생은 반을 미리 고르지 않는다', async () => {
  mockPage({ classId: null })
  renderApp(PATH, { me: staff })

  await screen.findByRole('option', { name: '중1 정규' })
  expect(screen.getByRole('combobox', { name: '반' })).toHaveValue('')
})

test('횟수를 적으면 잠시 뒤 패스 할인을 맨 앞에 넣어 미리 계산하고, 서버가 준 금액을 보여 준다', async () => {
  mockPage()
  await openPage()

  await userEvent.click(screen.getByRole('checkbox', { name: '형제 할인 5%' }))
  // "1"을 적었다가 "10"으로 고치는 사이에는 묻지 않는다.
  await typeCount('9')
  await waitForQuote()

  expect(count(QUOTE)).toBe(1)
  expect(requestOf(QUOTE).body).toEqual({
    studentId: 16,
    targetMonth: '2026-10',
    lines: [{ classId: 10, lessonCount: 9 }],
    discountCodes: ['DONGTAN_PASS', 'SIBLING_5'],
  })
  const rows = within(receipt()).getAllByRole('term')
  expect(rows.map((row) => row.textContent)).toEqual([
    '중1 정규 · 9회',
    '동탄고 패스 5%',
    '형제 할인 5%',
  ])
  expect(
    within(receipt())
      .getAllByRole('definition')
      .map((value) => value.textContent),
  ).toEqual(['315,000원', '−15,750원', '−15,750원'])
  expect(within(receipt()).getByText('받을 금액').nextSibling).toHaveTextContent('283,500원')
  expect(receipt()).toHaveTextContent('할인이 여럿이면 할인율을 더해 한 번에 빼요.')
})

test('횟수를 빠르게 고치면 멈춘 뒤의 값으로 한 번만 계산한다', async () => {
  mockPage()
  await openPage()

  await userEvent.type(lessonCount(), '10')
  await waitForQuote()

  expect(count(QUOTE)).toBe(1)
  expect(requestOf(QUOTE).body).toMatchObject({ lines: [{ classId: 10, lessonCount: 10 }] })
})

test('고친 뒤 새 금액을 받기 전에는 옛 금액으로 청구를 만들 수 없다', async () => {
  mockPage()
  await openPage()
  await typeCount('9')
  await waitForQuote()

  await typeCount('8')

  // 바로 막는다(멈춘 뒤 계산할 때까지 기다리지 않는다). 9회의 금액도 거둔다.
  expect(createButton()).toBeDisabled()
  expect(receipt()).not.toHaveTextContent('315,000원')
  expect(within(receipt()).getByRole('status')).toHaveTextContent('금액을 계산하고 있어요.')

  await waitForQuote()
  expect(receipt()).toHaveTextContent('280,000원')
})

test.each([
  ['0', '1회부터 31회까지 적을 수 있어요.'],
  ['32', '1회부터 31회까지 적을 수 있어요.'],
  ['8회', '1회부터 31회까지 적을 수 있어요.'],
])('횟수 %s는 칸에 알리고 계산하지 않는다', async (text, message) => {
  mockPage()
  await openPage()

  await typeCount(text)

  expect(lessonCount()).toHaveAccessibleDescription(message)
  expect(createButton()).toBeDisabled()
  // 멈출 시간을 넘겨도 묻지 않는다.
  await new Promise((resolve) => setTimeout(resolve, 500))
  expect(count(QUOTE)).toBe(0)
})

test('반을 더해 반 나눔을 적고, 같은 반을 두 번 고르면 막는다. 4개 반까지, 빼기도 된다', async () => {
  mockPage()
  await openPage()
  await typeCount('5')

  await userEvent.click(screen.getByRole('button', { name: '반 더하기 (반 나눔)' }))
  // 반이 둘이면 칸 이름에 순서가 붙는다.
  const second = screen.getByRole('combobox', { name: '2번째 반' })
  await userEvent.selectOptions(second, '중1 정규')
  expect(second).toHaveAccessibleDescription('같은 반을 두 번 골랐어요.')

  await userEvent.selectOptions(second, '중1 문법')
  await typeCount('4', '2번째 반 수업 횟수')
  await waitForQuote()
  expect(requestOf(QUOTE).body).toMatchObject({
    lines: [
      { classId: 10, lessonCount: 5 },
      { classId: 11, lessonCount: 4 },
    ],
  })
  // 반이 여럿이면 반마다의 청구액도 보여 준다.
  expect(within(receipt()).getAllByText('이 반 청구액')).toHaveLength(2)

  await userEvent.click(screen.getByRole('button', { name: '반 더하기 (반 나눔)' }))
  await userEvent.click(screen.getByRole('button', { name: '반 더하기 (반 나눔)' }))
  expect(screen.getAllByRole('combobox')).toHaveLength(4)
  expect(screen.queryByRole('button', { name: '반 더하기 (반 나눔)' })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '2번째 반 빼기' }))
  await userEvent.click(screen.getByRole('button', { name: '2번째 반 빼기' }))
  await userEvent.click(screen.getByRole('button', { name: '2번째 반 빼기' }))
  expect(screen.getByRole('combobox', { name: '반' })).toHaveValue('10')
  expect(screen.queryByRole('button', { name: /빼기$/ })).not.toBeInTheDocument()
})

test('추가 할인은 3개까지 고를 수 있고, 목록의 순서대로 보낸다', async () => {
  mockPage()
  await openPage()

  await userEvent.click(screen.getByRole('checkbox', { name: '직원 자녀 할인 10%' }))
  await userEvent.click(screen.getByRole('checkbox', { name: '형제 할인 5%' }))
  await userEvent.click(screen.getByRole('checkbox', { name: '조기 등록 할인 2%' }))

  expect(screen.getByRole('checkbox', { name: '다과목 할인 3%' })).toBeDisabled()
  await typeCount('8')
  await waitForQuote()
  expect(requestOf(QUOTE).body).toMatchObject({
    discountCodes: ['DONGTAN_PASS', 'SIBLING_5', 'STAFF_10', 'EARLY_2'],
  })

  await userEvent.click(screen.getByRole('checkbox', { name: '형제 할인 5%' }))
  expect(screen.getByRole('checkbox', { name: '다과목 할인 3%' })).toBeEnabled()
})

test('청구를 만들면 패스 할인 없이 고른 것만 멱등 키와 함께 보내고, 받을 금액을 보여 준다', async () => {
  mockPage()
  await openPage()
  await userEvent.click(screen.getByRole('radio', { name: '2026년 11월' }))
  await userEvent.click(screen.getByRole('checkbox', { name: '형제 할인 5%' }))
  await typeCount('9')
  await waitForQuote()

  await userEvent.click(createButton())

  const title = await screen.findByRole('heading', { name: '수강료 청구를 만들었어요' })
  expect(count(ISSUE)).toBe(1)
  // 패스 할인은 서버가 붙인다. 보내면 400이다.
  expect(requestOf(ISSUE).body).toEqual({
    targetMonth: '2026-11',
    lines: [{ classId: 10, lessonCount: 9 }],
    discountCodes: ['SIBLING_5'],
  })
  expect(requestOf(ISSUE).headers.get('Idempotency-Key')).toMatch(UUID)

  expect(title).toHaveFocus()
  const done = title.closest('section')!
  expect(
    within(done)
      .getAllByRole('definition')
      .map((value) => value.textContent),
  ).toEqual(['김하윤', '2026년 11월', '299,250원', '501'])
  expect(done).toHaveTextContent('결제를 받으면 지금처럼 장부에 적어 주세요.')
  expect(within(done).getByRole('link', { name: '다음 패스 확인하기' })).toHaveAttribute(
    'href',
    '/desk/dongtanpass',
  )
  expect(within(done).getByRole('link', { name: '학생 정보 보기' })).toHaveAttribute(
    'href',
    '/desk/students/16',
  )
})

test('관리자도 청구를 만들 수 있다', async () => {
  mockPage()
  await openPage(admin)
  await typeCount('8')
  await waitForQuote()

  await userEvent.click(createButton())

  expect(
    await screen.findByRole('heading', { name: '수강료 청구를 만들었어요' }),
  ).toBeInTheDocument()
})

test('응답을 받지 못하면 그대로 다시 누르게 하고, 같은 키로 다시 보낸다', async () => {
  mockPage()
  mockApi({ [ISSUE]: () => unreadableResponse() })
  await openPage()
  await typeCount('9')
  await waitForQuote()

  await userEvent.click(createButton())

  expect(await screen.findByText(new RegExp(UNSURE_RESEND_AS_IS))).toBeInTheDocument()
  const firstKey = requestOf(ISSUE).headers.get('Idempotency-Key')

  mockApi({
    [ISSUE]: () => jsonResponse({ redemptionId: 300, invoiceId: 501, totalAmount: 299_250 }, 201),
  })
  await userEvent.click(createButton())

  expect(
    await screen.findByRole('heading', { name: '수강료 청구를 만들었어요' }),
  ).toBeInTheDocument()
  expect(count(ISSUE)).toBe(2)
  expect(requestOf(ISSUE).headers.get('Idempotency-Key')).toBe(firstKey)
})

test('이미 청구가 있는 사용 기록이면 서버의 안내를 보여 준다', async () => {
  mockPage()
  mockApi({
    [ISSUE]: () =>
      problemResponse(409, {
        code: 'DONGTANPASS_REDEMPTION_ALREADY_INVOICED',
        detail:
          '이 패스 사용 기록의 청구가 이미 있습니다. 다시 만들려면 그 청구를 먼저 취소해 주세요.',
      }),
  })
  await openPage()
  await typeCount('9')
  await waitForQuote()

  await userEvent.click(createButton())

  expect(
    await screen.findByText(
      '이 패스 사용 기록의 청구가 이미 있습니다. 다시 만들려면 그 청구를 먼저 취소해 주세요.',
    ),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: '수강료 청구를 만들었어요' }),
  ).not.toBeInTheDocument()
})

test('그 달 청구가 이미 있으면 대상 월에 알린다', async () => {
  mockPage()
  mockApi({
    [ISSUE]: () =>
      problemResponse(409, {
        code: 'BILLING_INVOICE_ALREADY_EXISTS',
        detail: '이 학생의 그 달 청구가 이미 있습니다. 새로 만들려면 그 청구를 먼저 취소해 주세요.',
      }),
  })
  await openPage()
  await typeCount('9')
  await waitForQuote()

  await userEvent.click(createButton())

  await waitFor(() =>
    expect(screen.getByRole('radiogroup', { name: '대상 월' })).toHaveAccessibleDescription(
      '이 학생의 그 달 청구가 이미 있습니다. 새로 만들려면 그 청구를 먼저 취소해 주세요.',
    ),
  )
})

test('반이 그사이 꺼졌다는 답이면 반 칸에 알리고 반 목록을 다시 받는다', async () => {
  mockPage()
  mockApi({
    [ISSUE]: () =>
      problemResponse(409, { code: 'BILLING_CLASS_INACTIVE', detail: '운영하지 않는 반입니다.' }),
  })
  await openPage()
  await typeCount('9')
  await waitForQuote()
  const before = count(CLASSES)

  await userEvent.click(createButton())

  const group = screen.getByRole('group', { name: '반과 수업 횟수' })
  expect(await within(group).findByText('운영하지 않는 반입니다.')).toBeInTheDocument()
  await waitFor(() => expect(count(CLASSES)).toBe(before + 1))
})

test('할인을 거부하면 할인 칸에 알리고 할인 목록을 다시 받는다', async () => {
  mockPage()
  mockApi({
    [ISSUE]: () =>
      problemResponse(409, {
        code: 'BILLING_DISCOUNT_TYPE_INACTIVE',
        detail: '쓰지 않는 할인 유형입니다.',
      }),
  })
  await openPage()
  await typeCount('9')
  await waitForQuote()
  const before = count(DISCOUNTS)

  await userEvent.click(createButton())

  const group = screen.getByRole('group', { name: '추가 할인 (선택)' })
  expect(await within(group).findByText('쓰지 않는 할인 유형입니다.')).toBeInTheDocument()
  await waitFor(() => expect(count(DISCOUNTS)).toBe(before + 1))
})

test('패스 할인이 꺼졌다는 답은 화면 아래에 알린다', async () => {
  mockPage()
  mockApi({
    [ISSUE]: () =>
      problemResponse(409, {
        code: 'DONGTANPASS_DISCOUNT_INACTIVE',
        detail: '동탄고 패스 할인이 꺼져 있습니다.',
      }),
  })
  await openPage()
  await typeCount('9')
  await waitForQuote()

  await userEvent.click(createButton())

  expect(await screen.findByText('동탄고 패스 할인이 꺼져 있습니다.')).toBeInTheDocument()
})

test('퇴원한 학생이면 알리고 계산하지도 만들지도 않는다', async () => {
  mockPage({ status: 'WITHDRAWN' })
  await openPage()

  await typeCount('9')

  expect(
    screen.getByText('퇴원한 학생이에요. 재원 중인 학생만 청구할 수 있어요.'),
  ).toBeInTheDocument()
  expect(createButton()).toBeDisabled()
  expect(screen.getByText('퇴원한 학생이라 청구를 만들 수 없어요.')).toBeInTheDocument()
  await new Promise((resolve) => setTimeout(resolve, 500))
  expect(count(QUOTE)).toBe(0)
})

test('계산을 거부하면 영수증에 까닭을 알리고, 다시 계산하기는 두지 않는다', async () => {
  mockPage()
  mockApi({
    [QUOTE]: () =>
      problemResponse(400, {
        code: 'BILLING_TOO_MANY_DISCOUNTS',
        detail: '지금 설정에서는 할인을 하나만 고를 수 있습니다.',
      }),
  })
  await openPage()
  await userEvent.click(screen.getByRole('checkbox', { name: '형제 할인 5%' }))
  await typeCount('9')

  expect(
    await within(receipt()).findByText(
      '금액을 계산하지 못했어요. 지금 설정에서는 할인을 하나만 고를 수 있습니다.',
    ),
  ).toBeInTheDocument()
  expect(within(receipt()).queryByRole('button', { name: '다시 계산하기' })).not.toBeInTheDocument()
  expect(createButton()).toBeDisabled()
  expect(screen.getByText('금액을 계산해야 만들 수 있어요.')).toBeInTheDocument()
})

test('계산 응답을 받지 못하면 다시 계산할 수 있다', async () => {
  mockPage()
  let fail = true
  mockApi({
    [QUOTE]: ({ body }) =>
      fail ? unreadableResponse() : jsonResponse(quoteOf(body as InvoiceRequest)),
  })
  await openPage()
  await typeCount('9')

  const retry = await within(receipt()).findByRole('button', { name: '다시 계산하기' })
  fail = false
  await userEvent.click(retry)

  await waitForQuote()
  expect(count(QUOTE)).toBe(2)
})

test('반·할인 목록을 받지 못하면 알리고 다시 받을 수 있다. 그동안 만들 수 없다', async () => {
  mockPage()
  let fail = true
  mockApi({
    [DISCOUNTS]: () => (fail ? unreadableResponse() : jsonResponse(discountTypes)),
  })
  renderApp(PATH, { me: staff })

  expect(
    await screen.findByText(
      '반·할인 목록을 불러오지 못했어요. 목록을 받아야 청구를 만들 수 있어요.',
      {},
      { timeout: 5000 },
    ),
  ).toBeInTheDocument()
  expect(createButton()).toBeDisabled()

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '반·할인 다시 불러오기' }))
  expect(await screen.findByRole('checkbox', { name: '형제 할인 5%' })).toBeInTheDocument()
})
