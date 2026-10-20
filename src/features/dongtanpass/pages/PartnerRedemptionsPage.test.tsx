import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { todayInSeoul } from '@/shared/lib'
import type { Partner } from '@/shared/partner'
import {
  expectNoRequests,
  jsonResponse,
  mockApi,
  problemResponse,
  requests,
  setupMockApi,
  unreadableResponse,
} from '@/test/mockApi'
import { admin, partner, renderApp, staff } from '@/test/renderApp'
import { setupDialog } from '@/test/dialog'
import { defaultRedemptionPeriod } from '../redemptionPeriod'
import type { PartnerRedemption, PartnerRedemptionPage } from '../api'

setupMockApi()
setupDialog()

const PARTNER_PATH = '/partner/redemptions'
const ADMIN_PATH = '/admin/passes/redemptions'
const LIST = 'GET /api/v1/dongtanpass/partner-redemptions'
const PARTNERS = 'GET /api/v1/dongtanpass/partners'

function item(overrides: Partial<PartnerRedemption>): PartnerRedemption {
  return {
    id: 1,
    redeemedAt: '2026-10-20T11:22:00Z',
    redeemedOn: '2026-10-20',
    partnerId: 3,
    partnerName: '햇살수학',
    passId: 41,
    passNo: 'DT-E4Y3AM',
    studentName: '김도윤',
    originalFee: 283333,
    discountRate: 0.05,
    discountAmount: 14167,
    payableAmount: 269166,
    ...overrides,
  }
}

function page(items: PartnerRedemption[], overrides: Partial<PartnerRedemptionPage> = {}) {
  return {
    items,
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages: items.length > 0 ? 1 : 0,
    ...overrides,
  }
}

const partners: Partner[] = [
  {
    id: 3,
    name: '햇살수학',
    type: 'ACADEMY',
    active: true,
    createdAt: '2026-10-12T09:00:00+09:00',
  },
  {
    id: 4,
    name: '별빛영어',
    type: 'ACADEMY',
    active: false,
    createdAt: '2026-10-13T09:00:00+09:00',
  },
]

function lastQuery() {
  const key = requests().findLast((request) => request.startsWith(LIST))
  if (!key) throw new Error('사용 내역 요청이 없어요')
  const query: Record<string, string> = {}
  new URLSearchParams(key.split('?')[1] ?? '').forEach((value, name) => {
    query[name] = value
  })
  return query
}

function count(key: string) {
  return requests().filter((request) => request.split('?')[0] === key).length
}

const thisMonth = defaultRedemptionPeriod(todayInSeoul())

test.each([
  ['직원', staff, PARTNER_PATH],
  ['직원', staff, ADMIN_PATH],
  ['연계 학원', partner, ADMIN_PATH],
  ['관리자', admin, PARTNER_PATH],
])('%s은 %s를 볼 수 없고 아무것도 요청하지 않는다', async (_name, me, path) => {
  renderApp(path, { me })

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expectNoRequests()
})

test('연계 학원은 이번 달의 자기 학원 내역을 금액과 함께 보고, 학원 칸과 학원 고르기는 없다', async () => {
  mockApi({ [LIST]: () => jsonResponse(page([item({})])) })
  // 주소에 학원이 있어도 보내지 않는다(다른 학원은 403이다).
  renderApp(`${PARTNER_PATH}?partnerId=4`, { me: partner })

  const table = await screen.findByRole('table', { name: 'JEY 패스 사용 내역' })
  expect(lastQuery()).toEqual({ from: thisMonth.from, to: thisMonth.to })
  expect(screen.getByRole('heading', { level: 1, name: 'JEY 패스 사용 내역' })).toBeInTheDocument()
  const row = within(table).getAllByRole('row')[1]
  expect(row).toHaveTextContent('김도윤')
  expect(row).toHaveTextContent('DT-E4Y3AM')
  expect(row).toHaveTextContent('283,333원')
  expect(row).toHaveTextContent('5% · 14,167원')
  expect(row).toHaveTextContent('269,166원')
  expect(within(table).queryByRole('columnheader', { name: '연계 학원' })).not.toBeInTheDocument()
  expect(screen.queryByRole('radiogroup', { name: '연계 학원' })).not.toBeInTheDocument()
  expect(
    within(screen.getByRole('navigation', { name: '직원 메뉴' })).getByRole('link', {
      name: '사용 내역',
    }),
  ).toHaveAttribute('aria-current', 'page')
})

