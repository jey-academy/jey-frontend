import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import type { Invoice, Payment, PaymentRequest } from '@/features/billing/api'
import type { Student, StudentCreateRequest } from '@/features/students/api'
import { todayInSeoul } from '@/shared/lib'
import { setupDialog } from '@/test/dialog'
import {
  jsonResponse,
  mockApi,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
} from '@/test/mockApi'
import { renderApp, staff } from '@/test/renderApp'
import { HOLDER_CHECK, mockLookups, pass, VERIFY } from './deskTestData'

// 데스크 한 화면에서 청구·결제까지(#228): ⑤ 수강료 청구와 ⑥ 결제 기록, 중간 실패와 이어서 하기.
setupMockApi()
setupDialog()

const REGISTER = 'POST /api/v1/students'
const REDEEM = 'POST /api/v1/dongtanpass/passes/42/redeem'
const ISSUE = 'POST /api/v1/dongtanpass/redemptions/300/invoice'
const INVOICE = 'GET /api/v1/billing/invoices/501'
const RECORD = 'POST /api/v1/billing/invoices/501/payments'
const STUDENT_ID = 7
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const THIS_MONTH = todayInSeoul().slice(0, 7)

function registeredStudent(body: StudentCreateRequest): Student {
  return {
    id: STUDENT_ID,
    campusId: body.campusId,
    classId: body.classId ?? null,
    name: body.name,
    grade: body.grade,
    school: body.school ?? null,
    phone: null,
    status: 'ENROLLED',
    registeredAt: body.registeredAt ?? '2026-10-18',
    version: 0,
    guardians: [],
    primaryContact: { name: '이영희', relation: 'MOTHER', phone: '010-****-5678' },
    siblings: [],
  }
}

const redeemed = {
  redemptionId: 300,
  passId: 42,
  studentId: STUDENT_ID,
  redeemedAt: '2026-10-18T05:32:10Z',
}

const invoice: Invoice = {
  id: 501,
  status: 'ISSUED',
  studentId: STUDENT_ID,
  studentName: '김하윤',
  campusId: 1,
  targetMonth: THIS_MONTH,
  discountPolicy: 'ADDITIVE',
  payment: null,
  totalAmount: 266_000,
  lines: [
    {
      classId: 10,
      className: '중1 정규',
      lessonCount: 8,
      listAmount: 280_000,
      chargeAmount: 266_000,
      discounts: [{ code: 'DONGTAN_PASS', name: '제이G패스', rate: 0.05, amount: 14_000 }],
    },
  ],
}

const payment = (body: PaymentRequest): Payment => ({
  paymentId: 77,
  invoiceId: 501,
  campusId: 1,
  studentId: STUDENT_ID,
  studentName: '김하윤',
  method: body.method,
  amount: body.amount,
  bookFee: body.bookFee ?? 0,
  status: 'COMPLETED',
  paidAt: '2026-10-18T05:40:00Z',
  canceledAt: null,
})

const issued = () => jsonResponse({ redemptionId: 300, invoiceId: 501, totalAmount: 266_000 }, 201)

/** 등록·사용 처리·청구·결제가 모두 되는 서버. 테스트마다 필요한 답만 바꾼다. */
function mockServer() {
  mockApi({
    [REGISTER]: ({ body }) => jsonResponse(registeredStudent(body as StudentCreateRequest), 201),
    [REDEEM]: () => jsonResponse(redeemed),
    [ISSUE]: issued,
    [INVOICE]: () => jsonResponse(invoice),
    [RECORD]: ({ body }) => jsonResponse(payment(body as PaymentRequest), 201),
  })
}

/** 패스를 확인하고, 등록 폼을 채우고, 본인 확인이 맞은 데까지. */
async function readyToRegister({ withClass = true } = {}) {
  const user = userEvent.setup()
  mockApi({
    [VERIFY]: () => jsonResponse(pass),
    [HOLDER_CHECK]: () => jsonResponse({ nameMatches: true, phoneMatches: true }),
  })
  mockLookups()
  renderApp('/desk/dongtanpass', { me: staff })
  await user.type(await screen.findByRole('textbox', { name: '패스 번호' }), 'DT-ABC234{Enter}')
  await screen.findByRole('form', { name: '신규 등록 정보' })
  await waitFor(() => expect(field('학생', '지점')).toHaveValue('1'))

  await user.type(field('학생', '이름'), '김하윤')
  await user.selectOptions(field('학생', '학년'), '중1')
  if (withClass) await user.selectOptions(field('학생', '반'), '중1 정규')
  await user.type(field('학부모 1', '이름'), '이영희')
  await user.type(field('학부모 1', '휴대전화'), '010-1234-5678')
  await user.click(within(card()).getByRole('button', { name: '본인 확인하기' }))
  await within(card()).findByRole('button', { name: '등록하고 패스 사용하기' })
  return user
}

