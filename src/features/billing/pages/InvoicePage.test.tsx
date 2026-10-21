import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
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
  unreadableResponse,
} from '@/test/mockApi'
import { admin, partner, renderApp, staff } from '@/test/renderApp'
import type { BillingStudent, Invoice, Payment, PaymentRequest } from '../api'

setupMockApi()
setupDialog()

const PATH = '/desk/billing/invoices/501'
const INVOICE = 'GET /api/v1/billing/invoices/501'
const STUDENT = 'GET /api/v1/students/16'
const RECORD = 'POST /api/v1/billing/invoices/501/payments'
const CANCEL_INVOICE = 'POST /api/v1/billing/invoices/501/cancel'
const CANCEL_PAYMENT = 'POST /api/v1/billing/payments/77/cancel'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const student = { id: 16, campusId: 1, name: '김하윤', status: 'ENROLLED' } as BillingStudent

/** 280,000원 반 · 9회 · 패스 5% → 315,000 − 15,750 = 299,250원 */
const issued: Invoice = {
  id: 501,
  status: 'ISSUED',
  studentId: 16,
  campusId: 1,
  targetMonth: '2026-11',
  discountPolicy: 'ADDITIVE',
  payment: null,
  totalAmount: 299_250,
  lines: [
    {
      classId: 10,
      className: '중1 정규',
      lessonCount: 9,
      listAmount: 315_000,
      chargeAmount: 299_250,
      discounts: [{ code: 'DONGTAN_PASS', name: '동탄고 패스', rate: 0.05, amount: 15_750 }],
    },
  ],
}

const payment = (body: PaymentRequest): Payment => ({
  paymentId: 77,
  invoiceId: 501,
  campusId: 1,
  studentId: 16,
  method: body.method,
  amount: body.amount,
  bookFee: body.bookFee ?? 0,
  status: 'COMPLETED',
  // 한국 시각 2026-10-21 15:40
  paidAt: '2026-10-21T06:40:00Z',
  canceledAt: null,
})

const paid: Invoice = {
  ...issued,
  status: 'PAID',
  payment: payment({ method: 'CARD_POS', amount: 299_250, bookFee: 20_000 }),
}

/** 서버 흉내. 결제·취소가 청구의 상태를 바꾼다. */
function mockServer(start: Invoice = issued) {
  const server = { invoice: start }
  mockApi({
    [INVOICE]: () => jsonResponse(server.invoice),
    [STUDENT]: () => jsonResponse(student),
    [RECORD]: ({ body }) => {
      const made = payment(body as PaymentRequest)
      server.invoice = { ...server.invoice, status: 'PAID', payment: made }
      return jsonResponse(made, 201)
    },
    [CANCEL_PAYMENT]: () => {
      const canceled = { ...server.invoice.payment!, status: 'CANCELED' }
      server.invoice = { ...server.invoice, status: 'ISSUED', payment: null }
      return jsonResponse(canceled)
    },
    [CANCEL_INVOICE]: () => {
      server.invoice = { ...server.invoice, status: 'CANCELED' }
      return jsonResponse(server.invoice)
    },
  })
  return server
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

async function openPage(me = staff) {
  const rendered = renderApp(PATH, { me })
  // 제목은 불러오는 동안에도 보인다. 청구를 받아 내역이 보일 때까지 기다린다(요청 수를 세는 테스트가 있다).
  await screen.findByRole('region', { name: '청구 내역' })
  return rendered
}

function holdResponse() {
  let respond!: (response: Response) => void
  const pending = new Promise<Response>((resolve) => (respond = resolve))
  return { pending, respond }
}

const recordButton = () => screen.getByRole('button', { name: '결제 기록하기' })

/** 수단과 교재비를 적고 확인 창을 연다. */
async function fillPayment(method = '현금', bookFee = '20,000') {
  await screen.findByRole('radiogroup', { name: '결제 수단' })
  await userEvent.click(screen.getByRole('radio', { name: method }))
  await userEvent.clear(screen.getByRole('textbox', { name: '교재비(원)' }))
  await userEvent.type(screen.getByRole('textbox', { name: '교재비(원)' }), bookFee)
  await userEvent.click(recordButton())
}

async function confirmPayment() {
  const dialog = await screen.findByRole('dialog', { name: '이대로 결제를 기록할까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '기록하기' }))
}

test('연계 학원은 이 화면을 볼 수 없고 아무것도 요청하지 않는다', async () => {
  renderApp(PATH, { me: partner })

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expectNoRequests()
})

test('번호가 아닌 주소는 없는 청구로 알리고 아무것도 요청하지 않는다', async () => {
  renderApp('/desk/billing/invoices/abc', { me: staff })

  expect(
    await screen.findByRole('heading', { level: 1, name: '없는 청구예요' }),
  ).toBeInTheDocument()
  expectNoRequests()
})

test.each([
  [404, 'BILLING_INVOICE_NOT_FOUND', '없는 청구예요'],
  [403, 'AUTH_CAMPUS_NOT_ALLOWED', '다른 지점의 청구예요'],
])('청구가 %s(%s)면 그렇게 알리고 다시 불러오기는 두지 않는다', async (status, code, title) => {
  mockApi({ [INVOICE]: () => problemResponse(status, { code, detail: '거부' }) })
  renderApp(PATH, { me: staff })

  expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '다시 불러오기' })).not.toBeInTheDocument()
})

