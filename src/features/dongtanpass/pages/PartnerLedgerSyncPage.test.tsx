import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import type { Partner } from '@/shared/partner'
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
import { expectStackLabels } from '@/test/table'
import type { PartnerLedgerSync, PartnerLedgerSyncPage, PartnerLedgerSyncRetry } from '../api'

setupMockApi()

const PATH = '/admin/ledger-sync/partners'
const LIST = 'GET /api/v1/dongtanpass/partner-ledger-sync/unsynced'
const PARTNERS = 'GET /api/v1/dongtanpass/partners'
const RETRY = 'POST /api/v1/dongtanpass/partner-ledger-sync/41/retry'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
// 줄 이름. 패스 ID를 넣어 같은 학생의 줄을 가른다.
const WHO = '김도윤(패스 12)'

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
    active: true,
    createdAt: '2026-10-13T09:00:00+09:00',
  },
]

function row(overrides: Partial<PartnerLedgerSync> = {}): PartnerLedgerSync {
  return {
    id: 41,
    passId: 12,
    partnerId: 3,
    partnerName: '햇살수학',
    kind: 'PARTNER_DISCOUNT',
    studentName: '김도윤',
    reason: 'TAB_NOT_FOUND',
    attempts: 3,
    // 한국 시각 2026.10.23 10:05
    lastAttemptAt: '2026-10-23T01:05:00Z',
    ...overrides,
  }
}

/** 별빛영어가 발급한 패스가 JEY에서 쓰인 줄 */
const other = row({
  id: 42,
  passId: 13,
  partnerId: 4,
  partnerName: '별빛영어',
  kind: 'USED_AT_JEY',
  studentName: '이서아',
  reason: 'ACCESS_DENIED',
  attempts: 1,
})

function page(
  items: PartnerLedgerSync[],
  extra: Partial<PartnerLedgerSyncPage> = {},
): PartnerLedgerSyncPage {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: 1, ...extra }
}

function mockPage(list: PartnerLedgerSyncPage = page([row()])) {
  const server = { list }
  mockApi({
    [LIST]: () => jsonResponse(server.list),
    [PARTNERS]: () => jsonResponse(partners),
  })
  return server
}

function count(prefix: string) {
  return requests().filter((request) => request.startsWith(prefix)).length
}

function lastQuery() {
  const key = requests().findLast((request) => request.startsWith(LIST))
  if (!key) throw new Error('목록 요청이 없어요')
  const query: Record<string, string> = {}
  new URLSearchParams(key.split('?')[1] ?? '').forEach((value, name) => {
    query[name] = value
  })
  return query
}

async function openPage(path = PATH) {
  const rendered = renderApp(path, { me: admin })
  await screen.findByRole('table', { name: '연계 학원 장부 미반영' })
  return rendered
}

const retryButton = (who = WHO) => screen.getByRole('button', { name: `${who} 다시 반영` })

function retried(result: Partial<PartnerLedgerSyncRetry>) {
  return () => jsonResponse({ id: 41, status: 'SYNCED', reason: null, ...result })
}

test.each([
  ['직원', staff],
  ['연계 학원', partner],
])('%s은 이 화면을 볼 수 없고 아무것도 요청하지 않는다', async (_name, me) => {
  renderApp(PATH, { me })

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expectNoRequests()
})

