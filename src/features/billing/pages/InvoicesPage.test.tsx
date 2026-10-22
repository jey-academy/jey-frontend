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
import type { Invoice, InvoicePage } from '../api'

setupMockApi()

const PATH = '/desk/billing'
const LIST = 'GET /api/v1/billing/invoices'
const CAMPUSES = 'GET /api/v1/campuses'

const campuses: Campus[] = [
  { id: 1, name: '동탄관' },
  { id: 2, name: '능동관' },
]

const line = (className: string, lessonCount: number) => ({
  classId: 10,
  className,
  lessonCount,
  listAmount: 315_000,
  chargeAmount: 299_250,
  discounts: [],
})

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 501,
    status: 'ISSUED',
    studentId: 16,
    studentName: '김하윤',
    campusId: 1,
    targetMonth: '2026-10',
    discountPolicy: 'ADDITIVE',
    payment: null,
    totalAmount: 299_250,
    lines: [line('중1 정규', 9)],
    ...overrides,
  }
}

const issued = invoice()
const paid = invoice({
  id: 502,
  status: 'PAID',
  studentId: 17,
  studentName: '이서준',
  campusId: 2,
  totalAmount: 540_000,
  // 반 나눔: 반마다 적는다.
  lines: [line('중2 정규', 8), line('중2 문법', 4)],
  payment: {
    paymentId: 77,
    invoiceId: 502,
    campusId: 2,
    studentId: 17,
    studentName: '이서준',
    method: 'CARD_POS',
    amount: 540_000,
    bookFee: 0,
    status: 'COMPLETED',
    paidAt: '2026-10-20T06:40:00Z',
    canceledAt: null,
  },
})

function page(items: Invoice[], overrides: Partial<InvoicePage> = {}): InvoicePage {
  return {
    items,
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages: items.length > 0 ? 1 : 0,
    ...overrides,
  }
}

function mockList(body: InvoicePage = page([issued, paid])) {
  mockApi({ [LIST]: () => jsonResponse(body), [CAMPUSES]: () => jsonResponse(campuses) })
}

/** 마지막 목록 요청의 쿼리 */
function lastQuery() {
  const key = requests().findLast((request) => request.startsWith(LIST))
  if (!key) throw new Error('목록 요청이 없어요')
  const query: Record<string, string> = {}
  new URLSearchParams(key.split('?')[1] ?? '').forEach((value, name) => {
    query[name] = value
  })
  return query
}

async function openPage(path = PATH, me = staff) {
  const rendered = renderApp(path, { me })
  await screen.findByRole('table', { name: /청구$/ })
  return rendered
}

beforeEach(() => {
  // 한국의 오늘은 2026-10-23이다.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-23T10:00:00+09:00') })
})

afterEach(() => {
  vi.useRealTimers()
})

test('처음 열면 이번 달 청구를 요청하고, 직원은 지점을 보내지 않는다', async () => {
  mockList()
  await openPage()

  expect(lastQuery()).toEqual({ targetMonth: '2026-10' })
  expect(screen.getByRole('heading', { level: 2, name: '2026년 10월' })).toBeInTheDocument()
  // 수납 안의 하위 메뉴에서 청구가 선택되고 결제 목록으로 갈 수 있다.
  const menu = screen.getByRole('navigation', { name: '수납 메뉴' })
  expect(within(menu).getByRole('link', { name: '청구' })).toHaveAttribute('aria-current', 'page')
  expect(within(menu).getByRole('link', { name: '결제' })).toHaveAttribute(
    'href',
    '/desk/billing/payments',
  )
  // 이번 달이면 "이번 달로"는 없다.
  expect(screen.queryByRole('link', { name: '이번 달로' })).not.toBeInTheDocument()
  expect(screen.queryByRole('radiogroup', { name: '지점' })).not.toBeInTheDocument()
  expect(screen.queryByRole('columnheader', { name: '지점' })).not.toBeInTheDocument()
})

test('한국 날짜로 이번 달을 정한다(UTC로는 아직 지난달)', async () => {
  vi.setSystemTime(new Date('2026-11-01T05:00:00+09:00'))
  mockList(page([]))
  renderApp(PATH, { me: staff })

  expect(await screen.findByText('2026년 11월 청구가 없어요')).toBeInTheDocument()
  expect(lastQuery()).toEqual({ targetMonth: '2026-11' })
})

