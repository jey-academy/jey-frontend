import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Campus } from '@/shared/campus'
import {
  expectNoRequests,
  jsonResponse,
  mockApi,
  problemResponse,
  requests,
  setupMockApi,
} from '@/test/mockApi'
import { admin, partner, renderApp, staff } from '@/test/renderApp'
import { expectStackLabels } from '@/test/table'
import type { Payment, PaymentPage } from '../api'

setupMockApi()

const PATH = '/desk/billing/payments'
const LIST = 'GET /api/v1/billing/payments'
const CAMPUSES = 'GET /api/v1/campuses'
const TODAY = '2026-10-23'

const campuses: Campus[] = [
  { id: 1, name: '동탄관' },
  { id: 2, name: '능동관' },
]

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    paymentId: 77,
    invoiceId: 501,
    campusId: 1,
    studentId: 16,
    studentName: '김하윤',
    method: 'CARD_POS',
    amount: 299_250,
    bookFee: 15_000,
    status: 'COMPLETED',
    // 한국 시각 2026.10.23 15:40
    paidAt: '2026-10-23T06:40:00Z',
    canceledAt: null,
    ...overrides,
  }
}

const card = payment()
/** 능동관 이서준의 현금 결제. 취소했다(한국 시각 16:05). */
const canceledCash = payment({
  paymentId: 78,
  invoiceId: 502,
  campusId: 2,
  studentId: 17,
  studentName: '이서준',
  method: 'CASH',
  amount: 540_000,
  bookFee: 0,
  status: 'CANCELED',
  paidAt: '2026-10-23T05:10:00Z',
  canceledAt: '2026-10-23T07:05:00Z',
})

function page(items: Payment[], overrides: Partial<PaymentPage> = {}): PaymentPage {
  return {
    items,
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages: items.length > 0 ? 1 : 0,
    ...overrides,
  }
}

function mockList(body: PaymentPage = page([card, canceledCash])) {
  mockApi({ [LIST]: () => jsonResponse(body), [CAMPUSES]: () => jsonResponse(campuses) })
}

/** 마지막 목록 요청의 쿼리. 늘 같은 페이지 크기(size=100)는 빼고 본다(따로 확인한다). */
function lastQuery() {
  const { size, ...rest } = lastRawQuery()
  if (size !== '100') throw new Error(`페이지 크기가 100이 아니에요: ${size}`)
  return rest
}

function lastRawQuery() {
  const key = requests().findLast((request) => request.startsWith(LIST))
  if (!key) throw new Error('목록 요청이 없어요')
  const query: Record<string, string> = {}
  new URLSearchParams(key.split('?')[1] ?? '').forEach((value, name) => {
    query[name] = value
  })
  return query
}

function listCount() {
  return requests().filter((request) => request.startsWith(LIST)).length
}

async function openPage(path = PATH, me = staff) {
  const rendered = renderApp(path, { me })
  await screen.findByRole('table', { name: '결제 목록' })
  return rendered
}

async function setPeriod(from: string, to?: string) {
  const fromField = screen.getByLabelText('결제일 시작')
  await userEvent.clear(fromField)
  if (from) await userEvent.type(fromField, from)
  if (to !== undefined) {
    const toField = screen.getByLabelText('결제일 끝')
    await userEvent.clear(toField)
    await userEvent.type(toField, to)
  }
}

beforeEach(() => {
  // 한국의 오늘은 2026-10-23이다(UTC로는 아직 22일 밤이다).
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-23T08:00:00+09:00') })
})

afterEach(() => {
  vi.useRealTimers()
})

// ── 처음 화면과 줄 ─────────────────────────────────────────

test('처음 열면 한국의 오늘 하루를 요청하고, 직원은 지점을 보내지 않는다', async () => {
  mockList()
  await openPage()

  // 하루 정산 때 넘기지 않게 한 페이지에 100건(서버의 상한)을 받는다.
  expect(lastRawQuery()).toEqual({ from: TODAY, to: TODAY, size: '100' })
  expect(screen.getByLabelText('결제일 시작')).toHaveValue(TODAY)
  expect(screen.getByLabelText('결제일 끝')).toHaveValue(TODAY)
  expect(screen.queryByRole('radiogroup', { name: '지점' })).not.toBeInTheDocument()
  expect(screen.queryByRole('columnheader', { name: '지점' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '오늘로' })).not.toBeInTheDocument()
})

test('수납 안의 하위 메뉴에서 결제가 선택되고 청구 목록으로 갈 수 있다', async () => {
  mockList()
  await openPage()

  const menu = screen.getByRole('navigation', { name: '수납 메뉴' })
  expect(within(menu).getByRole('link', { name: '결제' })).toHaveAttribute('aria-current', 'page')
  expect(within(menu).getByRole('link', { name: '청구' })).toHaveAttribute('href', '/desk/billing')
  expect(within(menu).getByRole('link', { name: '청구' })).not.toHaveAttribute('aria-current')
})