test('관리자는 JEY 패스 메뉴에서 모든 학원의 내역을 보고, 학원을 고르면 그 학원만 받는다', async () => {
  mockApi({
    [LIST]: () => jsonResponse(page([item({})])),
    [PARTNERS]: () => jsonResponse(partners),
  })
  renderApp(ADMIN_PATH, { me: admin })

  const table = await screen.findByRole('table', { name: 'JEY 패스 사용 내역' })
  expect(screen.getByRole('heading', { level: 1, name: '연계 학원 사용 내역' })).toBeInTheDocument()
  expect(screen.getByText(/JEY 지점 데스크의 사용 내역과 따로예요/)).toBeInTheDocument()
  expect(
    within(screen.getByRole('navigation', { name: 'JEY 패스 메뉴' })).getByRole('link', {
      name: '연계 학원 사용 내역',
    }),
  ).toHaveAttribute('aria-current', 'page')
  expect(within(table).getAllByRole('row')[1]).toHaveTextContent('햇살수학')
  expect(lastQuery()).toEqual({ from: thisMonth.from, to: thisMonth.to })

  // 꺼진 학원도 고를 수 있다(꺼지기 전의 내역이 있다).
  await userEvent.click(await screen.findByRole('radio', { name: '별빛영어' }))

  await waitFor(() =>
    expect(lastQuery()).toEqual({ from: thisMonth.from, to: thisMonth.to, partnerId: '4' }),
  )
  await waitFor(() =>
    expect(screen.queryByRole('columnheader', { name: '연계 학원' })).not.toBeInTheDocument(),
  )
})

test('관리자의 발급 목록에서 사용 내역으로 오갈 수 있다', async () => {
  mockApi({
    'GET /api/v1/dongtanpass/campus-passes': () => jsonResponse(page([])),
    [LIST]: () => jsonResponse(page([])),
    [PARTNERS]: () => jsonResponse(partners),
  })
  renderApp('/admin/passes', { me: admin })

  const tabs = await screen.findByRole('navigation', { name: 'JEY 패스 메뉴' })
  expect(within(tabs).getByRole('link', { name: '발급 목록' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await userEvent.click(within(tabs).getByRole('link', { name: '연계 학원 사용 내역' }))

  expect(
    await screen.findByRole('heading', { level: 1, name: '연계 학원 사용 내역' }),
  ).toBeInTheDocument()
})

test('기간이 1년을 넘으면 칸에 알리고 요청을 보내지 않는다', async () => {
  mockApi({ [LIST]: () => jsonResponse(page([])) })
  renderApp(`${PARTNER_PATH}?from=2026-01-01&to=2026-01-31`, { me: partner })
  await screen.findByRole('heading', { name: '이 기간에 사용한 패스가 없어요' })

  const to = screen.getByLabelText('사용일 끝')
  await userEvent.clear(to)
  await userEvent.type(to, '2027-01-02')
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  expect(await screen.findByText('기간은 1년까지 볼 수 있어요.')).toBeInTheDocument()
  expect(count(LIST)).toBe(1)
})

test('서버가 기간이 틀렸다고 하면 고칠 곳을 알린다', async () => {
  mockApi({
    [LIST]: () => problemResponse(400, { code: 'DONGTANPASS_INVALID_PERIOD', detail: '기간 오류' }),
  })
  renderApp(`${PARTNER_PATH}?from=2026-10-20&to=2026-10-01`, { me: partner })

  expect(
    await screen.findByText('기간이 맞지 않아요. 시작일과 끝일을 고쳐 주세요.'),
  ).toBeInTheDocument()
})

test('페이지를 넘기면 그 페이지를 받고, 이번 달로 돌아갈 수 있다', async () => {
  mockApi({
    [LIST]: ({ query }) =>
      jsonResponse(
        page([item({ id: Number(query.get('page') ?? 0) + 1 })], {
          page: Number(query.get('page') ?? 0),
          totalElements: 25,
          totalPages: 2,
        }),
      ),
  })
  const { router } = renderApp(PARTNER_PATH, { me: partner })
  await screen.findByRole('table', { name: 'JEY 패스 사용 내역' })

  await userEvent.click(screen.getByRole('button', { name: '다음' }))

  await waitFor(() => expect(lastQuery().page).toBe('1'))
  await userEvent.click(screen.getByRole('link', { name: '이번 달로' }))
  // 첫 페이지는 받아 둔 것이라 다시 묻지 않는다. 주소가 조건 없이 돌아왔는지 본다.
  await waitFor(() => expect(router.state.location.search).toBe(''))
  expect(screen.queryByRole('link', { name: '이번 달로' })).not.toBeInTheDocument()
})

test('학원 목록을 받지 못해도 전체 내역은 보이고, 학원 목록을 다시 받을 수 있다', async () => {
  let fail = true
  mockApi({
    [LIST]: () => jsonResponse(page([item({})])),
    [PARTNERS]: () => (fail ? unreadableResponse() : jsonResponse(partners)),
  })
  renderApp(ADMIN_PATH, { me: admin })

  expect(await screen.findByText(/학원 목록을 불러오지 못했어요/)).toBeInTheDocument()
  expect(screen.getByRole('table', { name: 'JEY 패스 사용 내역' })).toBeInTheDocument()
  fail = false
  await userEvent.click(screen.getByRole('button', { name: '학원 다시 불러오기' }))
  expect(await screen.findByRole('radio', { name: '햇살수학' })).toBeInTheDocument()
})
