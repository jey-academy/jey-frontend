import { focusManager, onlineManager } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { UNSURE_RESEND_AS_IS } from '@/shared/api'
import { setupDialog } from '@/test/dialog'
import {
  expectNoRequests,
  jsonResponse,
  mockApi,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
  tooManyRequests,
  unreadableResponse,
} from '@/test/mockApi'
import { admin, partner, renderApp, staff } from '@/test/renderApp'
import type { BillingStudent, DiscountType, Invoice, InvoiceRequest } from '../api'

setupMockApi()
setupDialog()

const PATH = '/desk/billing/new?redemptionId=300&studentId=16'
const STUDENT = 'GET /api/v1/students/16'
const CLASSES = 'GET /api/v1/classes'
const DISCOUNTS = 'GET /api/v1/discount-types'
const QUOTE = 'POST /api/v1/billing/quote'
const ISSUE = 'POST /api/v1/dongtanpass/redemptions/300/invoice'
const CSRF = 'GET /api/v1/auth/csrf'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
// 칸을 고친 뒤 계산을 묻기까지 기다리는 시간(0.4초)을 넉넉히 넘긴다. "묻지 않는다"를 볼 때 쓴다.
const PAST_SETTLE_MS = 1200

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

/** 9회 · 패스 할인만이면 미리 계산이 299,250원이다. 만들기 응답도 같은 금액으로 둔다. */
const issued = (totalAmount = 299_250) =>
  jsonResponse({ redemptionId: 300, invoiceId: 501, totalAmount }, 201)