test('결제 전 청구는 학생·대상 월·번호·상태와 줄마다의 금액을 서버 값 그대로 보여 준다', async () => {
  mockServer()
  await openPage()

  expect(await screen.findByText('김하윤', { selector: 'span' })).toBeInTheDocument()
  expect(screen.getByText('· 2026년 11월 · 청구 번호 501')).toBeInTheDocument()
  expect(screen.getByText('결제 전')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '김하윤 학생 상세' })).toHaveAttribute(
    'href',
    '/desk/students/16',
  )

  const receipt = screen.getByRole('region', { name: '청구 내역' })
  expect(
    within(receipt)
      .getAllByRole('term')
      .map((term) => term.textContent),
  ).toEqual(['중1 정규 · 9회', '동탄고 패스 5%'])
  expect(
    within(receipt)
      .getAllByRole('definition')
      .map((value) => value.textContent),
  ).toEqual(['315,000원', '−15,750원'])
  expect(receipt).toHaveTextContent('청구 금액299,250원')
  expect(receipt).toHaveTextContent('할인이 여럿이면 할인율을 더해 한 번에 빼요.')
  // 수강료는 청구 합계 그대로다.
  expect(screen.getByText('수강료', { selector: 'p' }).nextSibling).toHaveTextContent('299,250원')
})

test('학생을 받지 못하면 학생 번호로 보여 준다', async () => {
  mockServer()
  mockApi({ [STUDENT]: () => problemResponse(400, { detail: '요청이 올바르지 않습니다.' }) })
  await openPage()

  expect(await screen.findByText('학생 16', { selector: 'span' })).toBeInTheDocument()
})

