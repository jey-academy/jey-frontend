import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
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
  studentName: '김하윤',
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
      discounts: [{ code: 'DONGTAN_PASS', name: '제이G패스', rate: 0.05, amount: 15_750 }],
    },
  ],
}

const payment = (body: PaymentRequest): Payment => ({
  paymentId: 77,
  invoiceId: 501,
  campusId: 1,
  studentId: 16,
  studentName: '김하윤',
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
  expect(screen.getByRole('link', { name: '수납 목록으로' })).toHaveAttribute(
    'href',
    '/desk/billing',
  )
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
  ).toEqual(['중1 정규 · 9회', '제이G패스 5%'])
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

test('학생 이름은 청구 응답의 것을 쓰고 학생을 따로 받지 않는다', async () => {
  mockServer({ ...issued, studentName: '박서연' })
  await openPage()

  expect(screen.getByText('박서연', { selector: 'span' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '박서연 학생 상세' })).toHaveAttribute(
    'href',
    '/desk/students/16',
  )
  expect(count(STUDENT)).toBe(0)
  expect(screen.queryByText(/학생을 찾을 수 없어요/)).not.toBeInTheDocument()
})

test('청구에 학생 이름이 없으면 학생 번호로 보이고, 상세로 가는 길은 두고, 결제 전에 확인하라고 알린다', async () => {
  mockServer({ ...issued, studentName: null })
  await openPage()

  expect(screen.getByText('학생 16', { selector: 'span' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '학생 16 학생 상세' })).toHaveAttribute(
    'href',
    '/desk/students/16',
  )
  expect(
    screen.getByText('이 청구의 학생을 찾을 수 없어요. 결제 전에 관리자에게 확인해 주세요.'),
  ).toBeInTheDocument()
  // 결제 기록은 막지 않는다.
  expect(recordButton()).toBeInTheDocument()
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

test('결제를 기록하거나 취소하면 그 달 청구 목록과 결제 목록을 낡은 것으로 표시한다(돌아가면 새 상태를 받는다)', async () => {
  mockServer()
  const { queryClient } = await openPage()
  // 수납에서 받아 둔 그 달 청구 목록(결제 전으로 보임)과 오늘 결제 목록(이 결제가 없음).
  const listKey = ['billing', 'invoices', 'list', { targetMonth: '2026-11', page: 0 }]
  const paymentsKey = ['billing', 'payments', { from: '2026-10-21', to: '2026-10-21', page: 0 }]
  const keep = () => {
    queryClient.setQueryData(listKey, { items: [] })
    queryClient.setQueryData(paymentsKey, { items: [] })
  }
  const invalidated = (key: unknown[]) => queryClient.getQueryState(key)?.isInvalidated
  keep()

  await fillPayment()
  await confirmPayment()
  await screen.findByRole('button', { name: '결제 취소' })
  await waitFor(() => expect(invalidated(listKey)).toBe(true))
  expect(invalidated(paymentsKey)).toBe(true)

  // 결제 취소도 같다.
  keep()
  expect(invalidated(listKey)).toBe(false)
  expect(invalidated(paymentsKey)).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: '결제 취소' }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.click(within(dialog).getByRole('button', { name: /취소하기/ }))
  await screen.findByRole('button', { name: '결제 기록하기' })
  await waitFor(() => expect(invalidated(listKey)).toBe(true))
  expect(invalidated(paymentsKey)).toBe(true)
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
  const server = mockServer()
  const hold = holdResponse()
  mockApi({
    [RECORD]: async ({ body }) => {
      const response = await hold.pending
      server.invoice = {
        ...server.invoice,
        status: 'PAID',
        payment: payment(body as PaymentRequest),
      }
      return response
    },
  })
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

  // 상태만으로는 누가 기록했는지 모른다. 확인했다고만 하고 아래 내용을 보게 한다.
  expect(
    await screen.findByText('처리된 것을 확인했어요. 아래 내용이 맞는지 봐 주세요.'),
  ).toBeInTheDocument()
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

test('청구를 취소하면 사용 기록(내역·단건)을 낡은 것으로 표시한다. 열린 청구 번호가 사라진다', async () => {
  mockServer()
  const { queryClient } = await openPage()
  // 사용 내역·청구 만들기 화면에서 받아 둔 사용 기록. 열린 청구로 이 청구를 가리킨다.
  const detailKey = ['dongtanpass', 'redemptions', 'detail', 300]
  const listKey = ['dongtanpass', 'redemptions', { from: '2026-10-01', to: '2026-10-21', page: 0 }]
  queryClient.setQueryData(detailKey, { redemptionId: 300, invoiceId: 501 })
  queryClient.setQueryData(listKey, { items: [] })
  await screen.findByRole('radiogroup', { name: '결제 수단' })

  await userEvent.click(screen.getByRole('button', { name: '청구 취소' }))
  const dialog = await screen.findByRole('dialog', { name: '청구를 취소할까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '청구 취소하기' }))

  await screen.findByText('청구를 취소했어요.')
  await waitFor(() => expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true))
  expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true)
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

  // 다른 곳에서 먼저 처리됐다는 답이다. 서버 문구에 할 일을 붙여 처리 칸 밖에 남긴다.
  expect(
    await screen.findByText(
      '결제한 청구는 결제를 먼저 취소해 주세요. 다른 곳에서 먼저 처리했을 수 있어요. 아래 상태를 확인해 주세요.',
    ),
  ).toBeInTheDocument()
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
    '처리된 것을 확인했어요. 아래 내용이 맞는지 봐 주세요.',
  ],
  [
    '청구 취소',
    issued,
    '청구 취소',
    '청구 취소하기',
    CANCEL_INVOICE,
    (invoice: Invoice): Invoice => ({ ...invoice, status: 'CANCELED' }),
    '처리된 것을 확인했어요. 아래 내용이 맞는지 봐 주세요.',
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

// ── 결과를 모를 때의 판단: 보낼 때의 청구와 달라지면 한 번만 정하고, 키를 버린다 ──

const CONFIRMED = '처리된 것을 확인했어요. 아래 내용이 맞는지 봐 주세요.'
const key = (request: string) => requestOf(request).headers.get('Idempotency-Key')

/** 학생 상세로 넘어갈 때 그 화면이 받는 것 */
function mockStudentPage() {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse([]),
    'GET /api/v1/auth/me': () => jsonResponse(staff),
  })
}

test('답을 몰랐다가 처리된 것을 확인한 뒤, 결제를 취소하고 같은 내용으로 새로 기록하면 새 키로 보낸다', async () => {
  const server = mockServer()
  let lose = true
  mockApi({
    [RECORD]: ({ body }) => {
      const made = { ...payment(body as PaymentRequest), paymentId: lose ? 77 : 78 }
      server.invoice = { ...server.invoice, status: 'PAID', payment: made }
      if (!lose) return jsonResponse(made, 201)
      // 서버에서는 기록됐는데 답만 잃었다.
      lose = false
      return unreadableResponse()
    },
  })
  await openPage()
  await fillPayment()
  await confirmPayment()
  expect(await screen.findByText(CONFIRMED)).toBeInTheDocument()
  const firstKey = key(RECORD)

  await userEvent.click(screen.getByRole('button', { name: '결제 취소' }))
  await userEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: '결제 취소하기' }),
  )
  await screen.findByText('결제를 취소했어요. 청구는 다시 결제 전이에요.')
  // 처음과 같은 수단·교재비. 옛 키로 나가면 서버가 옛 응답을 돌려줄 뿐 기록하지 않는다.
  await fillPayment()
  await confirmPayment()

  expect(await screen.findByText('결제를 기록했어요.')).toBeInTheDocument()
  expect(count(RECORD)).toBe(2)
  expect(key(RECORD)).toMatch(UUID)
  expect(key(RECORD)).not.toBe(firstKey)
})

test('결제 취소의 답을 모르는 사이 다른 결제로 바뀌었으면, 그 결제를 취소하지 않고 바뀌었다고 알린 뒤 막기를 푼다', async () => {
  const server = mockServer(paid)
  const OTHER_CANCEL = 'POST /api/v1/billing/payments/88/cancel'
  mockApi({
    [CANCEL_PAYMENT]: () => {
      // 서버에 닿지 못했다. 그사이 다른 데스크가 취소하고 새로 기록했다.
      server.invoice = { ...paid, payment: { ...paid.payment!, paymentId: 88 } }
      return unreadableResponse()
    },
    [OTHER_CANCEL]: () => jsonResponse({}),
  })
  const { router } = await openPage()
  await screen.findByText('결제함')

  await userEvent.click(screen.getByRole('button', { name: '결제 취소' }))
  await userEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: '결제 취소하기' }),
  )

  expect(
    await screen.findByText('그사이 청구가 바뀌었어요(지금: 결제함). 아래 상태를 확인해 주세요.'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '그대로 다시 보내기' })).not.toBeInTheDocument()
  expect(count(OTHER_CANCEL)).toBe(0)
  mockStudentPage()
  await userEvent.click(screen.getByRole('link', { name: '김하윤 학생 상세' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/desk/students/16'))
})

test('결제 기록의 답을 모르는 사이 다른 곳에서 청구를 취소했으면, 바뀌었다고 알리고 떠날 수 있다', async () => {
  const server = mockServer()
  mockApi({
    [RECORD]: () => {
      server.invoice = { ...server.invoice, status: 'CANCELED' }
      return unreadableResponse()
    },
  })
  const { router } = await openPage()
  await fillPayment()
  await confirmPayment()

  expect(
    await screen.findByText('그사이 청구가 바뀌었어요(지금: 취소함). 아래 상태를 확인해 주세요.'),
  ).toBeInTheDocument()
  mockStudentPage()
  await userEvent.click(screen.getByRole('link', { name: '김하윤 학생 상세' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/desk/students/16'))
})

test('처리된 것을 확인한 뒤 다른 곳에서 상태를 되돌려도 다시 "결과 모름"이 되지 않고, 확인 안내도 거둔다', async () => {
  const server = mockServer()
  mockApi({
    [RECORD]: ({ body }) => {
      server.invoice = {
        ...server.invoice,
        status: 'PAID',
        payment: payment(body as PaymentRequest),
      }
      return unreadableResponse()
    },
  })
  const { queryClient } = await openPage()
  await fillPayment()
  await confirmPayment()
  await screen.findByText(CONFIRMED)

  // 다른 데스크가 결제를 취소했다.
  server.invoice = issued
  await act(() => queryClient.invalidateQueries({ queryKey: ['billing', 'invoices'] }))

  await screen.findByText('결제 전')
  expect(screen.queryByText(CONFIRMED)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '그대로 다시 보내기' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '결제 기록하기' })).toBeEnabled()
})

test('끝났다는 안내는 청구가 그 상태인 동안만 보인다', async () => {
  const server = mockServer()
  const { queryClient } = await openPage()
  await fillPayment()
  await confirmPayment()
  await screen.findByText('결제를 기록했어요.')

  server.invoice = issued
  await act(() => queryClient.invalidateQueries({ queryKey: ['billing', 'invoices'] }))

  await screen.findByText('결제 전')
  expect(screen.queryByText('결제를 기록했어요.')).not.toBeInTheDocument()
})

test('결과를 모르는데 청구 다시 읽기도 실패하면 이전 상태를 잠근 채 두고, 다시 읽어 처리된 것을 확인한다', async () => {
  const server = mockServer()
  let readFails = false
  mockApi({
    [INVOICE]: () =>
      readFails
        ? // 5xx는 조회가 저절로 몇 번 다시 시도해 느리다. 다시 시도하지 않는 실패로 둔다.
          problemResponse(400, { detail: '서버 오류입니다.' })
        : jsonResponse(server.invoice),
    [RECORD]: ({ body }) => {
      server.invoice = {
        ...server.invoice,
        status: 'PAID',
        payment: payment(body as PaymentRequest),
      }
      readFails = true
      return unreadableResponse()
    },
  })
  await openPage()
  await fillPayment()
  await confirmPayment()

  expect(
    await screen.findByText(
      /청구를 새로 불러오지 못했어요\. 서버 오류입니다\./,
      {},
      { timeout: 5000 },
    ),
  ).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '교재비(원)' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '그대로 다시 보내기' })).toBeEnabled()

  readFails = false
  await userEvent.click(screen.getByRole('button', { name: '청구 다시 불러오기' }))

  expect(await screen.findByText(CONFIRMED)).toBeInTheDocument()
  expect(count(RECORD)).toBe(1)
})