test('줄마다 학생·결제 시각(한국 시각)·수단·수강료·교재비·상태와 청구 보기 링크를 보여 준다. 취소한 결제는 취소 시각도', async () => {
  mockList()
  await openPage()

  expect(screen.getByText('전체 2건')).toBeInTheDocument()
  const [, first, second] = screen.getAllByRole('row')
  const cells = (row: HTMLElement) =>
    within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
  expect(cells(first)).toEqual([
    '김하윤',
    '2026.10.23 15:40',
    '포스기 카드',
    '299,250원',
    '15,000원',
    '결제함',
    '청구 보기',
  ])
  // 취소한 결제의 금액은 그어서 흐리게 보이고, 화면 낭독기에는 취소한 금액이라고 읽힌다.
  expect(cells(second)).toEqual([
    '이서준',
    '2026.10.23 14:10',
    '현금',
    '취소한 금액 540,000원',
    '취소한 금액 0원',
    '취소함취소 2026.10.23 16:05',
    '청구 보기',
  ])
  const amountCells = (row: HTMLElement) => within(row).getAllByRole('cell').slice(3, 5)
  for (const cell of amountCells(second)) expect(cell).toHaveClass('line-through')
  for (const cell of amountCells(first)) expect(cell).not.toHaveClass('line-through')
  expect(within(first).getByRole('link', { name: '김하윤' })).toHaveAttribute(
    'href',
    '/desk/students/16',
  )
  expect(within(first).getByRole('link', { name: '김하윤 결제 77의 청구 보기' })).toHaveAttribute(
    'href',
    '/desk/billing/invoices/501',
  )
  expect(within(second).getByRole('link', { name: '이서준 결제 78의 청구 보기' })).toHaveAttribute(
    'href',
    '/desk/billing/invoices/502',
  )
  expectStackLabels(screen.getByRole('table', { name: '결제 목록' }))
})

test('이름이 없거나 모르는 수단·상태, 표시할 수 없는 금액도 줄은 보인다', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockList(
    page([
      payment({
        studentName: null,
        method: 'TRANSFER' as Payment['method'],
        status: 'REFUNDED' as Payment['status'],
        amount: 0.5,
      }),
    ]),
  )
  await openPage()

  const [, row] = screen.getAllByRole('row')
  expect(
    within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual([
    '학생 16',
    '2026.10.23 15:40',
    'TRANSFER',
    '확인 필요',
    '15,000원',
    'REFUNDED',
    '청구 보기',
  ])
})