test('수단을 고르지 않았거나 교재비가 숫자가 아니면 칸에 알리고 확인 창을 열지 않는다', async () => {
  mockServer()
  await openPage()
  await screen.findByRole('radiogroup', { name: '결제 수단' })
  await userEvent.clear(screen.getByRole('textbox', { name: '교재비(원)' }))
  await userEvent.type(screen.getByRole('textbox', { name: '교재비(원)' }), '이만원')

  await userEvent.click(recordButton())

  expect(screen.getByRole('radiogroup', { name: '결제 수단' })).toHaveAccessibleDescription(
    '결제 수단을 골라 주세요.',
  )
  expect(screen.getByRole('textbox', { name: '교재비(원)' })).toHaveAccessibleDescription(
    '교재비를 원 단위 숫자로 적어 주세요. 없으면 0이에요.',
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(count(RECORD)).toBe(0)
})

test('결제를 기록하면 확인 창을 거쳐 청구 합계 그대로 멱등 키와 함께 보내고, 결제한 청구로 바뀐다', async () => {
  mockServer()
  await openPage()

  await fillPayment()
  const dialog = await screen.findByRole('dialog', { name: '이대로 결제를 기록할까요?' })
  expect(
    within(dialog)
      .getAllByRole('definition')
      .map((value) => value.textContent),
  ).toEqual(['현금', '299,250원', '20,000원'])
  await userEvent.click(within(dialog).getByRole('button', { name: '기록하기' }))

  expect(await screen.findByText('결제를 기록했어요.')).toBeInTheDocument()
  expect(count(RECORD)).toBe(1)
  expect(requestOf(RECORD).body).toEqual({ method: 'CASH', amount: 299_250, bookFee: 20_000 })
  expect(requestOf(RECORD).headers.get('Idempotency-Key')).toMatch(UUID)
  // 청구를 다시 읽어 결제한 청구를 보여 준다.
  await screen.findByText('결제함')
  const paidCard = screen.getByRole('heading', { name: '결제' }).parentElement!
  expect(
    within(paidCard)
      .getAllByRole('definition')
      .map((value) => value.textContent),
  ).toEqual(['현금', '299,250원', '20,000원', '2026.10.21 15:40'])
  expect(screen.queryByRole('button', { name: '결제 기록하기' })).not.toBeInTheDocument()
})

test('확인 창에서 돌아가면 보내지 않는다', async () => {
  mockServer()
  await openPage()
  await fillPayment('포스기 카드', '0')

  const dialog = await screen.findByRole('dialog', { name: '이대로 결제를 기록할까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '돌아가기' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(count(RECORD)).toBe(0)
})

test('보내는 동안에는 다시 누를 수 없고 다른 화면으로 가지 못한다', async () => {
  mockServer()
  const hold = holdResponse()
  mockApi({ [RECORD]: () => hold.pending })
  const { router } = await openPage()
  await fillPayment()
  await confirmPayment()

  expect(screen.getByRole('button', { name: '기록하는 중' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '청구 취소' })).toBeDisabled()
  await userEvent.click(screen.getByRole('link', { name: '김하윤 학생 상세' }))
  expect(await screen.findByRole('dialog', { name: '처리하는 중이에요' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe(PATH)

  hold.respond(jsonResponse(paid.payment, 201))
  expect(await screen.findByText('결제를 기록했어요.')).toBeInTheDocument()
  expect(count(RECORD)).toBe(1)
})

test('응답을 받지 못했고 다시 읽은 청구가 그대로면, 칸을 잠그고 같은 키로 그대로 다시 보내게 한다', async () => {
  const server = mockServer()
  let fail = true
  mockApi({
    [RECORD]: ({ body }) => {
      if (fail) return unreadableResponse()
      const made = payment(body as PaymentRequest)
      server.invoice = { ...server.invoice, status: 'PAID', payment: made }
      return jsonResponse(made, 201)
    },
  })
  const { router } = await openPage()
  const before = count(INVOICE)
  await fillPayment()
  await confirmPayment()

  expect(await screen.findByText(new RegExp(UNSURE_RESEND_AS_IS))).toBeInTheDocument()
  // 청구를 다시 읽어 결과를 가른다.
  await waitFor(() => expect(count(INVOICE)).toBe(before + 1))
  expect(screen.getByRole('textbox', { name: '교재비(원)' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '청구 취소' })).toBeDisabled()
  const firstKey = requestOf(RECORD).headers.get('Idempotency-Key')
  await userEvent.click(screen.getByRole('link', { name: '김하윤 학생 상세' }))
  expect(await screen.findByRole('dialog', { name: '결과를 아직 몰라요' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe(PATH)
  await userEvent.click(screen.getByRole('button', { name: '확인' }))

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '그대로 다시 보내기' }))

  expect(await screen.findByText('결제를 기록했어요.')).toBeInTheDocument()
  expect(count(RECORD)).toBe(2)
  expect(requestOf(RECORD).headers.get('Idempotency-Key')).toBe(firstKey)
  expect(requestOf(RECORD).body).toEqual({ method: 'CASH', amount: 299_250, bookFee: 20_000 })
})

test('응답을 받지 못했지만 다시 읽은 청구가 결제함이면 기록된 것으로 보고 다시 보내지 않게 한다', async () => {
  const server = mockServer()
  mockApi({
    [RECORD]: ({ body }) => {
      // 서버에서는 기록됐는데 답만 잃었다.
      server.invoice = {
        ...server.invoice,
        status: 'PAID',
        payment: payment(body as PaymentRequest),
      }
      return unreadableResponse()
    },
  })
  await openPage()
  await fillPayment()
  await confirmPayment()

  expect(await screen.findByText('결제를 기록했어요.')).toBeInTheDocument()
  await screen.findByText('결제함')
  expect(screen.queryByRole('button', { name: '그대로 다시 보내기' })).not.toBeInTheDocument()
  expect(screen.queryByText(new RegExp(UNSURE_RESEND_AS_IS))).not.toBeInTheDocument()
  expect(count(RECORD)).toBe(1)
})

test('교재비를 서버가 거부하면 교재비 칸에 알리고, 고치면 그 안내를 지운다', async () => {
  mockServer()
  mockApi({
    [RECORD]: () =>
      problemResponse(400, {
        code: 'BILLING_INVALID_BOOK_FEE',
        detail: '교재비는 1원 단위, 1,000만 원까지입니다.',
      }),
  })
  await openPage()
  await fillPayment('현금', '20,000,000')
  await confirmPayment()

  const fee = screen.getByRole('textbox', { name: '교재비(원)' })
  await waitFor(() =>
    expect(fee).toHaveAccessibleDescription('교재비는 1원 단위, 1,000만 원까지입니다.'),
  )
  await userEvent.type(fee, '{Backspace}')
  expect(fee).not.toHaveAccessibleDescription(/1,000만 원까지/)
})

test('이미 결제했거나 취소한 청구라는 답이면 알리고 청구를 다시 읽는다', async () => {
  const server = mockServer()
  mockApi({
    [RECORD]: () => {
      server.invoice = paid
      return problemResponse(409, {
        code: 'BILLING_INVOICE_NOT_PAYABLE',
        detail: '결제할 수 없는 청구입니다.',
      })
    },
  })
  await openPage()
  const before = count(INVOICE)
  await fillPayment()
  await confirmPayment()

  await waitFor(() => expect(count(INVOICE)).toBe(before + 1))
  expect(await screen.findByText('결제함')).toBeInTheDocument()
})

test('결제 전 청구를 취소하면 확인 창을 거쳐 본문 없이 보내고, 취소한 청구로 바뀐다', async () => {
  mockServer()
  await openPage()
  await screen.findByRole('radiogroup', { name: '결제 수단' })

  await userEvent.click(screen.getByRole('button', { name: '청구 취소' }))
  const dialog = await screen.findByRole('dialog', { name: '청구를 취소할까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '청구 취소하기' }))

  expect(await screen.findByText('청구를 취소했어요.')).toBeInTheDocument()
  expect(requestOf(CANCEL_INVOICE).body).toBeUndefined()
  expect(requestOf(CANCEL_INVOICE).headers.get('Idempotency-Key')).toMatch(UUID)
  expect(await screen.findByText('취소함')).toBeInTheDocument()
  const notice = screen.getByText(/취소한 청구예요/)
  expect(within(notice).getByRole('link', { name: '패스 사용 내역' })).toHaveAttribute(
    'href',
    '/desk/dongtanpass/redemptions',
  )
  expect(screen.queryByRole('button', { name: '결제 기록하기' })).not.toBeInTheDocument()
})

test('청구 취소를 거부하면 서버의 안내를 보여 준다', async () => {
  mockServer()
  mockApi({
    [CANCEL_INVOICE]: () =>
      problemResponse(409, {
        code: 'BILLING_INVOICE_NOT_CANCELABLE',
        detail: '결제한 청구는 결제를 먼저 취소해 주세요.',
      }),
  })
  await openPage()
  await screen.findByRole('radiogroup', { name: '결제 수단' })

  await userEvent.click(screen.getByRole('button', { name: '청구 취소' }))
  await userEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: '청구 취소하기' }),
  )

  expect(await screen.findByText('결제한 청구는 결제를 먼저 취소해 주세요.')).toBeInTheDocument()
})

test('결제한 청구는 결제 정보를 보이고, 결제를 취소하면 환불 안내를 거쳐 다시 결제 전이 된다', async () => {
  mockServer(paid)
  await openPage()
  await screen.findByText('결제함')

  await userEvent.click(screen.getByRole('button', { name: '결제 취소' }))
  const dialog = await screen.findByRole('dialog', { name: '결제를 취소할까요?' })
  expect(dialog).toHaveAccessibleDescription(
    '환불은 포스기에서 따로 해 주세요. 앱에는 취소 기록만 남고, 청구는 다시 결제 전이 돼요.',
  )
  await userEvent.click(within(dialog).getByRole('button', { name: '결제 취소하기' }))

  expect(
    await screen.findByText('결제를 취소했어요. 청구는 다시 결제 전이에요.'),
  ).toBeInTheDocument()
  expect(requestOf(CANCEL_PAYMENT).headers.get('Idempotency-Key')).toMatch(UUID)
  expect(await screen.findByText('결제 전')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '결제 기록하기' })).toBeEnabled()
})

test('결제 취소의 응답을 받지 못했고 다시 읽은 청구가 그대로면 같은 키로 다시 보내게 한다', async () => {
  const server = mockServer(paid)
  let fail = true
  mockApi({
    [CANCEL_PAYMENT]: () => {
      if (fail) return unreadableResponse()
      server.invoice = { ...server.invoice, status: 'ISSUED', payment: null }
      return jsonResponse({ ...paid.payment, status: 'CANCELED' })
    },
  })
  await openPage()
  await screen.findByText('결제함')
  await userEvent.click(screen.getByRole('button', { name: '결제 취소' }))
  await userEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: '결제 취소하기' }),
  )

  const resend = await screen.findByRole('button', { name: '그대로 다시 보내기' })
  const firstKey = requestOf(CANCEL_PAYMENT).headers.get('Idempotency-Key')
  fail = false
  await userEvent.click(resend)

  expect(
    await screen.findByText('결제를 취소했어요. 청구는 다시 결제 전이에요.'),
  ).toBeInTheDocument()
  expect(requestOf(CANCEL_PAYMENT).headers.get('Idempotency-Key')).toBe(firstKey)
})