test('받아 둔 청구가 있으면 다시 읽기의 404로 화면을 바꾸지 않는다', async () => {
  mockServer()
  let gone = false
  mockApi({
    [INVOICE]: () =>
      gone
        ? problemResponse(404, {
            code: 'BILLING_INVOICE_NOT_FOUND',
            detail: '청구를 찾을 수 없습니다.',
          })
        : jsonResponse(issued),
  })
  const { queryClient } = await openPage()

  gone = true
  await act(() => queryClient.invalidateQueries({ queryKey: ['billing', 'invoices'] }))

  expect(
    await screen.findByText(/청구를 새로 불러오지 못했어요\. 청구를 찾을 수 없습니다\./),
  ).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '없는 청구예요' })).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: '청구 내역' })).toBeInTheDocument()
})

test('처음 불러오기가 실패하면 까닭을 알리고 다시 불러올 수 있다', async () => {
  mockServer()
  let fail = true
  mockApi({
    [INVOICE]: () =>
      fail ? problemResponse(400, { detail: '요청이 올바르지 않습니다.' }) : jsonResponse(issued),
  })
  renderApp(PATH, { me: staff })

  expect(
    await screen.findByText('청구를 불러오지 못했어요. 요청이 올바르지 않습니다.'),
  ).toBeInTheDocument()
  fail = false
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

  expect(await screen.findByRole('region', { name: '청구 내역' })).toBeInTheDocument()
})