function mockPage(overrides: Partial<BillingStudent> = {}) {
  mockApi({
    [STUDENT]: () => jsonResponse({ ...student, ...overrides }),
    [CLASSES]: () => jsonResponse(classes),
    [DISCOUNTS]: () => jsonResponse(discountTypes),
    [QUOTE]: ({ body }) => jsonResponse(quoteOf(body as InvoiceRequest)),
    [ISSUE]: () => issued(),
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
const receiptValues = () =>
  within(receipt())
    .queryAllByRole('definition')
    .map((value) => value.textContent)
const totalText = () => within(receipt()).queryByText('받을 금액')?.nextSibling?.textContent

async function typeCount(text: string, name?: string) {
  await userEvent.clear(lessonCount(name))
  await userEvent.type(lessonCount(name), text)
}

/** 금액을 받아 "청구 만들기"를 누를 수 있을 때까지. 느린 CI를 생각해 넉넉히 기다린다. */
async function waitForQuote() {
  await waitFor(() => expect(createButton()).toBeEnabled(), { timeout: 3000 })
}

/** 9회 · 패스 할인만으로 금액을 받는다(299,250원). */
async function readyToCreate() {
  await typeCount('9')
  await waitForQuote()
}

/** 응답을 요청이 오기 전에 만들어 둔다. 요청이 먼저 와도 기다린다. */
function holdResponse() {
  let respond!: (response: Response) => void
  const pending = new Promise<Response>((resolve) => (respond = resolve))
  return { pending, respond }
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

test('다른 지점의 학생이면 다시 불러오기 없이 알린다', async () => {
  mockApi({
    [STUDENT]: () =>
      problemResponse(403, { code: 'AUTH_CAMPUS_NOT_ALLOWED', detail: '다른 지점입니다.' }),
  })
  renderApp(PATH, { me: staff })

  expect(
    await screen.findByRole('heading', { level: 1, name: '다른 지점의 학생이에요' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '다시 불러오기' })).not.toBeInTheDocument()
})

test('학생을 불러오지 못하면 무엇을 못 불러왔는지 알리고 다시 불러올 수 있다', async () => {
  let fail = true
  mockPage()
  mockApi({
    [STUDENT]: () =>
      fail ? problemResponse(400, { detail: '요청이 올바르지 않습니다.' }) : jsonResponse(student),
  })
  renderApp(PATH, { me: staff })

  expect(
    await screen.findByText('학생 정보를 불러오지 못했어요. 요청이 올바르지 않습니다.'),
  ).toBeInTheDocument()
  fail = false
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
  expect(await screen.findByRole('combobox', { name: '반' })).toBeInTheDocument()
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
      .map((box) => box.closest('label')?.textContent),
  ).toEqual(['형제 할인 5%', '다과목 할인 3%', '직원 자녀 할인 10%', '조기 등록 할인 2%'])

  // 대상 월은 이번 달이 먼저 골라져 있다.
  const months = screen.getByRole('radiogroup', { name: '대상 월' })
  expect(within(months).getByRole('radio', { name: '2026년 10월' })).toBeChecked()
  expect(within(months).getByRole('radio', { name: '2026년 11월' })).not.toBeChecked()

  // 횟수를 적기 전에는 계산하지 않고, 만들 수 없는 까닭을 영수증 자리에 한 번 알린다.
  expect(createButton()).toBeDisabled()
  expect(receipt()).toHaveTextContent('반과 수업 횟수를 적으면 금액을 계산해요.')
  expect(screen.getAllByText('반과 수업 횟수를 적으면 금액을 계산해요.')).toHaveLength(1)
  expect(count(QUOTE)).toBe(0)
})

test('반이 없는 학생은 반을 미리 고르지 않는다', async () => {
  mockPage({ classId: null })
  renderApp(PATH, { me: staff })

  await screen.findByRole('option', { name: '중1 정규' })
  expect(screen.getByRole('combobox', { name: '반' })).toHaveValue('')
})

test('학생의 반이 다른 지점의 반이면 미리 고르지 않고, 횟수를 적어도 계산하지 않는다', async () => {
  mockPage({ classId: 20 })
  renderApp(PATH, { me: staff })

  await screen.findByRole('option', { name: '중1 정규' })
  expect(screen.getByRole('combobox', { name: '반' })).toHaveValue('')
  // 골랐다가 비운 것이 아니다. "운영하지 않아 비웠어요"라고 하지 않는다.
  expect(screen.queryByText(/운영하지 않아 비웠어요/)).not.toBeInTheDocument()
  await typeCount('9')
  await new Promise((resolve) => setTimeout(resolve, PAST_SETTLE_MS))
  expect(count(QUOTE)).toBe(0)
})

test('금액을 받은 뒤에는 창에 돌아오거나, 연결이 돌아오거나, 시간이 지나도 저절로 다시 계산하지 않는다', async () => {
  mockPage()
  await openPage()
  await readyToCreate()
  await typeCount('8')
  await waitForQuote()
  expect(count(QUOTE)).toBe(2)
  // 창에 돌아오면 다른 조회(로그인 정보)는 다시 받는다.
  mockApi({ 'GET /api/v1/auth/me': () => jsonResponse(staff) })

  act(() => {
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    onlineManager.setOnline(false)
    onlineManager.setOnline(true)
  })
  // 한 시간이 지난 뒤 9회로 되돌려도 기억한 금액을 쓴다.
  vi.setSystemTime(new Date('2026-10-21T11:00:00+09:00'))
  await typeCount('9')
  await waitForQuote()

  expect(totalText()).toBe('299,250원')
  expect(count(QUOTE)).toBe(2)
  focusManager.setFocused(undefined)
})

test('화면을 떠났다 다시 들어오면 새로 계산한다', async () => {
  mockPage()
  mockApi({ 'GET /api/v1/campuses': () => jsonResponse([]) })
  const { router } = await openPage()
  await readyToCreate()
  expect(count(QUOTE)).toBe(1)

  await userEvent.click(screen.getByRole('link', { name: '김하윤 학생 상세' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/desk/students/16'))
  await act(() => router.navigate(PATH))
  await waitFor(() => expect(screen.getByRole('combobox', { name: '반' })).toHaveValue('10'))
  await readyToCreate()

  expect(count(QUOTE)).toBe(2)
})

test('횟수를 적으면 잠시 뒤 패스 할인을 맨 앞에 넣어 미리 계산하고, 서버가 준 금액을 보여 준다', async () => {
  mockPage()
  await openPage()
  // 합계 칸의 틀(aria-live)은 금액이 오기 전부터 있다. 그래야 금액이 나타날 때 화면 읽기 프로그램이 읽는다.
  const live = receipt().querySelector('[aria-live="polite"]')
  expect(live).toBeEmptyDOMElement()

  await userEvent.click(screen.getByRole('checkbox', { name: '형제 할인 5%' }))
  await typeCount('9')
  await waitForQuote()

  expect(live).toHaveTextContent('받을 금액283,500원')
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
  expect(receiptValues()).toEqual(['315,000원', '−15,750원', '−15,750원'])
  expect(totalText()).toBe('283,500원')
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

test('횟수를 고친 뒤 새 금액을 받기 전에는 옛 금액으로 청구를 만들 수 없다', async () => {
  mockPage()
  await openPage()
  await readyToCreate()

  await typeCount('8')

  // 바로 막는다(멈춘 뒤 계산할 때까지 기다리지 않는다). 9회의 금액도 거둔다.
  expect(createButton()).toBeDisabled()
  expect(receipt()).not.toHaveTextContent('315,000원')
  expect(within(receipt()).getByRole('status')).toHaveTextContent('금액을 계산하고 있어요.')

  await waitForQuote()
  expect(receipt()).toHaveTextContent('280,000원')
})

// 칸을 비우지 않고 바로 바뀌는 경우. 멈춘 값(옛 본문)이 남아 있어, 본문을 비교해야만 막힌다.
test.each([
  [
    '할인을 고르면',
    () => userEvent.click(screen.getByRole('checkbox', { name: '형제 할인 5%' })),
    { discountCodes: ['DONGTAN_PASS', 'SIBLING_5'] },
  ],
  [
    '대상 월을 바꾸면',
    () => userEvent.click(screen.getByRole('radio', { name: '2026년 11월' })),
    { targetMonth: '2026-11' },
  ],
  ['횟수를 이어 적으면', () => userEvent.type(lessonCount(), '1'), { lines: [{ lessonCount: 1 }] }],
])('%s 바로 옛 금액을 거두고 막은 뒤, 새 내용으로 계산한다', async (_name, change, expected) => {
  mockPage()
  await openPage()
  await userEvent.type(lessonCount(), '1')
  await waitForQuote()
  expect(totalText()).toBe('19,250원')

  await change()

  expect(createButton()).toBeDisabled()
  expect(totalText()).toBeUndefined()
  expect(within(receipt()).getByRole('status')).toHaveTextContent('금액을 계산하고 있어요.')

  await waitForQuote()
  expect(count(QUOTE)).toBe(2)
  expect(requestOf(QUOTE).body).toMatchObject(
    'lines' in expected ? { lines: [{ classId: 10, lessonCount: 11 }] } : expected,
  )
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
  // 멈출 시간을 넉넉히 넘겨도 묻지 않는다.
  await new Promise((resolve) => setTimeout(resolve, PAST_SETTLE_MS))
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

test('반 나눔이면 반마다의 금액과 서버가 준 합계를 그대로 보여 준다(프론트가 더하지 않는다)', async () => {
  mockPage()
  mockApi({
    // 서버의 합계를 줄 합계와 일부러 다르게 둔다.
    [QUOTE]: ({ body }) =>
      jsonResponse({ ...quoteOf(body as InvoiceRequest), totalAmount: 400_000 }),
  })
  await openPage()
  await typeCount('5')
  await userEvent.click(screen.getByRole('button', { name: '반 더하기 (반 나눔)' }))
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '2번째 반' }), '중1 문법')
  await typeCount('4', '2번째 반 수업 횟수')
  await waitForQuote()

  expect(
    within(receipt())
      .getAllByRole('term')
      .map((row) => row.textContent),
  ).toEqual([
    '중1 정규 · 5회',
    '동탄고 패스 5%',
    '이 반 청구액',
    '중1 문법 · 4회',
    '동탄고 패스 5%',
    '이 반 청구액',
  ])
  expect(receiptValues()).toEqual([
    '175,000원',
    '−15,750원',
    '159,250원',
    '140,000원',
    '−15,750원',
    '124,250원',
  ])
  expect(totalText()).toBe('400,000원')
})

test.each([
  ['SEQUENTIAL', '할인이 여럿이면 앞 할인을 뺀 금액에서 다음 할인을 차례로 빼요.'],
  ['SINGLE', '할인은 하나만 붙어요.'],
  ['NEW_WAY', '할인 계산 방식: NEW_WAY'],
])('계산 방식 %s를 알린다', async (policy, text) => {
  mockPage()
  mockApi({
    [QUOTE]: ({ body }) =>
      jsonResponse({ ...quoteOf(body as InvoiceRequest), discountPolicy: policy }),
  })
  await openPage()
  await readyToCreate()

  expect(receipt()).toHaveTextContent(text)
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

test('청구를 만들면 패스 할인 없이 고른 것만 멱등 키와 함께 보내고, 청구 번호와 받을 금액을 보여 준다', async () => {
  mockPage()
  await openPage()
  await userEvent.click(screen.getByRole('radio', { name: '2026년 11월' }))
  await readyToCreate()

  await userEvent.click(createButton())

  const title = await screen.findByRole('heading', { name: '수강료 청구를 만들었어요' })
  expect(count(ISSUE)).toBe(1)
  // 패스 할인은 서버가 붙인다. 보내면 400이다.
  expect(requestOf(ISSUE).body).toEqual({
    targetMonth: '2026-11',
    lines: [{ classId: 10, lessonCount: 9 }],
    discountCodes: [],
  })
  expect(requestOf(ISSUE).headers.get('Idempotency-Key')).toMatch(UUID)

  expect(title).toHaveFocus()
  const done = title.closest('section')!
  expect(
    within(done)
      .getAllByRole('definition')
      .map((value) => value.textContent),
  ).toEqual(['501', '김하윤', '2026년 11월', '299,250원'])
  // 미리 본 금액과 같으면 따로 알리지 않는다.
  expect(done).not.toHaveTextContent('미리 본 금액')
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

test('만든 금액이 미리 본 금액과 다르면(그사이 값이 바뀜) 알린다', async () => {
  mockPage()
  mockApi({ [ISSUE]: () => issued(310_000) })
  await openPage()
  await readyToCreate()

  await userEvent.click(createButton())

  const title = await screen.findByRole('heading', { name: '수강료 청구를 만들었어요' })
  const done = title.closest('section')!
  expect(done).toHaveTextContent('310,000원')
  expect(done).toHaveTextContent(
    '미리 본 금액(299,250원)과 달라요. 그사이 수강료나 할인율이 바뀌었을 수 있어요.',
  )
})

test('만든 청구의 금액을 표시할 수 없어도 청구 번호는 보여 준다', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockPage()
  mockApi({ [ISSUE]: () => issued(0.5) })
  await openPage()
  await readyToCreate()

  await userEvent.click(createButton())

  const title = await screen.findByRole('heading', { name: '수강료 청구를 만들었어요' })
  const done = title.closest('section')!
  expect(
    within(done)
      .getAllByRole('definition')
      .map((value) => value.textContent),
  ).toEqual(['501', '김하윤', '2026년 10월', '관리자에게 확인해 주세요'])
})

test('관리자도 청구를 만들 수 있다', async () => {
  mockPage()
  await openPage(admin)
  await readyToCreate()

  await userEvent.click(createButton())

  expect(
    await screen.findByRole('heading', { name: '수강료 청구를 만들었어요' }),
  ).toBeInTheDocument()
})

test('만드는 동안에는 다시 누를 수 없고, 다른 화면으로 가려 하면 막는다', async () => {
  mockPage()
  const hold = holdResponse()
  mockApi({ [ISSUE]: () => hold.pending })
  const { router } = await openPage()
  await readyToCreate()

  await userEvent.click(createButton())

  const sending = screen.getByRole('button', { name: '청구를 만드는 중' })
  expect(sending).toBeDisabled()
  await userEvent.click(sending)
  await userEvent.type(lessonCount(), '{Enter}')
  expect(count(ISSUE)).toBe(1)

  await userEvent.click(screen.getByRole('link', { name: '김하윤 학생 상세' }))
  expect(await screen.findByRole('dialog', { name: '청구를 만드는 중이에요' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/desk/billing/new')

  hold.respond(issued())
  expect(
    await screen.findByRole('heading', { name: '수강료 청구를 만들었어요' }),
  ).toBeInTheDocument()
  expect(count(ISSUE)).toBe(1)
})

test('응답을 받지 못하면 칸을 잠그고 그대로 다시 보내게 한다. 같은 키로 보내고, 떠나지 못하게 막는다', async () => {
  mockPage()
  mockApi({ [ISSUE]: () => unreadableResponse() })
  const { router } = await openPage()
  await readyToCreate()

  await userEvent.click(createButton())

  expect(await screen.findByText(new RegExp(UNSURE_RESEND_AS_IS))).toBeInTheDocument()
  const firstKey = requestOf(ISSUE).headers.get('Idempotency-Key')
  // 고치면 새 키로 나가 처음 결과를 받지 못한다. 칸을 잠근다.
  expect(lessonCount()).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: '형제 할인 5%' })).toBeDisabled()

  await userEvent.click(screen.getByRole('link', { name: '김하윤 학생 상세' }))
  const dialog = await screen.findByRole('dialog', { name: '청구 결과를 아직 몰라요' })
  expect(router.state.location.pathname).toBe('/desk/billing/new')
  await userEvent.click(within(dialog).getByRole('button', { name: '확인' }))

  mockApi({ [ISSUE]: () => issued() })
  await userEvent.click(screen.getByRole('button', { name: '그대로 다시 보내기' }))

  expect(
    await screen.findByRole('heading', { name: '수강료 청구를 만들었어요' }),
  ).toBeInTheDocument()
  expect(count(ISSUE)).toBe(2)
  expect(requestOf(ISSUE).headers.get('Idempotency-Key')).toBe(firstKey)
  expect(requestOf(ISSUE).body).toEqual({
    targetMonth: '2026-10',
    lines: [{ classId: 10, lessonCount: 9 }],
    discountCodes: [],
  })
})

test('거부된 뒤에는 떠날 수 있다', async () => {
  mockPage()
  mockApi({
    [ISSUE]: () =>
      problemResponse(409, { code: 'BILLING_CLASS_INACTIVE', detail: '운영하지 않는 반입니다.' }),
  })
  const { router } = await openPage()
  await readyToCreate()
  await userEvent.click(createButton())
  await screen.findByText('운영하지 않는 반입니다.')

  // 학생 상세 화면이 받는 지점 목록
  mockApi({ 'GET /api/v1/campuses': () => jsonResponse([]) })
  await userEvent.click(screen.getByRole('link', { name: '김하윤 학생 상세' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/desk/students/16'))
})

test('앞서 보낸 요청을 아직 처리 중이라는 답도 결과를 모르는 것으로 보고 칸을 잠근다', async () => {
  mockPage()
  mockApi({
    [ISSUE]: () =>
      problemResponse(409, {
        code: 'COMMON_IDEMPOTENCY_IN_PROGRESS',
        detail: '같은 요청을 처리하고 있습니다.',
      }),
  })
  await openPage()
  await readyToCreate()

  await userEvent.click(createButton())

  expect(await screen.findByRole('button', { name: '그대로 다시 보내기' })).toBeEnabled()
  expect(lessonCount()).toBeDisabled()
})

test('보내는 동안과 결과를 모를 때만 새로 고침·탭 닫기를 막는다', async () => {
  mockPage()
  let fail = true
  mockApi({ [ISSUE]: () => (fail ? unreadableResponse() : issued()) })
  await openPage()
  await readyToCreate()
  const leave = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }
  expect(leave()).toBe(false)

  await userEvent.click(createButton())
  await screen.findByRole('button', { name: '그대로 다시 보내기' })
  expect(leave()).toBe(true)

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '그대로 다시 보내기' }))
  await screen.findByRole('heading', { name: '수강료 청구를 만들었어요' })
  expect(leave()).toBe(false)
})

test('이미 청구가 있는 사용 기록이면 폼을 거두고 다시 만들 수 없다고 알린다', async () => {
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
  await readyToCreate()

  await userEvent.click(createButton())

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 사용 기록의 청구가 이미 있어요' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '청구 만들기' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: '패스 사용 내역으로' })).toHaveAttribute(
    'href',
    '/desk/dongtanpass/redemptions',
  )
})

test('없는 사용 기록이면 폼을 거두고 사용 내역으로 안내한다', async () => {
  mockPage()
  mockApi({
    [ISSUE]: () =>
      problemResponse(404, {
        code: 'DONGTANPASS_REDEMPTION_NOT_FOUND',
        detail: '패스 사용 기록을 찾을 수 없습니다.',
      }),
  })
  await openPage()
  await readyToCreate()

  await userEvent.click(createButton())

  expect(
    await screen.findByRole('heading', { level: 1, name: '패스 사용 기록을 찾을 수 없어요' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '청구 만들기' })).not.toBeInTheDocument()
})

test('그 달 청구가 이미 있으면 대상 월에 알리고, 달을 바꾸면 그 안내를 지운다', async () => {
  mockPage()
  mockApi({
    [ISSUE]: () =>
      problemResponse(409, {
        code: 'BILLING_INVOICE_ALREADY_EXISTS',
        detail: '이 학생의 그 달 청구가 이미 있습니다. 새로 만들려면 그 청구를 먼저 취소해 주세요.',
      }),
  })
  await openPage()
  await readyToCreate()

  await userEvent.click(createButton())

  const months = screen.getByRole('radiogroup', { name: '대상 월' })
  await waitFor(() =>
    expect(months).toHaveAccessibleDescription(
      '이 학생의 그 달 청구가 이미 있습니다. 새로 만들려면 그 청구를 먼저 취소해 주세요.',
    ),
  )

  await userEvent.click(screen.getByRole('radio', { name: '2026년 11월' }))
  expect(months).not.toHaveAccessibleDescription(/청구가 이미 있습니다/)
})

test('반이 그사이 꺼졌다는 답이면 알리고 반 목록을 다시 받아, 없어진 반을 비운다', async () => {
  mockPage()
  let closed = false
  mockApi({
    [CLASSES]: () => jsonResponse(closed ? classes.filter((item) => item.id !== 10) : classes),
    [ISSUE]: () =>
      problemResponse(409, { code: 'BILLING_CLASS_INACTIVE', detail: '운영하지 않는 반입니다.' }),
  })
  await openPage()
  await readyToCreate()
  const before = count(CLASSES)
  closed = true

  await userEvent.click(createButton())

  const group = screen.getByRole('group', { name: '반과 수업 횟수' })
  expect(await within(group).findByText('운영하지 않는 반입니다.')).toBeInTheDocument()
  await waitFor(() => expect(count(CLASSES)).toBe(before + 1))
  // 화면에 "반 고르기"로 보이는데 옛 반이 나가지 않게 비우고 알린다.
  await waitFor(() => expect(screen.getByRole('combobox', { name: '반' })).toHaveValue(''))
  expect(
    screen.getByText('고른 반을 지금 운영하지 않아 비웠어요. 반을 다시 골라 주세요.'),
  ).toBeInTheDocument()
  expect(createButton()).toBeDisabled()
})

test('할인이 그사이 꺼졌다는 답이면 할인 목록을 다시 받아, 고른 것에서 빼고 알린다', async () => {
  mockPage()
  let off = false
  mockApi({
    [DISCOUNTS]: () =>
      jsonResponse(
        discountTypes.map((type) =>
          off && type.code === 'SIBLING_5' ? { ...type, active: false } : type,
        ),
      ),
    [ISSUE]: () =>
      problemResponse(409, {
        code: 'BILLING_DISCOUNT_TYPE_INACTIVE',
        detail: '쓰지 않는 할인 유형입니다.',
      }),
  })
  await openPage()
  await userEvent.click(screen.getByRole('checkbox', { name: '형제 할인 5%' }))
  await readyToCreate()
  const before = count(DISCOUNTS)
  off = true

  await userEvent.click(createButton())

  await waitFor(() => expect(count(DISCOUNTS)).toBe(before + 1))
  expect(await screen.findByText('지금 쓸 수 없는 할인을 뺐어요: 형제 할인')).toBeInTheDocument()
  expect(screen.queryByRole('checkbox', { name: '형제 할인 5%' })).not.toBeInTheDocument()
  // 뺀 것으로 다시 계산한다.
  await waitForQuote()
  expect(requestOf(QUOTE).body).toMatchObject({ discountCodes: ['DONGTAN_PASS'] })
})

test('계산이 할인을 거부해도 할인 목록을 다시 받는다', async () => {
  mockPage()
  mockApi({
    [QUOTE]: () =>
      problemResponse(409, {
        code: 'BILLING_DISCOUNT_TYPE_INACTIVE',
        detail: '쓰지 않는 할인 유형입니다.',
      }),
  })
  await openPage()
  const before = count(DISCOUNTS)

  await typeCount('9')

  await within(receipt()).findByText(/금액을 계산하지 못했어요/, {}, { timeout: 3000 })
  await waitFor(() => expect(count(DISCOUNTS)).toBe(before + 1))
})

test('계산이나 만들기가 학생을 거부하면 학생을 다시 받아 안내를 맞춘다', async () => {
  mockPage()
  let withdrawn = false
  mockApi({
    [STUDENT]: () => jsonResponse({ ...student, status: withdrawn ? 'WITHDRAWN' : 'ENROLLED' }),
    [ISSUE]: () =>
      problemResponse(409, {
        code: 'BILLING_STUDENT_NOT_ENROLLED',
        detail: '재원 중인 학생이 아닙니다.',
      }),
  })
  await openPage()
  await readyToCreate()
  const before = count(STUDENT)
  withdrawn = true

  await userEvent.click(createButton())

  await waitFor(() => expect(count(STUDENT)).toBe(before + 1))
  expect(
    await screen.findByText('퇴원한 학생이에요. 재원 중인 학생만 청구할 수 있어요.'),
  ).toBeInTheDocument()
  expect(createButton()).toBeDisabled()
})

test('패스 할인이 꺼졌다는 답은 이 화면에 맞는 말로 알린다', async () => {
  mockPage()
  mockApi({
    [ISSUE]: () =>
      problemResponse(409, {
        code: 'DONGTANPASS_DISCOUNT_INACTIVE',
        detail: '패스 할인이 꺼져 있어 사용 처리할 수 없습니다.',
      }),
  })
  await openPage()
  await readyToCreate()

  await userEvent.click(createButton())

  expect(
    await screen.findByText('패스 할인이 꺼져 있어 청구를 만들 수 없어요. 관리자에게 알려 주세요.'),
  ).toBeInTheDocument()
  expect(screen.queryByText(/사용 처리할 수 없습니다/)).not.toBeInTheDocument()
})

test('퇴원한 학생이면 알리고 계산하지도 만들지도 않는다', async () => {
  mockPage({ status: 'WITHDRAWN' })
  await openPage()

  await typeCount('9')

  expect(
    screen.getByText('퇴원한 학생이에요. 재원 중인 학생만 청구할 수 있어요.'),
  ).toBeInTheDocument()
  expect(createButton()).toBeDisabled()
  expect(receipt()).toHaveTextContent('퇴원한 학생이라 청구를 만들 수 없어요.')
  await new Promise((resolve) => setTimeout(resolve, PAST_SETTLE_MS))
  expect(count(QUOTE)).toBe(0)
})

test('계산을 거부하면 영수증에 까닭과 할 일을 알리고, 다시 계산하기는 두지 않는다', async () => {
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
      {},
      { timeout: 3000 },
    ),
  ).toBeInTheDocument()
  expect(receipt()).toHaveTextContent('반·횟수나 할인을 고치면 다시 계산해요.')
  // 실패했는데 "적으면 보여요" 같은 안내를 같이 두지 않는다.
  expect(receipt()).not.toHaveTextContent('금액을 계산해야 만들 수 있어요.')
  expect(within(receipt()).queryByRole('button', { name: '다시 계산하기' })).not.toBeInTheDocument()
  expect(createButton()).toBeDisabled()
})

test.each([
  ['응답을 받지 못함', () => unreadableResponse()],
  ['서버 오류', () => problemResponse(500, { detail: '서버 오류입니다.' })],
  ['요청이 너무 많음', () => tooManyRequests({ detail: '요청이 너무 많습니다.' }, '60')],
])('계산이 실패하면(%s) 다시 계산할 수 있다', async (_name, failure) => {
  mockPage()
  let fail = true
  mockApi({
    [QUOTE]: ({ body }) => (fail ? failure() : jsonResponse(quoteOf(body as InvoiceRequest))),
  })
  await openPage()
  await typeCount('9')

  const retry = await within(receipt()).findByRole(
    'button',
    { name: '다시 계산하기' },
    { timeout: 3000 },
  )
  // 실패하면 금액을 보이지 않고 만들 수 없다.
  expect(totalText()).toBeUndefined()
  expect(createButton()).toBeDisabled()
  fail = false
  await userEvent.click(retry)

  await waitForQuote()
  expect(count(QUOTE)).toBe(2)
})

test('계산 요청을 보내지 못하면(보안 토큰을 받지 못함) 다시 계산할 수 있다', async () => {
  mockPage()
  let fail = true
  mockApi({
    [CSRF]: () => (fail ? unreadableResponse() : jsonResponse({})),
  })
  await openPage()
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  await typeCount('9')

  const retry = await within(receipt()).findByRole(
    'button',
    { name: '다시 계산하기' },
    { timeout: 3000 },
  )
  expect(count(QUOTE)).toBe(0)
  fail = false
  document.cookie = 'XSRF-TOKEN=test-csrf-token'
  await userEvent.click(retry)

  await waitForQuote()
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
  expect(receipt()).toHaveTextContent('반과 할인 목록을 받아야 만들 수 있어요.')

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '반·할인 다시 불러오기' }))
  expect(await screen.findByRole('checkbox', { name: '형제 할인 5%' })).toBeInTheDocument()
})