test('관리자도 결제를 기록할 수 있다', async () => {
  mockServer()
  await openPage(admin)
  await fillPayment()
  await confirmPayment()

  expect(await screen.findByText('결제를 기록했어요.')).toBeInTheDocument()
})

test.each([
  [
    '결제 취소',
    paid,
    '결제 취소',
    '결제 취소하기',
    CANCEL_PAYMENT,
    (invoice: Invoice): Invoice => ({ ...invoice, status: 'ISSUED', payment: null }),
    '결제를 취소했어요. 청구는 다시 결제 전이에요.',
  ],
  [
    '청구 취소',
    issued,
    '청구 취소',
    '청구 취소하기',
    CANCEL_INVOICE,
    (invoice: Invoice): Invoice => ({ ...invoice, status: 'CANCELED' }),
    '청구를 취소했어요.',
  ],
])(
  '%s의 응답을 받지 못했지만 다시 읽은 청구가 바뀌었으면 처리된 것으로 본다',
  async (_name, start, button, confirm, key, after, doneText) => {
    const server = mockServer(start)
    mockApi({
      [key]: () => {
        // 서버에서는 처리됐는데 답만 잃었다.
        server.invoice = after(server.invoice)
        return unreadableResponse()
      },
    })
    await openPage()
    await userEvent.click(await screen.findByRole('button', { name: button }))
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: confirm }),
    )

    expect(await screen.findByText(doneText)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '그대로 다시 보내기' })).not.toBeInTheDocument()
    expect(count(key)).toBe(1)
  },
)