test('기록한 뒤 같은 화면에서 바로 결제를 취소하면 방금 기록한 결제로 보낸다', async () => {
  mockServer()
  await openPage()
  await fillPayment()
  await confirmPayment()
  await screen.findByText('결제함')

  await userEvent.click(screen.getByRole('button', { name: '결제 취소' }))
  await userEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: '결제 취소하기' }),
  )

  expect(
    await screen.findByText('결제를 취소했어요. 청구는 다시 결제 전이에요.'),
  ).toBeInTheDocument()
  expect(count(CANCEL_PAYMENT)).toBe(1)
  expect(requests().some((request) => request.includes('/payments/0/'))).toBe(false)
})

test('확인 창의 기록하기를 두 번 눌러도 한 번만 보낸다', async () => {
  mockServer()
  await openPage()
  await fillPayment()

  const dialog = await screen.findByRole('dialog', { name: '이대로 결제를 기록할까요?' })
  await userEvent.dblClick(within(dialog).getByRole('button', { name: '기록하기' }))

  expect(await screen.findByText('결제를 기록했어요.')).toBeInTheDocument()
  expect(count(RECORD)).toBe(1)
})

test('확인 창을 연 채 청구가 바뀌면 창을 닫고 알리며 보내지 않는다', async () => {
  const server = mockServer(paid)
  const { queryClient } = await openPage()
  await screen.findByText('결제함')
  await userEvent.click(screen.getByRole('button', { name: '결제 취소' }))
  await screen.findByRole('dialog', { name: '결제를 취소할까요?' })

  // 다른 데스크가 먼저 취소했다.
  server.invoice = issued
  await act(() => queryClient.invalidateQueries({ queryKey: ['billing', 'invoices'] }))

  expect(
    await screen.findByText('그사이 청구가 바뀌었어요(지금: 결제 전). 아래 상태를 확인해 주세요.'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(count(CANCEL_PAYMENT)).toBe(0)
})

test('다른 곳에서 먼저 처리됐다는 409는 다시 읽어 칸이 바뀐 뒤에도 안내가 남는다', async () => {
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
  await fillPayment()
  await confirmPayment()

  await screen.findByText('결제함')
  expect(
    screen.getByText(
      '결제할 수 없는 청구입니다. 다른 곳에서 먼저 처리했을 수 있어요. 아래 상태를 확인해 주세요.',
    ),
  ).toBeInTheDocument()
})

test('서버가 수강료(amount) 칸을 짚으면 폼 아래에 알린다(그 칸은 입력칸이 아니다)', async () => {
  mockServer()
  mockApi({
    [RECORD]: () =>
      problemResponse(400, {
        code: 'COMMON_VALIDATION_FAILED',
        detail: '입력값이 올바르지 않습니다.',
        errors: [{ field: 'amount', message: '수강료는 0보다 커야 합니다.' }],
      }),
  })
  await openPage()
  await fillPayment()
  await confirmPayment()

  expect(await screen.findByText('수강료는 0보다 커야 합니다.')).toBeInTheDocument()
})

test('결제함인데 결제 정보가 없으면 그렇게 알리고 결제 취소를 막는다', async () => {
  mockServer({ ...paid, payment: null })
  await openPage()

  expect(await screen.findByText('결제 정보가 없어요. 관리자에게 알려 주세요.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '결제 취소' })).toBeDisabled()
})

test('결제 정보의 금액을 표시할 수 없어도 화면을 지키고 "확인 필요"로 보인다', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockServer({ ...paid, payment: { ...paid.payment!, bookFee: 0.5 } })
  await openPage()

  const paidCard = (await screen.findByRole('heading', { name: '결제' })).parentElement!
  expect(
    within(paidCard)
      .getAllByRole('definition')
      .map((value) => value.textContent),
  ).toEqual(['포스기 카드', '299,250원', '확인 필요', '2026.10.21 15:40'])
})

test('모르는 청구 상태면 처리 칸 대신 알린다', async () => {
  // 서버가 약속에 없는 값을 보낸 경우(타입에는 없다).
  mockServer({ ...issued, status: 'REFUNDED' as Invoice['status'] })
  await openPage()

  expect(
    await screen.findByText('알 수 없는 청구 상태예요(REFUNDED). 관리자에게 알려 주세요.'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '결제 기록하기' })).not.toBeInTheDocument()
})

test.each([
  ['결제 기록', issued, '결제함'],
  ['결제 취소', paid, '결제 전'],
  ['청구 취소', issued, '취소함'],
])(
  '%s에 성공한 뒤 청구 다시 읽기가 실패해도 성공 답으로 상태를 맞춰, 옛 상태의 버튼이 남지 않는다',
  async (name, start, after) => {
    const server = mockServer(start)
    const { queryClient } = await openPage()
    // 처리가 끝나면(성공) 다시 읽기는 실패한다.
    mockApi({ [INVOICE]: () => problemResponse(400, { detail: '요청이 올바르지 않습니다.' }) })

    if (name === '결제 기록') {
      await fillPayment()
      await confirmPayment()
    } else {
      const [button, confirm] =
        name === '결제 취소' ? ['결제 취소', '결제 취소하기'] : ['청구 취소', '청구 취소하기']
      await userEvent.click(await screen.findByRole('button', { name: button }))
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: confirm }),
      )
    }

    expect(await screen.findByText(after)).toBeInTheDocument()
    await waitFor(() =>
      expect(queryClient.getQueryState(['billing', 'invoices', 'detail', 501])?.status).toBe(
        'error',
      ),
    )
    // 서버의 청구도 바뀌어 있지만(흉내), 화면은 다시 읽지 못했다. 그래도 답으로 맞춘 상태다.
    expect(server.invoice.status).not.toBe(start.status)
    expect(screen.getByText(after)).toBeInTheDocument()
  },
)