test('줄마다 학생과 패스·학원·구분·까닭과 할 일·시도·마지막 시도를 보여 준다', async () => {
  mockPage(page([row(), other]))
  await openPage()

  expect(lastQuery()).toEqual({})
  expect(screen.getByText('전체 2건')).toBeInTheDocument()
  const [, first, second] = screen.getAllByRole('row')
  expect(
    within(first)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual([
    '김도윤패스 12',
    '햇살수학',
    '할인해 줌',
    '탭 없음그 학원의 장부 파일에 "JEY 패스" 탭이 없어요. 그 이름으로 탭을 만들어 주세요.',
    '3번',
    '2026.10.23 10:05',
    '다시 반영',
  ])
  expect(second).toHaveTextContent('별빛영어')
  expect(second).toHaveTextContent('JEY에서 사용')
  expect(second).toHaveTextContent(
    '장부 권한 없음서비스 계정에 그 장부의 편집 권한이 없거나 키가 만료됐어요.',
  )
  expectStackLabels(screen.getByRole('table', { name: '연계 학원 장부 미반영' }))
})

test.each([
  [
    'NOT_CONFIGURED',
    '장부 연결 없음그 학원의 장부 연결이 없어요(서버 설정). 개발자에게 알려 주세요.',
  ],
  [
    'HEADER_MISMATCH',
    '머리글 다름"JEY 패스" 탭의 1행 머리글을 이대로 맞춰 주세요: 구분, 사용일, 학생, 패스 번호, 원래 수강료, 할인율, 할인액, 받을 금액, JEY 지점, 앱 표시',
  ],
  ['GOOGLE_UNAVAILABLE', '구글 장애구글 장애가 오래 이어졌어요. 잠시 뒤 다시 반영해 주세요.'],
  ['GOOGLE_REJECTED', '구글이 거부개발자 확인이 필요해요.'],
  ['APP_ERROR', '앱 오류개발자 확인이 필요해요.'],
  ['NEW_REASON', 'NEW_REASON개발자 확인이 필요해요.'],
  // 객체의 기본 속성 이름과 겹쳐도 아는 까닭으로 치지 않는다.
  ['constructor', 'constructor개발자 확인이 필요해요.'],
])('까닭 %s의 이름과 할 일을 보여 준다', async (reason, text) => {
  mockPage(page([row({ reason: reason as PartnerLedgerSync['reason'] })]))
  await openPage()

  expect(screen.getAllByRole('row')[1]).toHaveTextContent(text)
})

test('모르는 구분은 값 그대로 보인다', async () => {
  mockPage(page([row({ kind: 'NEW_KIND' as PartnerLedgerSync['kind'] })]))
  await openPage()

  expect(within(screen.getAllByRole('row')[1]).getAllByRole('cell')[2]).toHaveTextContent(
    'NEW_KIND',
  )
})

test('학생 이름이 없는 줄은 그렇게 보이고, 학원 이름이 없으면 학원 목록의 이름을 쓴다', async () => {
  mockPage(page([row({ studentName: null, partnerName: null })]))
  await openPage()

  const [, line] = screen.getAllByRole('row')
  expect(line).toHaveTextContent('학생 이름 없음패스 12')
  await waitFor(() => expect(within(line).getAllByRole('cell')[1]).toHaveTextContent('햇살수학'))
  expect(
    screen.getByRole('button', { name: '학생 이름 없음(패스 12) 다시 반영' }),
  ).toBeInTheDocument()
})

test('학원을 고르면 그 학원만 요청하고 학원 칸을 숨기며, 전체를 고르면 되돌린다', async () => {
  mockPage(page([row(), other]))
  const { router } = await openPage()

  await userEvent.click(screen.getByRole('radio', { name: '별빛영어' }))

  await waitFor(() => expect(lastQuery()).toEqual({ partnerId: '4' }))
  expect(router.state.location.search).toBe('?partnerId=4')
  await waitFor(() =>
    expect(screen.queryByRole('columnheader', { name: '연계 학원' })).not.toBeInTheDocument(),
  )

  await userEvent.click(screen.getByRole('radio', { name: '전체' }))

  // 처음 받은 전 학원 목록을 다시 쓴다(새로 받을 수도 있다). 조건이 주소에서 빠지고 학원 칸이 돌아온다.
  expect(router.state.location.search).toBe('')
  expect(await screen.findByRole('columnheader', { name: '연계 학원' })).toBeInTheDocument()
  expect(screen.getByText('별빛영어', { selector: 'td' })).toBeInTheDocument()
})

test('주소로 연 학원과 페이지를 요청하고, 다른 페이지에서 학원을 바꾸면 첫 페이지부터 본다', async () => {
  mockPage(page([row()], { totalElements: 25, totalPages: 2, page: 1 }))
  const { router } = await openPage(`${PATH}?partnerId=3&page=1`)
  expect(lastQuery()).toEqual({ partnerId: '3', page: '1' })

  await userEvent.click(screen.getByRole('radio', { name: '별빛영어' }))

  await waitFor(() => expect(lastQuery()).toEqual({ partnerId: '4' }))
  expect(router.state.location.search).toBe('?partnerId=4')
})

test('주소의 학원 번호가 1 이상의 정수가 아니면 전 학원을 본다', async () => {
  mockPage()
  await openPage(`${PATH}?partnerId=1.5`)

  expect(lastQuery()).toEqual({})
  expect(screen.getByRole('radio', { name: '전체' })).toBeChecked()
})

test('다시 반영하면 본문 없이 멱등 키와 함께 보내고, 줄이 빠지면 결과를 위에 남긴다', async () => {
  const server = mockPage()
  mockApi({
    [RETRY]: () => {
      server.list = page([])
      return jsonResponse({ id: 41, status: 'SYNCED', reason: null })
    },
  })
  await openPage()
  const before = count(LIST)

  await userEvent.click(retryButton())

  expect(await screen.findByText(`${WHO}: 장부에 썼어요.`)).toBeInTheDocument()
  expect(requestOf(RETRY).body).toBeUndefined()
  expect(requestOf(RETRY).headers.get('Idempotency-Key')).toMatch(UUID)
  await waitFor(() => expect(count(LIST)).toBe(before + 1))
  expect(await screen.findByText('연계 학원 장부에 쓰지 못한 기록이 없어요')).toBeInTheDocument()
  expect(screen.getByText(`${WHO}: 장부에 썼어요.`)).toBeInTheDocument()
})

test('답을 받지 못한 뒤 다시 누르면 새 키로 보낸다(같은 키면 서버가 옛 결과를 돌려준다)', async () => {
  mockPage()
  let fail = true
  mockApi({ [RETRY]: () => (fail ? unreadableResponse('req-lost') : retried({})()) })
  await openPage()

  await userEvent.click(retryButton())
  expect(await screen.findByText(/반영됐을 수도 있어요/)).toBeInTheDocument()
  const firstKey = requestOf(RETRY).headers.get('Idempotency-Key')
  fail = false
  await userEvent.click(retryButton())

  expect(await screen.findByText(`${WHO}: 장부에 썼어요.`)).toBeInTheDocument()
  expect(count(RETRY)).toBe(2)
  expect(requestOf(RETRY).headers.get('Idempotency-Key')).toMatch(UUID)
  expect(requestOf(RETRY).headers.get('Idempotency-Key')).not.toBe(firstKey)
})

test('학원 이름은 목록 응답의 것을 먼저 쓴다', async () => {
  mockPage(page([row({ partnerName: '햇살수학 동탄점' })]))
  await openPage()
  await screen.findByRole('radio', { name: '햇살수학' })

  expect(within(screen.getAllByRole('row')[1]).getAllByRole('cell')[1]).toHaveTextContent(
    '햇살수학 동탄점',
  )
})

test.each([
  [
    { status: 'PENDING' as const },
    `${WHO}: 아직 장부에 쓰지 않았어요. 서버가 잠시 뒤 다시 해요. 끝내 못 쓰면 이 목록에 다시 나와요.`,
  ],
  [{ status: 'IN_PROGRESS' as const }, `${WHO}: 다른 쪽이 반영하고 있어요. 목록을 다시 받아요.`],
  [
    { status: 'UNSYNCED' as const, reason: 'ACCESS_DENIED' as const },
    `${WHO}: 또 쓰지 못했어요. 서비스 계정에 그 장부의 편집 권한이 없거나 키가 만료됐어요.`,
  ],
  [
    { status: 'UNSYNCED' as const, reason: null },
    `${WHO}: 또 쓰지 못했어요. 개발자 확인이 필요해요.`,
  ],
  [
    { status: 'SKIPPED' as PartnerLedgerSyncRetry['status'] },
    `${WHO}: 알 수 없는 결과예요(SKIPPED). 목록을 확인하고 개발자에게 알려 주세요.`,
  ],
])('다시 반영의 결과 %o를 알린다', async (result, text) => {
  mockPage()
  mockApi({ [RETRY]: retried(result) })
  await openPage()

  await userEvent.click(retryButton())

  expect(await screen.findByText(text)).toBeInTheDocument()
})

test.each([
  [
    409,
    'DONGTANPASS_PARTNER_LEDGER_SYNC_NOT_RETRYABLE',
    `${WHO}: 이미 반영됐거나 서버가 다시 하는 중이에요. 목록을 다시 받아요.`,
  ],
  [
    404,
    'DONGTANPASS_PARTNER_LEDGER_SYNC_NOT_FOUND',
    `${WHO}: 반영 기록을 찾지 못했어요. 목록을 다시 받아요.`,
  ],
])('다시 반영이 %s(%s)이면 알리고 목록을 다시 받는다', async (status, code, text) => {
  mockPage()
  mockApi({ [RETRY]: () => problemResponse(status, { code, detail: '거부' }) })
  await openPage()
  const before = count(LIST)

  await userEvent.click(retryButton())

  expect(await screen.findByText(text)).toBeInTheDocument()
  await waitFor(() => expect(count(LIST)).toBe(before + 1))
})

test('학원을 바꾸면 지난 결과를 지운다', async () => {
  const server = mockPage()
  mockApi({
    [RETRY]: () => {
      server.list = page([])
      return jsonResponse({ id: 41, status: 'SYNCED', reason: null })
    },
  })
  await openPage()
  await userEvent.click(retryButton())
  await screen.findByText(`${WHO}: 장부에 썼어요.`)

  await userEvent.click(screen.getByRole('radio', { name: '별빛영어' }))

  await waitFor(() => expect(screen.queryByText(`${WHO}: 장부에 썼어요.`)).not.toBeInTheDocument())
})

test('다시 받기에 실패하면 표를 흐리게 남기고 이전 내용이라고 알린다', async () => {
  const server = mockPage()
  let fail = false
  mockApi({
    [LIST]: () =>
      fail
        ? problemResponse(400, { detail: '요청이 올바르지 않습니다.' })
        : jsonResponse(server.list),
  })
  const { queryClient } = await openPage()
  expect(screen.getByText('전체 1건')).toBeInTheDocument()

  fail = true
  await act(() =>
    queryClient.invalidateQueries({ queryKey: ['dongtanpass', 'partner-ledger-sync'] }),
  )

  expect(
    await screen.findByText(
      '최신 목록을 불러오지 못했어요. 아래 내용은 이전 것일 수 있어요. 요청이 올바르지 않습니다.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByText('전체 1건 · 이전 내용')).toBeInTheDocument()
  const table = screen.getByRole('table', { name: '연계 학원 장부 미반영' })
  expect(table.closest('.opacity-60')).not.toBeNull()
})

test('미반영이 없으면 그렇게 알리고, 다시 받기에 실패하면 단정하지 않는다', async () => {
  mockPage(page([]))
  let fail = false
  mockApi({
    [LIST]: () =>
      fail ? problemResponse(400, { detail: '요청이 올바르지 않습니다.' }) : jsonResponse(page([])),
  })
  const { queryClient } = renderApp(PATH, { me: admin })
  expect(await screen.findByText('연계 학원 장부에 쓰지 못한 기록이 없어요')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()

  fail = true
  await act(() =>
    queryClient.invalidateQueries({ queryKey: ['dongtanpass', 'partner-ledger-sync'] }),
  )

  await screen.findByText(/최신 목록을 불러오지 못했어요/)
  expect(screen.queryByText('연계 학원 장부에 쓰지 못한 기록이 없어요')).not.toBeInTheDocument()
})

test('없는 페이지로 들어오면 첫 페이지로 가는 길을 둔다', async () => {
  mockPage(page([], { totalElements: 3, page: 4 }))
  renderApp(`${PATH}?partnerId=3&page=4`, { me: admin })

  expect(await screen.findByText('이 페이지에는 미반영이 없어요')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '첫 페이지로' })).toHaveAttribute(
    'href',
    `${PATH}?partnerId=3`,
  )
})

test('목록을 불러오지 못하면 까닭을 알리고 다시 불러올 수 있다', async () => {
  mockPage()
  let fail = true
  mockApi({
    [LIST]: () =>
      fail
        ? problemResponse(400, { detail: '요청이 올바르지 않습니다.' })
        : jsonResponse(page([row()])),
  })
  renderApp(PATH, { me: admin })

  expect(
    await screen.findByText(
      '연계 학원 장부 미반영 목록을 불러오지 못했어요. 요청이 올바르지 않습니다.',
    ),
  ).toBeInTheDocument()
  fail = false
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

  expect(await screen.findByRole('table', { name: '연계 학원 장부 미반영' })).toBeInTheDocument()
})

test('학원 목록을 받지 못하면 알리고 다시 받을 수 있다', async () => {
  mockPage()
  let fail = true
  mockApi({
    [PARTNERS]: () => (fail ? problemResponse(400, { detail: '거부' }) : jsonResponse(partners)),
  })
  await openPage()

  expect(
    await screen.findByText(
      '학원 이름을 불러오지 못했어요. 다른 학원을 고를 수 없고, 학원이 번호로 보여요.',
      {},
      { timeout: 5000 },
    ),
  ).toBeInTheDocument()
  fail = false
  await userEvent.click(screen.getByRole('button', { name: '학원 다시 불러오기' }))

  expect(await screen.findByRole('radio', { name: '별빛영어' })).toBeInTheDocument()
})

test('장부 하위 메뉴로 수납 장부와 연계 학원 장부를 오간다', async () => {
  mockPage()
  mockApi({
    'GET /api/v1/billing/ledger-sync/unsynced': () =>
      jsonResponse({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
    'GET /api/v1/campuses': () => jsonResponse([]),
  })
  const { router } = await openPage()
  const menu = screen.getByRole('navigation', { name: '장부 메뉴' })
  expect(within(menu).getByRole('link', { name: '연계 학원' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(within(menu).getByRole('link', { name: '수납' })).not.toHaveAttribute('aria-current')

  await userEvent.click(within(menu).getByRole('link', { name: '수납' }))

  expect(router.state.location.pathname).toBe('/admin/ledger-sync')
  expect(await screen.findByRole('heading', { level: 1, name: '장부 미반영' })).toBeInTheDocument()
  expect(within(menu).getByRole('link', { name: '수납' })).toHaveAttribute('aria-current', 'page')
  // 위의 "장부" 탭은 두 화면에서 모두 골라져 있다.
  expect(
    within(screen.getByRole('navigation', { name: '직원 메뉴' })).getByRole('link', {
      name: '장부',
    }),
  ).toHaveAttribute('aria-current', 'page')
})