test('앞서 보낸 기록을 아직 처리 중이라는 답도 결과를 모르는 것으로 보고 칸을 잠근다', async () => {
  mockServer()
  mockApi({
    [RECORD]: () =>
      problemResponse(409, {
        code: 'COMMON_IDEMPOTENCY_IN_PROGRESS',
        detail: '같은 요청을 처리하고 있습니다.',
      }),
  })
  await openPage()
  await fillPayment()
  await confirmPayment()

  expect(await screen.findByRole('button', { name: '그대로 다시 보내기' })).toBeEnabled()
  expect(screen.getByRole('textbox', { name: '교재비(원)' })).toBeDisabled()
})

test('칸에 붙지 않는 거부 안내는 칸을 고치면 지운다', async () => {
  mockServer()
  mockApi({
    [RECORD]: () =>
      problemResponse(409, {
        code: 'BILLING_PAYMENT_AMOUNT_MISMATCH',
        detail: '받은 수강료가 청구 금액과 다릅니다.',
      }),
  })
  await openPage()
  await fillPayment()
  await confirmPayment()
  expect(await screen.findByText('받은 수강료가 청구 금액과 다릅니다.')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('radio', { name: '포스기 카드' }))

  expect(screen.queryByText('받은 수강료가 청구 금액과 다릅니다.')).not.toBeInTheDocument()
})