test('이 기간에 기록한 결제가 없으면 그렇게 알린다', async () => {
  mockList(page([]))
  renderApp(PATH, { me: staff })

  expect(await screen.findByText('이 기간에 기록한 결제가 없어요')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

// ── 기간 ─────────────────────────────────────────────────

test('주소의 기간으로 연다', async () => {
  mockList()
  await openPage(`${PATH}?from=2026-10-01&to=2026-10-20`)
  expect(lastQuery()).toEqual({ from: '2026-10-01', to: '2026-10-20' })
})

test('주소의 날짜가 틀리거나 받는 범위 밖이면 그 칸은 오늘로 본다', async () => {
  mockList()
  await openPage(`${PATH}?from=2026-02-30&to=1999-12-31`)
  expect(lastQuery()).toEqual({ from: TODAY, to: TODAY })
})

test('기간을 바꿔 조회하면 첫 페이지부터 새 기간을 요청하고 주소에 남긴다. 오늘로 돌아올 수 있다', async () => {
  mockList()
  const { router } = await openPage()

  await setPeriod('2026-10-01')
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  await waitFor(() => expect(lastQuery()).toEqual({ from: '2026-10-01', to: TODAY }))
  expect(router.state.location.search).toBe(`?from=2026-10-01&to=${TODAY}`)

  await userEvent.click(screen.getByRole('link', { name: '오늘로' }))
  await waitFor(() => expect(screen.getByLabelText('결제일 시작')).toHaveValue(TODAY))
  expect(router.state.location.search).toBe('')
})

test.each([
  ['비우면', '', TODAY, '결제일 시작', '날짜를 넣어 주세요.'],
  ['끝일이 시작일보다 앞이면', TODAY, '2026-10-01', '결제일 끝', '끝일이 시작일보다 앞이에요.'],
  ['1년을 넘기면', '2025-10-22', TODAY, '결제일 끝', '기간은 1년까지 볼 수 있어요.'],
  // 서버는 2000-01-01~2099-12-31만 받는다.
  ['2000년 전이면', '1999-12-31', TODAY, '결제일 시작', '날짜를 확인해 주세요.'],
])('기간을 %s 칸에 알리고 요청하지 않는다', async (_name, fromValue, toValue, field, message) => {
  mockList()
  await openPage()
  const before = listCount()

  await setPeriod(fromValue, toValue)
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  expect(screen.getByLabelText(field)).toHaveAccessibleDescription(message)
  expect(listCount()).toBe(before)
})

test('딱 1년(시작일 + 1년)까지는 조회한다', async () => {
  mockList()
  await openPage()

  await setPeriod('2025-10-23')
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  await waitFor(() => expect(lastQuery()).toEqual({ from: '2025-10-23', to: TODAY }))
})

test.each([
  ['BILLING_PERIOD_TOO_LONG', '기간은 1년까지 볼 수 있어요. 기간 칸을 고친 뒤 조회해 주세요.'],
  ['BILLING_INVALID_PERIOD', '기간이 맞지 않아요. 기간 칸을 고친 뒤 조회해 주세요.'],
])(
  '서버가 기간이 틀렸다고 하면(%s) 다시 불러오기 대신 기간 칸을 고치게 한다',
  async (code, message) => {
    mockApi({
      [LIST]: () => problemResponse(400, { code, detail: '기간이 올바르지 않습니다.' }),
      [CAMPUSES]: () => jsonResponse(campuses),
    })
    renderApp(`${PATH}?from=2024-01-01&to=${TODAY}`, { me: staff })

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).not.toBeInTheDocument()
  },
)

// ── 지점과 페이지 ─────────────────────────────────────────

test('관리자는 처음에 전 지점을 보고 지점 칸이 있다. 지점을 고르면 그 지점만 요청하고 지점 칸을 숨긴다', async () => {
  mockList()
  const { router } = await openPage(PATH, admin)

  expect(lastQuery()).toEqual({ from: TODAY, to: TODAY })
  await waitFor(() =>
    expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toContain('능동관'),
  )
  expectStackLabels(screen.getByRole('table', { name: '결제 목록' }))

  await userEvent.click(screen.getByRole('radio', { name: '동탄관' }))

  await waitFor(() => expect(lastQuery()).toEqual({ from: TODAY, to: TODAY, campusId: '1' }))
  expect(router.state.location.search).toBe(`?from=${TODAY}&to=${TODAY}&campusId=1`)
  await waitFor(() =>
    expect(screen.queryByRole('columnheader', { name: '지점' })).not.toBeInTheDocument(),
  )
})

test('관리자가 주소의 지점으로 들어오면 그 지점만 요청하고 그 칩을 고른 채로 지점 칸을 숨긴다', async () => {
  mockList()
  await openPage(`${PATH}?from=${TODAY}&to=${TODAY}&campusId=1`, admin)

  expect(lastQuery()).toEqual({ from: TODAY, to: TODAY, campusId: '1' })
  await waitFor(() => expect(screen.getByRole('radio', { name: '동탄관' })).toBeChecked())
  expect(screen.queryByRole('columnheader', { name: '지점' })).not.toBeInTheDocument()
})

test('2페이지를 보다가 지점 칩을 바꾸면 첫 페이지부터 본다', async () => {
  mockList(page([card], { page: 1, totalElements: 120, totalPages: 2 }))
  const { router } = await openPage(`${PATH}?from=${TODAY}&to=${TODAY}&page=1`, admin)
  await waitFor(() => expect(screen.getByRole('radio', { name: '동탄관' })).toBeInTheDocument())

  await userEvent.click(screen.getByRole('radio', { name: '동탄관' }))

  await waitFor(() => expect(lastQuery()).toEqual({ from: TODAY, to: TODAY, campusId: '1' }))
  expect(router.state.location.search).toBe(`?from=${TODAY}&to=${TODAY}&campusId=1`)
})

test('페이지만 넘길 때는 받는 동안 이전 줄을 흐리게 남기고 다시 넘기지 못하게 한다', async () => {
  mockApi({
    [LIST]: ({ query }) =>
      query.get('page')
        ? new Promise<Response>(() => {})
        : jsonResponse(page([card], { totalElements: 101, totalPages: 2 })),
    [CAMPUSES]: () => jsonResponse(campuses),
  })
  await openPage()

  await userEvent.click(screen.getByRole('button', { name: '다음' }))

  await waitFor(() =>
    expect(screen.getByText('김하윤').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true'),
  )
  expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
})

test('관리자가 지점 목록을 받지 못하면 알리고, 지점 칸은 번호로 보이며 다시 받을 수 있다', async () => {
  let campusCalls = 0
  mockApi({
    [LIST]: () => jsonResponse(page([canceledCash])),
    [CAMPUSES]: () =>
      ++campusCalls === 1
        ? problemResponse(400, { detail: '요청이 올바르지 않습니다.' })
        : jsonResponse(campuses),
  })
  await openPage(PATH, admin)

  expect(
    await screen.findByText(
      '지점 이름을 불러오지 못했어요. 다른 지점을 고를 수 없고, 지점이 번호로 보여요.',
    ),
  ).toBeInTheDocument()
  expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toContain('지점 2')

  await userEvent.click(screen.getByRole('button', { name: '지점 다시 불러오기' }))
  expect(await screen.findByRole('radio', { name: '능동관' })).toBeInTheDocument()
})

test('직원은 주소에 지점이 있어도 보내지 않는다(다른 지점은 서버가 막는다)', async () => {
  mockList()
  await openPage(`${PATH}?from=${TODAY}&to=${TODAY}&campusId=2`)

  expect(lastQuery()).toEqual({ from: TODAY, to: TODAY })
})

test('다음 페이지를 누르면 같은 조건으로 그 페이지를 요청한다', async () => {
  mockList(page([card], { totalElements: 25, totalPages: 2 }))
  const { router } = await openPage()

  await userEvent.click(screen.getByRole('button', { name: '다음' }))

  await waitFor(() => expect(lastQuery()).toEqual({ from: TODAY, to: TODAY, page: '1' }))
  expect(router.state.location.search).toBe(`?from=${TODAY}&to=${TODAY}&page=1`)
})

test('지점을 바꾸면 새 결과가 올 때까지 이전 조건의 줄을 보여 주지 않는다', async () => {
  mockApi({
    [LIST]: ({ query }) =>
      query.get('campusId')
        ? new Promise<Response>(() => {})
        : jsonResponse(page([card, canceledCash])),
    [CAMPUSES]: () => jsonResponse(campuses),
  })
  await openPage(PATH, admin)

  await userEvent.click(screen.getByRole('radio', { name: '동탄관' }))

  expect(await screen.findByText('결제 목록을 불러오고 있어요.')).toBeInTheDocument()
  expect(screen.queryByText('이서준')).not.toBeInTheDocument()
})

test('없는 페이지면 조건은 그대로 두고 첫 페이지로 가는 길을 보여 준다', async () => {
  mockList(page([], { page: 3, totalElements: 21, totalPages: 2 }))
  renderApp(`${PATH}?from=2026-10-01&to=${TODAY}&campusId=1&page=3`, { me: admin })

  expect(await screen.findByText('이 페이지에는 결제가 없어요')).toBeInTheDocument()
  expect(screen.getByText('이 기간의 결제는 모두 21건이에요.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '첫 페이지로' })).toHaveAttribute(
    'href',
    `${PATH}?from=2026-10-01&to=${TODAY}&campusId=1`,
  )
})

// ── 오류와 갱신 ───────────────────────────────────────────

test('목록을 받지 못하면 알리고 다시 불러올 수 있다', async () => {
  let calls = 0
  mockApi({
    [LIST]: () =>
      ++calls === 1
        ? problemResponse(403, {
            code: 'AUTH_CAMPUS_NOT_ALLOWED',
            detail: '이 지점은 볼 수 없습니다.',
          })
        : jsonResponse(page([card])),
    [CAMPUSES]: () => jsonResponse(campuses),
  })
  renderApp(PATH, { me: staff })

  expect(await screen.findByText('이 지점은 볼 수 없습니다.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

  expect(await screen.findByRole('table', { name: '결제 목록' })).toBeInTheDocument()
})

test('결제를 기록하거나 취소해 목록을 다시 받다 실패하면 표는 두고 이전 내용일 수 있다고 알린다', async () => {
  let calls = 0
  mockApi({
    [LIST]: () =>
      ++calls === 1
        ? jsonResponse(page([card]))
        : problemResponse(400, { detail: '요청이 올바르지 않습니다.' }),
    [CAMPUSES]: () => jsonResponse(campuses),
  })
  const { queryClient } = await openPage()

  // 청구 상세에서 결제를 기록·취소하면 결제 목록 키를 낡은 것으로 표시한다.
  await act(() => queryClient.invalidateQueries({ queryKey: ['billing', 'payments'] }))

  expect(
    await screen.findByText(
      '최신 내용을 불러오지 못했어요. 아래 표는 이전 내용일 수 있어요. (요청이 올바르지 않습니다.)',
    ),
  ).toBeInTheDocument()
  const table = screen.getByRole('table', { name: '결제 목록' })
  expect(calls).toBe(2)
  // 페이지를 넘기면 위의 안내가 밀려 안 보인다. 표를 흐리게 하고 건수 옆에도 적는다.
  expect(screen.getByText('전체 1건 · 이전 내용')).toBeInTheDocument()
  expect(table.closest('.opacity-60')).not.toBeNull()
})

test('연계 학원은 이 화면을 볼 수 없고 목록을 요청하지 않는다', async () => {
  renderApp(PATH, { me: partner })

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expectNoRequests()
})
