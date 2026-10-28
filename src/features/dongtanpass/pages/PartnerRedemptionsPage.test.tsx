import { act, screen, waitFor, within } from '@testing-library/react'
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

  const table = await screen.findByRole('table', { name: '제이G패스 사용 내역' })
  expect(lastQuery()).toEqual({ from: thisMonth.from, to: thisMonth.to })
  expect(screen.getByRole('heading', { level: 1, name: '제이G패스 사용 내역' })).toBeInTheDocument()
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

test('관리자는 제이G패스 메뉴에서 모든 학원의 내역을 보고, 학원을 고르면 그 학원만 받는다', async () => {
  mockApi({
    [LIST]: () => jsonResponse(page([item({})])),
    [PARTNERS]: () => jsonResponse(partners),
  })
  renderApp(ADMIN_PATH, { me: admin })

  const table = await screen.findByRole('table', { name: '연계 학원 사용 내역' })
  expect(screen.getByRole('heading', { level: 1, name: '연계 학원 사용 내역' })).toBeInTheDocument()
  expect(screen.getByText(/JEY 지점 데스크의 사용 내역과 따로예요/)).toBeInTheDocument()
  expect(
    within(screen.getByRole('navigation', { name: '제이G패스 메뉴' })).getByRole('link', {
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

  const tabs = await screen.findByRole('navigation', { name: '제이G패스 메뉴' })
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

test.each([
  ['DONGTANPASS_INVALID_PERIOD', '기간이 맞지 않아요. 기간 칸을 고친 뒤 조회해 주세요.'],
  ['DONGTANPASS_PERIOD_TOO_LONG', '기간은 1년까지 볼 수 있어요. 기간 칸을 고친 뒤 조회해 주세요.'],
])(
  '서버가 기간이 틀렸다고 하면(%s) 다시 불러오기 대신 기간 칸을 고치게 한다',
  async (code, message) => {
    mockApi({ [LIST]: () => problemResponse(400, { code, detail: '기간 오류' }) })
    renderApp(`${PARTNER_PATH}?from=2026-10-20&to=2026-10-01`, { me: partner })

    expect(await screen.findByText(message)).toBeInTheDocument()
    // 다시 불러와도 같은 답이다.
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).not.toBeInTheDocument()
  },
)

test('페이지를 넘기면 그 페이지를 받아 보여 준다', async () => {
  mockApi({
    [LIST]: ({ query }) => {
      const at = Number(query.get('page') ?? 0)
      return jsonResponse(
        page([item({ id: at + 1, studentName: at === 0 ? '첫쪽학생' : '둘째쪽학생' })], {
          page: at,
          totalElements: 25,
          totalPages: 2,
        }),
      )
    },
  })
  renderApp(PARTNER_PATH, { me: partner })
  await screen.findByText('첫쪽학생')

  await userEvent.click(screen.getByRole('button', { name: '다음' }))

  expect(await screen.findByText('둘째쪽학생')).toBeInTheDocument()
  expect(lastQuery()).toEqual({ from: thisMonth.from, to: thisMonth.to, page: '1' })
})

test('이번 달로를 누르면 주소와 기간 칸이 이번 달로 돌아가, 다음 조회에 옛 기간이 걸리지 않는다', async () => {
  mockApi({ [LIST]: () => jsonResponse(page([item({})])) })
  const { router } = renderApp(`${PARTNER_PATH}?from=2026-01-01&to=2026-01-31`, { me: partner })
  await screen.findByRole('table', { name: '제이G패스 사용 내역' })
  expect(screen.getByLabelText('사용일 시작')).toHaveValue('2026-01-01')

  await userEvent.click(screen.getByRole('link', { name: '이번 달로' }))

  await waitFor(() => expect(router.state.location.search).toBe(''))
  expect(screen.getByLabelText('사용일 시작')).toHaveValue(thisMonth.from)
  expect(screen.getByLabelText('사용일 끝')).toHaveValue(thisMonth.to)
  await userEvent.click(screen.getByRole('button', { name: '조회' }))
  await waitFor(() => expect(lastQuery()).toEqual({ from: thisMonth.from, to: thisMonth.to }))
})

test('같은 조건으로 조회를 누르면 주소는 그대로 두고 새로 받는다', async () => {
  mockApi({ [LIST]: () => jsonResponse(page([item({})])) })
  const { router } = renderApp(PARTNER_PATH, { me: partner })
  await screen.findByRole('table', { name: '제이G패스 사용 내역' })

  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  await waitFor(() => expect(count(LIST)).toBe(2))
  expect(router.state.location.search).toBe('')
})

test('내역을 받지 못하면 알리고 다시 불러올 수 있다', async () => {
  let fail = true
  mockApi({ [LIST]: () => (fail ? unreadableResponse() : jsonResponse(page([item({})]))) })
  renderApp(PARTNER_PATH, { me: partner })

  expect(await screen.findByRole('button', { name: '다시 불러오기' })).toBeInTheDocument()
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  fail = false
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

  expect(await screen.findByRole('table', { name: '제이G패스 사용 내역' })).toBeInTheDocument()
})

test('꺼진 학원의 계정이면 화면 대신 서버의 안내만 보여 준다', async () => {
  mockApi({
    [LIST]: () =>
      problemResponse(403, {
        code: 'DONGTANPASS_PARTNER_INACTIVE',
        detail: '이용이 중지된 학원입니다.',
      }),
  })
  renderApp(PARTNER_PATH, { me: partner })

  expect(await screen.findByText('이용이 중지된 학원입니다.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '다시 불러오기' })).not.toBeInTheDocument()
  expect(screen.queryByRole('search')).not.toBeInTheDocument()
})

/** 직접 풀 수 있는 응답 */
function hold() {
  let respond!: (response: Response) => void
  const response = new Promise<Response>((resolve) => (respond = resolve))
  return { response, respond }
}

test('학원을 바꾸면 새 결과가 올 때까지 이전 학원의 줄을 보여 주지 않는다', async () => {
  const next = hold()
  mockApi({
    [LIST]: ({ query }) =>
      query.get('partnerId') ? next.response : jsonResponse(page([item({})])),
    [PARTNERS]: () => jsonResponse(partners),
  })
  renderApp(ADMIN_PATH, { me: admin })
  await screen.findByRole('table', { name: '연계 학원 사용 내역' })

  await userEvent.click(await screen.findByRole('radio', { name: '별빛영어' }))

  expect(await screen.findByText('사용 내역을 불러오고 있어요.')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  next.respond(jsonResponse(page([item({ id: 9, partnerId: 4, studentName: '별빛학생' })])))
  expect(await screen.findByText('별빛학생')).toBeInTheDocument()
})

test('학원을 고른 채 기간만 바꿔 조회해도 그 학원을 본다. 전체를 누르면 학원 조건을 뺀다', async () => {
  mockApi({
    [LIST]: () => jsonResponse(page([item({})])),
    [PARTNERS]: () => jsonResponse(partners),
  })
  renderApp(`${ADMIN_PATH}?partnerId=3`, { me: admin })
  await screen.findByRole('table', { name: '연계 학원 사용 내역' })

  const from = screen.getByLabelText('사용일 시작')
  await userEvent.clear(from)
  await userEvent.type(from, `${thisMonth.to.slice(0, 8)}02`)
  await userEvent.click(screen.getByRole('button', { name: '조회' }))
  await waitFor(() =>
    expect(lastQuery()).toEqual({
      from: `${thisMonth.to.slice(0, 8)}02`,
      to: thisMonth.to,
      partnerId: '3',
    }),
  )

  await userEvent.click(await screen.findByRole('radio', { name: '전체' }))
  await waitFor(() => expect(lastQuery().partnerId).toBeUndefined())
})

test('학원 칩은 기간 칸에 넣다 만 값도 함께 적용하고, 기간이 틀리면 칩을 눌러도 바뀌지 않는다', async () => {
  mockApi({
    [LIST]: () => jsonResponse(page([item({})])),
    [PARTNERS]: () => jsonResponse(partners),
  })
  renderApp(`${ADMIN_PATH}?from=2026-01-01&to=2026-01-31`, { me: admin })
  await screen.findByRole('table', { name: '연계 학원 사용 내역' })

  const from = screen.getByLabelText('사용일 시작')
  await userEvent.clear(from)
  await userEvent.type(from, '2026-01-05')
  await userEvent.click(await screen.findByRole('radio', { name: '햇살수학' }))
  await waitFor(() =>
    expect(lastQuery()).toEqual({ from: '2026-01-05', to: '2026-01-31', partnerId: '3' }),
  )

  const before = count(LIST)
  await userEvent.clear(from)
  await userEvent.type(from, '2026-02-15')
  await userEvent.click(screen.getByRole('radio', { name: '별빛영어' }))
  expect(await screen.findByText(/시작일/)).toBeInTheDocument()
  expect(count(LIST)).toBe(before)
  expect(screen.getByRole('radio', { name: '햇살수학' })).toBeChecked()
})

test.each([
  ['0', undefined],
  ['abc', undefined],
])('관리자 주소의 학원 ID가 %s이면 학원 조건 없이 받는다', async (raw) => {
  mockApi({
    [LIST]: () => jsonResponse(page([])),
    [PARTNERS]: () => jsonResponse(partners),
  })
  renderApp(`${ADMIN_PATH}?partnerId=${raw}`, { me: admin })
  await screen.findByRole('heading', { name: '이 기간에 사용한 패스가 없어요' })

  expect(lastQuery().partnerId).toBeUndefined()
})

test('관리자 주소의 학원이 목록에 없어도 번호로 칩을 두고 그 학원으로 받는다', async () => {
  mockApi({
    [LIST]: () => jsonResponse(page([])),
    [PARTNERS]: () => jsonResponse(partners),
  })
  renderApp(`${ADMIN_PATH}?partnerId=99`, { me: admin })

  expect(await screen.findByRole('radio', { name: '학원 99' })).toBeChecked()
  await waitFor(() => expect(lastQuery().partnerId).toBe('99'))
})

test('받아 둔 학원 목록이 있으면 다시 받다 실패해도 칩을 그대로 쓰고 안내하지 않는다', async () => {
  let fail = false
  mockApi({
    [LIST]: () => jsonResponse(page([item({})])),
    [PARTNERS]: () => (fail ? unreadableResponse() : jsonResponse(partners)),
  })
  const { queryClient } = renderApp(ADMIN_PATH, { me: admin })
  await screen.findByRole('radio', { name: '햇살수학' })

  fail = true
  await queryClient.refetchQueries({ queryKey: ['partner', 'partners'] })
  expect(queryClient.getQueryState(['partner', 'partners'])?.error).toBeTruthy()
  // 실패가 화면에 그려질 때까지 한 박자 기다린다(쿼리의 알림은 다음 차례에 간다).
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

  expect(screen.getByRole('radio', { name: '햇살수학' })).toBeInTheDocument()
  expect(screen.queryByText(/학원 목록을 불러오지 못했어요/)).not.toBeInTheDocument()
})

test('학원 목록을 받지 못해도 전체 내역은 보이고, 학원 목록을 다시 받을 수 있다', async () => {
  let fail = true
  mockApi({
    [LIST]: () => jsonResponse(page([item({})])),
    [PARTNERS]: () => (fail ? unreadableResponse() : jsonResponse(partners)),
  })
  renderApp(ADMIN_PATH, { me: admin })

  expect(await screen.findByText(/학원 목록을 불러오지 못했어요/)).toBeInTheDocument()
  expect(screen.getByRole('table', { name: '연계 학원 사용 내역' })).toBeInTheDocument()
  fail = false
  await userEvent.click(screen.getByRole('button', { name: '학원 다시 불러오기' }))
  expect(await screen.findByRole('radio', { name: '햇살수학' })).toBeInTheDocument()
})