test('줄마다 학생(상세 링크)·반과 횟수·청구 금액·상태·결제 수단과 청구 보기 링크를 보여 준다', async () => {
  mockList()
  await openPage()

  expect(screen.getByText('전체 2건')).toBeInTheDocument()
  const [, first, second] = screen.getAllByRole('row')
  expect(
    within(first)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['김하윤', '중1 정규 9회', '299,250원', '결제 전', '—', '청구 보기'])
  expect(
    within(second)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual([
    '이서준',
    '중2 정규 8회, 중2 문법 4회',
    '540,000원',
    '결제함',
    '포스기 카드',
    '청구 보기',
  ])
  expect(within(first).getByRole('link', { name: '김하윤' })).toHaveAttribute(
    'href',
    '/desk/students/16',
  )
  expect(within(first).getByRole('link', { name: '김하윤 2026년 10월 청구 보기' })).toHaveAttribute(
    'href',
    '/desk/billing/invoices/501',
  )
  expect(
    within(second).getByRole('link', { name: '이서준 2026년 10월 청구 보기' }),
  ).toHaveAttribute('href', '/desk/billing/invoices/502')
  expectStackLabels(screen.getByRole('table', { name: '2026년 10월 청구' }))
})

test('학생 이름이 없거나 금액을 표시할 수 없는 청구도 줄은 보인다', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockList(page([invoice({ studentName: null, totalAmount: 0.5, status: 'CANCELED' })]))
  await openPage()

  const [, row] = screen.getAllByRole('row')
  expect(
    within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(['학생 16', '중1 정규 9회', '확인 필요', '취소함', '—', '청구 보기'])
})

test('모르는 상태·결제 수단은 코드로, 비어 있는 상태와 번호 없는 청구는 그렇다고 보인다', async () => {
  mockList(
    page([
      invoice({ id: null, status: null }),
      invoice({
        id: null,
        studentId: 18,
        studentName: '박서연',
        status: 'REFUNDED' as Invoice['status'],
        payment: { ...paid.payment!, method: 'TRANSFER' as 'CASH' },
      }),
    ]),
  )
  await openPage()

  const [, first, second] = screen.getAllByRole('row')
  const cells = (row: HTMLElement) =>
    within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
  expect(cells(first)).toEqual(['김하윤', '중1 정규 9회', '299,250원', '확인 필요', '—', '—'])
  expect(cells(second)).toEqual([
    '박서연',
    '중1 정규 9회',
    '299,250원',
    'REFUNDED',
    'TRANSFER',
    '—',
  ])
})

test('관리자가 주소의 지점으로 들어오면 그 지점만 요청하고 그 칩을 고른 채로 지점 칸을 숨긴다', async () => {
  mockList()
  await openPage(`${PATH}?month=2026-10&campusId=1`, admin)

  expect(lastQuery()).toEqual({ targetMonth: '2026-10', campusId: '1' })
  await waitFor(() => expect(screen.getByRole('radio', { name: '동탄관' })).toBeChecked())
  expect(screen.queryByRole('columnheader', { name: '지점' })).not.toBeInTheDocument()
})

test('관리자가 지점 칩을 바꾸면 첫 페이지부터 보고, 받는 동안 이전 지점의 줄을 남기지 않는다', async () => {
  mockApi({
    [LIST]: ({ query }) =>
      query.get('campusId')
        ? new Promise<Response>(() => {})
        : jsonResponse(page([issued], { totalElements: 25, totalPages: 2, page: 1 })),
    [CAMPUSES]: () => jsonResponse(campuses),
  })
  const { router } = await openPage(`${PATH}?month=2026-10&page=1`, admin)
  await waitFor(() => expect(screen.getByRole('radio', { name: '동탄관' })).toBeInTheDocument())

  await userEvent.click(screen.getByRole('radio', { name: '동탄관' }))

  await waitFor(() => expect(lastQuery()).toEqual({ targetMonth: '2026-10', campusId: '1' }))
  expect(router.state.location.search).toBe('?month=2026-10&campusId=1')
  expect(await screen.findByText('청구 목록을 불러오고 있어요.')).toBeInTheDocument()
  expect(screen.queryByText('중1 정규 9회')).not.toBeInTheDocument()
})

test('받아 둔 목록을 다시 받다 실패하면 표는 두고 이전 내용일 수 있다고 알린다', async () => {
  let calls = 0
  mockApi({
    [LIST]: () =>
      ++calls === 1
        ? jsonResponse(page([issued]))
        : problemResponse(400, { detail: '요청이 올바르지 않습니다.' }),
    [CAMPUSES]: () => jsonResponse(campuses),
  })
  const { queryClient } = await openPage()

  // 상세에서 결제를 기록하면 청구 앞부분을 낡은 것으로 표시해 다시 받는다.
  await act(() => queryClient.invalidateQueries({ queryKey: ['billing', 'invoices'] }))

  expect(
    await screen.findByText(
      '최신 내용을 불러오지 못했어요. 아래 표는 이전 내용일 수 있어요. (요청이 올바르지 않습니다.)',
    ),
  ).toBeInTheDocument()
  expect(screen.getByRole('table', { name: '2026년 10월 청구' })).toBeInTheDocument()
  expect(calls).toBe(2)
})

test('앞뒤 달로 옮기면 그 달을 요청하고 주소에 남긴다. 이번 달로 돌아올 수 있다', async () => {
  mockList()
  const { router } = await openPage()

  await userEvent.click(screen.getByRole('link', { name: '이전 달' }))
  await waitFor(() => expect(lastQuery()).toEqual({ targetMonth: '2026-09' }))
  expect(router.state.location.search).toBe('?month=2026-09')
  expect(screen.getByRole('heading', { level: 2, name: '2026년 9월' })).toBeInTheDocument()

  await userEvent.click(screen.getByRole('link', { name: '이번 달로' }))
  // 받아 둔 이번 달 목록을 다시 쓴다(새로 묻지 않아도 된다).
  expect(await screen.findByRole('heading', { level: 2, name: '2026년 10월' })).toBeInTheDocument()
  expect(router.state.location.search).toBe('?month=2026-10')

  await userEvent.click(screen.getByRole('link', { name: '다음 달' }))
  await waitFor(() => expect(lastQuery()).toEqual({ targetMonth: '2026-11' }))
  expect(router.state.location.search).toBe('?month=2026-11')
})

test('해를 넘겨 옮긴다', async () => {
  mockList()
  await openPage(`${PATH}?month=2026-12`)

  await userEvent.click(screen.getByRole('link', { name: '다음 달' }))
  await waitFor(() => expect(lastQuery()).toEqual({ targetMonth: '2027-01' }))
})

test.each(['2026-13', '2026-1', 'abc'])('주소의 달이 틀리면(%s) 이번 달로 연다', async (month) => {
  mockList()
  await openPage(`${PATH}?month=${month}`)

  expect(lastQuery()).toEqual({ targetMonth: '2026-10' })
})

test('관리자는 처음에 전 지점을 보고 지점 칸이 있다. 지점을 고르면 그 지점만, 달을 옮겨도 그 지점을 본다', async () => {
  mockList()
  const { router } = await openPage(PATH, admin)

  expect(lastQuery()).toEqual({ targetMonth: '2026-10' })
  await waitFor(() =>
    expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toContain('능동관'),
  )
  expectStackLabels(screen.getByRole('table', { name: '2026년 10월 청구' }))

  await userEvent.click(screen.getByRole('radio', { name: '동탄관' }))
  await waitFor(() => expect(lastQuery()).toEqual({ targetMonth: '2026-10', campusId: '1' }))
  expect(router.state.location.search).toBe('?month=2026-10&campusId=1')
  await waitFor(() =>
    expect(screen.queryByRole('columnheader', { name: '지점' })).not.toBeInTheDocument(),
  )

  await userEvent.click(screen.getByRole('link', { name: '다음 달' }))
  await waitFor(() => expect(lastQuery()).toEqual({ targetMonth: '2026-11', campusId: '1' }))

  await userEvent.click(screen.getByRole('radio', { name: '전체' }))
  await waitFor(() => expect(lastQuery()).toEqual({ targetMonth: '2026-11' }))
})

test('직원은 주소에 지점이 있어도 보내지 않는다(다른 지점은 서버가 막는다)', async () => {
  mockList()
  await openPage(`${PATH}?month=2026-10&campusId=2`)

  expect(lastQuery()).toEqual({ targetMonth: '2026-10' })
})

test('다음 페이지를 누르면 같은 조건으로 그 페이지를 요청하고, 달을 옮기면 첫 페이지부터 본다', async () => {
  mockList(page([issued], { totalElements: 25, totalPages: 2 }))
  const { router } = await openPage()

  await userEvent.click(screen.getByRole('button', { name: '다음' }))
  await waitFor(() => expect(lastQuery()).toEqual({ targetMonth: '2026-10', page: '1' }))
  expect(router.state.location.search).toBe('?month=2026-10&page=1')

  await userEvent.click(screen.getByRole('link', { name: '이전 달' }))
  await waitFor(() => expect(lastQuery()).toEqual({ targetMonth: '2026-09' }))
})

test('페이지만 넘길 때는 받는 동안 이전 줄을 흐리게 남긴다. 달을 옮기면 비우고 새로 받는다', async () => {
  mockApi({
    [LIST]: ({ query }) =>
      query.get('page') || query.get('targetMonth') !== '2026-10'
        ? new Promise<Response>(() => {})
        : jsonResponse(page([issued], { totalElements: 21, totalPages: 2 })),
    [CAMPUSES]: () => jsonResponse(campuses),
  })
  await openPage()

  await userEvent.click(screen.getByRole('button', { name: '다음' }))
  await waitFor(() =>
    expect(screen.getByText('중1 정규 9회').closest('[aria-busy]')).toHaveAttribute(
      'aria-busy',
      'true',
    ),
  )
  expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()

  await userEvent.click(screen.getByRole('link', { name: '다음 달' }))
  expect(await screen.findByText('청구 목록을 불러오고 있어요.')).toBeInTheDocument()
  expect(screen.queryByText('중1 정규 9회')).not.toBeInTheDocument()
})

test('없는 페이지면 첫 페이지로 가는 길을 보여 준다', async () => {
  mockList(page([], { totalElements: 3, totalPages: 1, page: 5 }))
  renderApp(`${PATH}?month=2026-10&page=5`, { me: staff })

  expect(await screen.findByText('이 페이지에는 청구가 없어요')).toBeInTheDocument()
  expect(screen.getByText('2026년 10월 청구는 모두 3건이에요.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '첫 페이지로' })).toHaveAttribute(
    'href',
    '/desk/billing?month=2026-10',
  )
})

test('목록을 받지 못하면 알리고 다시 불러올 수 있다', async () => {
  let calls = 0
  mockApi({
    [LIST]: () =>
      ++calls === 1
        ? problemResponse(403, {
            code: 'AUTH_CAMPUS_NOT_ALLOWED',
            detail: '이 지점은 볼 수 없습니다.',
          })
        : jsonResponse(page([issued])),
    [CAMPUSES]: () => jsonResponse(campuses),
  })
  renderApp(PATH, { me: staff })

  expect(await screen.findByText('이 지점은 볼 수 없습니다.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

  expect(await screen.findByRole('table', { name: '2026년 10월 청구' })).toBeInTheDocument()
})

test('관리자가 지점 목록을 받지 못하면 알리고, 지점 칸은 번호로 보인다', async () => {
  mockApi({
    [LIST]: () => jsonResponse(page([paid])),
    [CAMPUSES]: () => problemResponse(400, { detail: '요청이 올바르지 않습니다.' }),
  })
  await openPage(PATH, admin)

  expect(
    await screen.findByText(
      '지점 이름을 불러오지 못했어요. 다른 지점을 고를 수 없고, 지점이 번호로 보여요.',
    ),
  ).toBeInTheDocument()
  expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toContain('지점 2')
})

test('연계 학원은 이 화면을 볼 수 없고 목록을 요청하지 않는다', async () => {
  renderApp(PATH, { me: partner })

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expectNoRequests()
})