function field(group: string, label: string) {
  return within(screen.getByRole('group', { name: group })).getByLabelText(label)
}

function feeForm() {
  return screen.getByRole('form', { name: '이번 달 수강료' })
}

function card() {
  return screen.getByRole('complementary', { name: '처리 순서' })
}

function stepTitled(title: string) {
  return within(card())
    .getAllByRole('listitem')
    .find((item) => item.textContent?.includes(`${title} (`))
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

async function fillFee(user: ReturnType<typeof userEvent.setup>, { payNow = true } = {}) {
  await user.type(within(feeForm()).getByLabelText('수업 횟수'), '8')
  await user.click(within(feeForm()).getByLabelText('형제 할인 5%'))
  if (!payNow) await user.click(within(feeForm()).getByLabelText('지금 결제 받음'))
}

test('수업 횟수를 적으면 등록, 사용 처리, 청구까지 한 번에 하고, 영수증을 보고 결제를 기록하면 완료 화면을 보여 준다', async () => {
  mockServer()
  const user = await readyToRegister()
  await fillFee(user)

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

  // 청구까지 차례로 한 번씩. 결제는 직원이 영수증을 보고 누를 때 나간다.
  await within(card()).findByText('받을 금액')
  expect(requests().filter((key) => [REGISTER, REDEEM, ISSUE, RECORD].includes(key))).toEqual([
    REGISTER,
    REDEEM,
    ISSUE,
  ])
  expect(requestOf(ISSUE).body).toEqual({
    targetMonth: THIS_MONTH,
    lines: [{ classId: 10, lessonCount: 8 }],
    // 패스 할인은 서버가 붙인다. 직원이 고른 할인만 보낸다.
    discountCodes: ['SIBLING_5'],
  })
  expect(requestOf(ISSUE).headers.get('Idempotency-Key')).toMatch(UUID)
  expect(within(card()).getByText('266,000원')).toBeInTheDocument()
  expect(stepTitled('수강료 청구')).toHaveTextContent('(끝남)')

  await user.click(within(card()).getByRole('radio', { name: '포스기 카드' }))
  await user.click(within(card()).getByRole('button', { name: '결제 기록하기' }))

  expect(await screen.findByRole('heading', { name: '결제까지 기록했어요' })).toHaveFocus()
  // 수강료는 서버가 만든 청구 합계 그대로다.
  expect(requestOf(RECORD).body).toEqual({ method: 'CARD_POS', amount: 266_000, bookFee: 0 })
  expect(requestOf(RECORD).headers.get('Idempotency-Key')).toMatch(UUID)
  expect(screen.getByText(/장부에는 자동으로 적혀요/)).toBeInTheDocument()
  expect(screen.getByText('포스기 카드 기록함')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '청구 보기' })).toHaveAttribute(
    'href',
    '/desk/billing/invoices/501',
  )
})

test('지금 결제 받음을 끄면 청구까지만 하고 완료 화면에서 청구 상세로 보낸다', async () => {
  mockServer()
  const user = await readyToRegister()
  await fillFee(user, { payNow: false })

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

  await screen.findByRole('heading', { name: '청구까지 만들었어요' })
  expect(count(ISSUE)).toBe(1)
  expect(count(RECORD)).toBe(0)
  expect(screen.getByText('아직 안 받음')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '청구 보고 결제 기록하기' })).toBeInTheDocument()
})

test('결제는 나중에 받기를 누르면 결제 없이 끝낸다', async () => {
  mockServer()
  const user = await readyToRegister()
  await fillFee(user)
  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))
  await within(card()).findByText('받을 금액')

  await user.click(within(card()).getByRole('button', { name: '결제는 나중에 받기' }))

  await screen.findByRole('heading', { name: '청구까지 만들었어요' })
  expect(count(RECORD)).toBe(0)
})

test('수업 횟수를 비우면 지금처럼 사용 처리까지만 한다', async () => {
  mockServer()
  const user = await readyToRegister()

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

  await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })
  expect(count(ISSUE)).toBe(0)
  expect(screen.getByRole('link', { name: '수강료 청구 만들기' })).toBeInTheDocument()
})

test('등록 폼에서 반을 정하지 않으면 수강료 칸을 쓸 수 없고 까닭을 알린다', async () => {
  mockServer()
  await readyToRegister({ withClass: false })

  expect(within(feeForm()).getByLabelText('수업 횟수')).toBeDisabled()
  expect(
    within(feeForm()).getByText('등록 폼에서 반을 고르면 수강료를 청구할 수 있어요.'),
  ).toBeInTheDocument()
})

test('수업 횟수를 적은 뒤 반을 비우면 등록하기 전에 멈추고, 적은 횟수는 지울 수 있다', async () => {
  mockServer()
  const user = await readyToRegister()
  await user.type(within(feeForm()).getByLabelText('수업 횟수'), '8')
  await user.selectOptions(field('학생', '반'), '정하지 않음')

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

  const lessons = within(feeForm()).getByLabelText('수업 횟수')
  expect(lessons).toHaveAccessibleDescription(/등록 폼에서 반을 고르면 수강료를 청구할 수 있어요/)
  expect(count(REGISTER)).toBe(0)
  expect(lessons).toBeEnabled()
})

test('수업 횟수가 틀리면 학생을 등록하기 전에 멈춘다', async () => {
  mockServer()
  const user = await readyToRegister()
  await user.type(within(feeForm()).getByLabelText('수업 횟수'), '0')

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

  expect(within(feeForm()).getByLabelText('수업 횟수')).toHaveAccessibleDescription(
    /1회부터 31회까지 적을 수 있어요/,
  )
  expect(count(REGISTER)).toBe(0)
})

test('사용 처리 뒤 청구가 실패하면 알리고, 이어서 하기는 청구만 다시 보낸다', async () => {
  mockServer()
  mockApi({
    [ISSUE]: () =>
      problemResponse(409, { detail: '운영하지 않는 반입니다.', code: 'BILLING_CLASS_INACTIVE' }),
  })
  const user = await readyToRegister()
  await fillFee(user)

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

  expect(await within(card()).findByText(/패스 사용 처리는 끝났어요/)).toBeInTheDocument()
  expect(within(feeForm()).getByText('운영하지 않는 반입니다.')).toBeInTheDocument()
  expect(stepTitled('패스 사용 처리')).toHaveTextContent('(끝남)')
  expect(stepTitled('수강료 청구')).toHaveTextContent('(확인 필요)')

  mockApi({ [ISSUE]: issued })
  await user.click(within(card()).getByRole('button', { name: '이어서 하기' }))

  await within(card()).findByText('받을 금액')
  // 끝난 단계는 다시 하지 않는다.
  expect(count(REGISTER)).toBe(1)
  expect(count(REDEEM)).toBe(1)
  expect(count(ISSUE)).toBe(2)
})

test('청구 응답을 놓치면 칸을 잠그고, 그대로 다시 보내기는 같은 키로 보낸다', async () => {
  mockServer()
  mockApi({
    [ISSUE]: () => {
      throw new TypeError('Failed to fetch')
    },
  })
  const user = await readyToRegister()
  await fillFee(user)
  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))
  await within(card()).findByRole('button', { name: '그대로 다시 보내기' })
  const firstKey = requestOf(ISSUE).headers.get('Idempotency-Key')
  expect(within(feeForm()).getByLabelText('수업 횟수')).toBeDisabled()

  mockApi({ [ISSUE]: issued })
  await user.click(within(card()).getByRole('button', { name: '그대로 다시 보내기' }))

  await within(card()).findByText('받을 금액')
  expect(requestOf(ISSUE).headers.get('Idempotency-Key')).toBe(firstKey)
})

test('이 사용 기록에 이미 청구가 있으면 청구 보기와 청구 없이 끝내기를 보여 준다', async () => {
  mockServer()
  mockApi({
    [ISSUE]: () =>
      problemResponse(409, {
        detail: '이미 청구한 사용 기록입니다.',
        code: 'DONGTANPASS_REDEMPTION_ALREADY_INVOICED',
        invoiceId: 501,
      }),
  })
  const user = await readyToRegister()
  await fillFee(user)
  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

  expect(await within(card()).findByRole('link', { name: '청구 보기' })).toHaveAttribute(
    'href',
    '/desk/billing/invoices/501',
  )
  await user.click(within(card()).getByRole('button', { name: '청구 없이 끝내기' }))

  await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })
})
