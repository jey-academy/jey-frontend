import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import type { Campus } from '@/shared/campus'
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
import { admin, renderApp, staff } from '@/test/renderApp'
import { expectStackLabels } from '@/test/table'
import type { BillingStudent, LedgerSync, LedgerSyncPage, LedgerSyncRetry } from '../api'

setupMockApi()

const PATH = '/admin/ledger-sync'
const LIST = 'GET /api/v1/billing/ledger-sync/unsynced'
const CAMPUSES = 'GET /api/v1/campuses'
const RETRY = 'POST /api/v1/billing/ledger-sync/31/retry'
const RETRY_32 = 'POST /api/v1/billing/ledger-sync/32/retry'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
// 줄 이름. 결제 번호까지 넣어 같은 학생·같은 달 줄을 가른다.
const WHO = '김하윤 2026-11(결제 7)'
const WHO_32 = '박서준 2026-11(결제 8)'

const campuses: Campus[] = [
  { id: 1, name: '동탄관' },
  { id: 2, name: '능동관' },
]

function row(overrides: Partial<LedgerSync> = {}): LedgerSync {
  return {
    id: 31,
    paymentId: 7,
    studentId: 16,
    campusId: 1,
    targetMonth: '2026-11',
    reason: 'TAB_NOT_FOUND',
    attempts: 2,
    // 한국 시각 2026.10.22 09:15
    lastAttemptAt: '2026-10-22T00:15:00Z',
    ...overrides,
  }
}

/** 능동관 학생 박서준의 줄 */
const other = row({
  id: 32,
  paymentId: 8,
  studentId: 17,
  campusId: 2,
  reason: 'NO_EMPTY_ROW',
  attempts: 1,
})

function page(items: LedgerSync[], extra: Partial<LedgerSyncPage> = {}): LedgerSyncPage {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: 1, ...extra }
}

const student = (id: number, name: string) => ({ id, name, campusId: 1 }) as BillingStudent

function mockPage(list: LedgerSyncPage = page([row()])) {
  const server = { list }
  mockApi({
    [LIST]: () => jsonResponse(server.list),
    [CAMPUSES]: () => jsonResponse(campuses),
    'GET /api/v1/students/16': () => jsonResponse(student(16, '김하윤')),
    'GET /api/v1/students/17': () => jsonResponse(student(17, '박서준')),
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

/** 그 요청들의 Idempotency-Key를 나간 차례대로 */
function keysOf(key: string) {
  return requests()
    .map((request, index) => [request, index] as const)
    .filter(([request]) => request === key)
    .map(([, index]) => index)
}

async function openPage(path = PATH) {
  const rendered = renderApp(path, { me: admin })
  await screen.findByRole('table', { name: '장부 미반영' })
  // 학생 이름까지 받은 뒤(줄 이름이 정해진 뒤)
  await screen.findByRole('link', { name: '김하윤' })
  return rendered
}

const retryButton = (who = WHO) => screen.getByRole('button', { name: `${who} 다시 반영` })

function retried(result: Partial<LedgerSyncRetry>) {
  return () => jsonResponse({ id: 31, status: 'SYNCED', reason: null, ...result })
}

/** 응답을 요청이 오기 전에 만들어 둔다. */
function hold() {
  let respond!: (response: Response) => void
  const pending = new Promise<Response>((resolve) => (respond = resolve))
  return { pending, respond }
}

test('직원은 이 화면을 볼 수 없고 아무것도 요청하지 않는다', async () => {
  renderApp(PATH, { me: staff })

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expectNoRequests()
})

test('줄마다 학생(이름은 따로 받음)·지점·대상 월·까닭과 할 일·시도·마지막 시도를 보여 준다', async () => {
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
    '김하윤',
    '동탄관',
    '2026-11',
    // 할 일에 그 달(= 장부 탭 이름)을 넣는다.
    '그 달 탭 없음장부에 그 달 탭(2026-11)을 만들어 주세요.',
    '2번',
    '2026.10.22 09:15',
    '다시 반영',
  ])
  expect(within(first).getByRole('link', { name: '김하윤' })).toHaveAttribute(
    'href',
    '/desk/students/16',
  )
  await within(second).findByRole('link', { name: '박서준' })
  expect(second).toHaveTextContent('능동관')
  expect(second).toHaveTextContent('빈 줄 없음반 블록에 빈 줄(No만 적힌 줄)을 더해 주세요.')
  expectStackLabels(screen.getByRole('table', { name: '장부 미반영' }))
})

test('학생을 받지 못하면 학생 번호로 보이고 그렇다고 표시한다', async () => {
  mockPage()
  mockApi({ 'GET /api/v1/students/16': () => problemResponse(400, { detail: '거부' }) })
  renderApp(PATH, { me: admin })

  expect(await screen.findByRole('link', { name: '학생 16' })).toHaveAttribute(
    'href',
    '/desk/students/16',
  )
  expect(await screen.findByText('(이름을 불러오지 못했어요)')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: '학생 16 2026-11(결제 7) 다시 반영' }),
  ).toBeInTheDocument()
})

test('지점을 고르면 그 지점만 요청하고, 받는 동안 이전 지점의 줄을 보이지 않으며, 지점 칸을 숨긴다', async () => {
  mockPage(page([row(), other]))
  const second = hold()
  mockApi({
    [LIST]: ({ query }) =>
      query.get('campusId') === '2' ? second.pending : jsonResponse(page([row(), other])),
  })
  const { router } = await openPage()

  await userEvent.click(screen.getByRole('radio', { name: '능동관' }))

  await waitFor(() => expect(lastQuery()).toEqual({ campusId: '2' }))
  expect(router.state.location.search).toBe('?campusId=2')
  // 다른 지점의 줄을 남겨 두면, 지점 칸까지 없어 그 줄을 이 지점 것으로 알고 다시 반영할 수 있다.
  expect(screen.getByRole('status')).toHaveTextContent('장부 미반영 목록을 불러오고 있어요.')
  expect(screen.queryByRole('link', { name: '김하윤' })).not.toBeInTheDocument()

  second.respond(jsonResponse(page([other])))
  expect(await screen.findByRole('link', { name: '박서준' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '김하윤' })).not.toBeInTheDocument()
  expect(screen.queryByRole('columnheader', { name: '지점' })).not.toBeInTheDocument()
})

test('주소로 연 지점을 요청하고, 전체를 고르면 지점 조건을 지우고 지점 칸이 돌아온다', async () => {
  mockPage(page([row()]))
  const { router } = await openPage(`${PATH}?campusId=1`)
  expect(lastQuery()).toEqual({ campusId: '1' })
  expect(screen.queryByRole('columnheader', { name: '지점' })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('radio', { name: '전체' }))

  await waitFor(() => expect(lastQuery()).toEqual({}))
  expect(router.state.location.search).toBe('')
  expect(await screen.findByRole('columnheader', { name: '지점' })).toBeInTheDocument()
})

test('다른 페이지에서 지점을 바꾸면 첫 페이지부터 본다', async () => {
  mockPage(page([row()], { totalElements: 25, totalPages: 2, page: 1 }))
  const { router } = await openPage(`${PATH}?page=1`)

  await userEvent.click(screen.getByRole('radio', { name: '능동관' }))

  await waitFor(() => expect(lastQuery()).toEqual({ campusId: '2' }))
  expect(router.state.location.search).toBe('?campusId=2')
})

test('다음 페이지를 받는 동안 이전 페이지를 흐리게 두고 페이지 이동을 막는다', async () => {
  mockPage(page([row()], { totalElements: 25, totalPages: 2 }))
  const next = hold()
  mockApi({
    [LIST]: ({ query }) =>
      query.get('page') === '1'
        ? next.pending
        : jsonResponse(page([row()], { totalElements: 25, totalPages: 2 })),
  })
  const { router } = await openPage()

  await userEvent.click(screen.getByRole('button', { name: '다음' }))

  await waitFor(() => expect(lastQuery()).toEqual({ page: '1' }))
  expect(router.state.location.search).toBe('?page=1')
  expect(screen.getByRole('link', { name: '김하윤' })).toBeInTheDocument()
  expect(screen.getByRole('table', { name: '장부 미반영' }).closest('[aria-busy]')).toHaveAttribute(
    'aria-busy',
    'true',
  )
  expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()

  next.respond(jsonResponse(page([other], { totalElements: 25, totalPages: 2, page: 1 })))
  expect(await screen.findByRole('link', { name: '박서준' })).toBeInTheDocument()
})

test('다시 반영하면 본문 없이 멱등 키와 함께 보내고, 줄이 빠지면 결과를 위에 남긴다', async () => {
  const server = mockPage()
  mockApi({
    [RETRY]: () => {
      server.list = page([])
      return jsonResponse({ id: 31, status: 'SYNCED', reason: null })
    },
  })
  await openPage()
  const before = count(LIST)

  await userEvent.click(retryButton())

  expect(await screen.findByText(`${WHO}: 장부에 썼어요.`)).toBeInTheDocument()
  expect(requestOf(RETRY).body).toBeUndefined()
  expect(requestOf(RETRY).headers.get('Idempotency-Key')).toMatch(UUID)
  await waitFor(() => expect(count(LIST)).toBe(before + 1))
  expect(await screen.findByText('장부에 쓰지 못한 결제가 없어요')).toBeInTheDocument()
  // 목록에서 빠져도 결과는 남는다.
  expect(screen.getByText(`${WHO}: 장부에 썼어요.`)).toBeInTheDocument()
})

test.each([
  [
    { status: 'PENDING' as const },
    `${WHO}: 아직 장부에 쓰지 않았어요. 서버가 잠시 뒤 다시 해요. 끝내 못 쓰면 이 목록에 다시 나와요.`,
  ],
  [{ status: 'CANCELED' as const }, `${WHO}: 취소한 결제라 처리를 마쳤어요.`],
  [{ status: 'IN_PROGRESS' as const }, `${WHO}: 다른 쪽이 반영하고 있어요. 목록을 다시 받아요.`],
  [
    { status: 'UNSYNCED' as const, reason: 'BLOCK_NOT_FOUND' as const },
    `${WHO}: 또 쓰지 못했어요. 그 반 블록이 없어요. A열 칸의 첫 줄이 반 이름과 같은지 봐 주세요.`,
  ],
  [
    { status: 'UNSYNCED' as const, reason: null },
    `${WHO}: 또 쓰지 못했어요. 개발자 확인이 필요해요.`,
  ],
  [
    { status: 'SKIPPED' as LedgerSyncRetry['status'] },
    `${WHO}: 알 수 없는 결과예요(SKIPPED). 목록을 확인하고 개발자에게 알려 주세요.`,
  ],
])('다시 반영의 결과 %o를 알린다', async (result, text) => {
  mockPage()
  mockApi({ [RETRY]: retried(result) })
  await openPage()

  await userEvent.click(retryButton())

  expect(await screen.findByText(text)).toBeInTheDocument()
})

test('줄이 남는 결과는 그 줄 안에 보이고, 같은 결과가 또 와도 새로 그린다', async () => {
  mockPage()
  mockApi({ [RETRY]: retried({ status: 'UNSYNCED', reason: 'TAB_NOT_FOUND' }) })
  await openPage()
  const text = `${WHO}: 또 쓰지 못했어요. 장부에 그 달 탭(2026-11)을 만들어 주세요.`

  await userEvent.click(retryButton())
  const first = await within(screen.getAllByRole('row')[1]).findByText(text)
  await userEvent.click(retryButton())

  await waitFor(() => expect(within(screen.getAllByRole('row')[1]).getByText(text)).not.toBe(first))
  expect(screen.getAllByText(text)).toHaveLength(1)
})

test('여러 줄의 결과는 서로 덮지 않는다', async () => {
  const server = mockPage(page([row(), other]))
  mockApi({
    [RETRY]: () => {
      server.list = page([other])
      return jsonResponse({ id: 31, status: 'SYNCED', reason: null })
    },
    [RETRY_32]: () => jsonResponse({ id: 32, status: 'UNSYNCED', reason: 'NO_EMPTY_ROW' }),
  })
  await openPage()
  await screen.findByRole('link', { name: '박서준' })

  await userEvent.click(retryButton())
  await screen.findByText(`${WHO}: 장부에 썼어요.`)
  await userEvent.click(retryButton(WHO_32))

  expect(
    await screen.findByText(
      `${WHO_32}: 또 쓰지 못했어요. 반 블록에 빈 줄(No만 적힌 줄)을 더해 주세요.`,
    ),
  ).toBeInTheDocument()
  expect(screen.getByText(`${WHO}: 장부에 썼어요.`)).toBeInTheDocument()
})

test('응답 전에 그 줄이 목록에서 빠져도(다른 줄의 처리로 다시 받음) 결과를 위에 알린다', async () => {
  const server = mockPage(page([row(), other]))
  const first = hold()
  mockApi({
    [RETRY]: () => first.pending,
    [RETRY_32]: () => {
      // 그사이 서버가 31번 줄을 반영해 목록에서 뺐다.
      server.list = page([other])
      return jsonResponse({ id: 32, status: 'UNSYNCED', reason: 'NO_EMPTY_ROW' })
    },
  })
  await openPage()
  await screen.findByRole('link', { name: '박서준' })

  await userEvent.click(retryButton())
  await userEvent.click(retryButton(WHO_32))
  await waitFor(() =>
    expect(screen.queryByRole('link', { name: '김하윤' })).not.toBeInTheDocument(),
  )

  first.respond(jsonResponse({ id: 31, status: 'SYNCED', reason: null }))
  expect(await screen.findByText(`${WHO}: 장부에 썼어요.`)).toBeInTheDocument()
})

test('지점이나 페이지를 바꾸면 지난 결과를 지운다', async () => {
  const server = mockPage()
  mockApi({
    [RETRY]: () => {
      server.list = page([])
      return jsonResponse({ id: 31, status: 'SYNCED', reason: null })
    },
  })
  await openPage()
  await userEvent.click(retryButton())
  await screen.findByText(`${WHO}: 장부에 썼어요.`)

  await userEvent.click(screen.getByRole('radio', { name: '능동관' }))

  await waitFor(() => expect(screen.queryByText(`${WHO}: 장부에 썼어요.`)).not.toBeInTheDocument())
})

test('반 나눔은 다시 해도 같아 버튼 대신 직접 적으라고 한다', async () => {
  mockPage(page([row({ reason: 'SPLIT_CLASS' })]))
  await openPage()

  const [, line] = screen.getAllByRole('row')
  expect(line).toHaveTextContent('반 나눔반 나눔 청구라 장부에 직접 적어 주세요.')
  expect(line).toHaveTextContent('직접 적어 주세요')
  expect(within(line).queryByRole('button')).not.toBeInTheDocument()
  expectStackLabels(screen.getByRole('table', { name: '장부 미반영' }))
})

test.each([
  ['모르는 값', 'NEW_REASON', 'NEW_REASON개발자 확인이 필요해요.'],
  // 객체의 기본 속성 이름과 겹쳐도 아는 까닭으로 치지 않는다(화면이 깨지지 않는다).
  ['기본 속성 이름', 'constructor', 'constructor개발자 확인이 필요해요.'],
])('까닭이 %s면 값 그대로 보이고 개발자 확인을 안내한다', async (_name, reason, text) => {
  mockPage(page([row({ reason: reason as LedgerSync['reason'] })]))
  await openPage()

  expect(screen.getAllByRole('row')[1]).toHaveTextContent(text)
})

test('다시 반영의 답을 받지 못하면 알리고, 다시 누르면 새 키로 보낸다(옛 결과를 받지 않게)', async () => {
  mockPage()
  let fail = true
  mockApi({ [RETRY]: () => (fail ? unreadableResponse('req-lost') : retried({})()) })
  await openPage()

  await userEvent.click(retryButton())

  expect(
    await screen.findByText(
      /반영됐을 수도 있어요\. 목록을 다시 받아요\. 줄이 남아 있으면 다시 눌러 주세요\./,
    ),
  ).toBeInTheDocument()
  expect(screen.getByText(/req-lost/)).toBeInTheDocument()
  const firstKey = requestOf(RETRY).headers.get('Idempotency-Key')
  fail = false
  await userEvent.click(retryButton())

  expect(await screen.findByText(`${WHO}: 장부에 썼어요.`)).toBeInTheDocument()
  expect(keysOf(RETRY)).toHaveLength(2)
  expect(requestOf(RETRY).headers.get('Idempotency-Key')).toMatch(UUID)
  expect(requestOf(RETRY).headers.get('Idempotency-Key')).not.toBe(firstKey)
})

test.each([
  [
    409,
    'BILLING_LEDGER_SYNC_NOT_RETRYABLE',
    `${WHO}: 이미 반영됐거나 서버가 다시 하는 중이에요. 목록을 다시 받아요.`,
  ],
  [404, 'BILLING_LEDGER_SYNC_NOT_FOUND', `${WHO}: 반영 기록을 찾지 못했어요. 목록을 다시 받아요.`],
])('다시 반영이 %s(%s)이면 알리고 목록을 다시 받는다', async (status, code, text) => {
  mockPage()
  mockApi({ [RETRY]: () => problemResponse(status, { code, detail: '거부' }) })
  await openPage()
  const before = count(LIST)

  await userEvent.click(retryButton())

  expect(await screen.findByText(text)).toBeInTheDocument()
  await waitFor(() => expect(count(LIST)).toBe(before + 1))
})

test('다시 반영이 그 밖의 오류면 서버 문구를 오류로 알리고 요청 번호를 붙인다', async () => {
  mockPage()
  mockApi({
    [RETRY]: () =>
      // 처리됐는지 모르는 실패(5xx 등)가 아닌 거부. 코드가 없어 예상하지 못한 답으로 보고 요청 번호를 붙인다.
      problemResponse(
        400,
        { detail: '요청이 올바르지 않습니다.', requestId: 'req-bad-request-400' },
        { 'X-Request-Id': 'req-bad-request-400' },
      ),
  })
  await openPage()

  await userEvent.click(retryButton())

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(`${WHO}: 요청이 올바르지 않습니다.`)
  // 요청 번호는 안내 바로 아래 줄에 붙는다(Notice의 RequestIdLine).
  expect(screen.getByText(/req-bad-request-400/)).toBeInTheDocument()
})

test('다시 반영이 너무 많다는 답이면 언제 다시 누를지 알린다', async () => {
  mockPage()
  mockApi({ [RETRY]: () => tooManyRequests({ detail: '요청이 너무 많습니다.' }, '120') })
  await openPage()

  await userEvent.click(retryButton())

  expect(
    await screen.findByText(`${WHO}: 요청이 너무 많아요. 약 2분 뒤에 다시 눌러 주세요.`),
  ).toBeInTheDocument()
})

test('보내는 동안에는 그 줄의 버튼만 막고, 버튼 이름도 보이는 글자를 따른다', async () => {
  mockPage(page([row(), other]))
  const first = hold()
  mockApi({ [RETRY]: () => first.pending })
  await openPage()
  await screen.findByRole('link', { name: '박서준' })

  await userEvent.click(retryButton())

  const sending = screen.getByRole('button', { name: `${WHO} 반영하는 중` })
  expect(sending).toBeDisabled()
  expect(retryButton(WHO_32)).toBeEnabled()
  first.respond(jsonResponse({ id: 31, status: 'SYNCED', reason: null }))
  expect(await screen.findByText(`${WHO}: 장부에 썼어요.`)).toBeInTheDocument()
  expect(count(RETRY)).toBe(1)
})

test('미반영이 없으면 그렇게 알린다', async () => {
  mockPage(page([]))
  renderApp(PATH, { me: admin })

  expect(await screen.findByText('장부에 쓰지 못한 결제가 없어요')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('다시 받기에 실패하면 "없어요"라고 단정하지 않는다', async () => {
  const server = mockPage(page([]))
  let fail = false
  mockApi({
    [LIST]: () =>
      fail
        ? problemResponse(400, { detail: '요청이 올바르지 않습니다.' })
        : jsonResponse(server.list),
  })
  const { queryClient } = renderApp(PATH, { me: admin })
  await screen.findByText('장부에 쓰지 못한 결제가 없어요')

  // 다시 받기(다른 줄의 처리, 창에 돌아옴 등)가 실패한다.
  fail = true
  await act(() => queryClient.invalidateQueries({ queryKey: ['billing', 'ledger-sync'] }))

  expect(
    await screen.findByText(
      '최신 목록을 불러오지 못했어요. 아래 내용은 이전 것일 수 있어요. 요청이 올바르지 않습니다.',
    ),
  ).toBeInTheDocument()
  expect(screen.queryByText('장부에 쓰지 못한 결제가 없어요')).not.toBeInTheDocument()
})

test('다시 반영 뒤 목록을 다시 받지 못해도 표는 남기고 이전 것일 수 있다고 알린다', async () => {
  const server = mockPage()
  let fail = false
  mockApi({
    [LIST]: () =>
      fail
        ? problemResponse(400, { detail: '요청이 올바르지 않습니다.' })
        : jsonResponse(server.list),
    [RETRY]: () => {
      fail = true
      return jsonResponse({ id: 31, status: 'UNSYNCED', reason: 'TAB_NOT_FOUND' })
    },
  })
  await openPage()

  await userEvent.click(retryButton())

  expect(
    await screen.findByText(/최신 목록을 불러오지 못했어요\. 아래 내용은 이전 것일 수 있어요\./),
  ).toBeInTheDocument()
  expect(screen.getByRole('table', { name: '장부 미반영' })).toBeInTheDocument()
})

test('없는 페이지로 들어오면 첫 페이지로 가는 길을 둔다', async () => {
  mockPage(page([], { totalElements: 3, page: 4 }))
  renderApp(`${PATH}?page=4`, { me: admin })

  expect(await screen.findByText('이 페이지에는 미반영이 없어요')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '첫 페이지로' })).toHaveAttribute('href', PATH)
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
    await screen.findByText('장부 미반영 목록을 불러오지 못했어요. 요청이 올바르지 않습니다.'),
  ).toBeInTheDocument()
  fail = false
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

  expect(await screen.findByRole('table', { name: '장부 미반영' })).toBeInTheDocument()
})

test('지점 목록을 받지 못하면 알리고, 줄의 지점은 번호로 보이며 다시 받을 수 있다', async () => {
  mockPage()
  let fail = true
  mockApi({
    [CAMPUSES]: () => (fail ? problemResponse(400, { detail: '거부' }) : jsonResponse(campuses)),
  })
  await openPage()

  expect(
    await screen.findByText(
      '지점 이름을 불러오지 못했어요. 다른 지점을 고를 수 없고, 지점이 번호로 보여요.',
      {},
      { timeout: 5000 },
    ),
  ).toBeInTheDocument()
  expect(screen.getAllByRole('row')[1]).toHaveTextContent('지점 1')
  fail = false
  await userEvent.click(screen.getByRole('button', { name: '지점 다시 불러오기' }))

  await waitFor(() => expect(screen.getAllByRole('row')[1]).toHaveTextContent('동탄관'))
})

test('같은 줄의 결과는 마지막 것 하나만 남는다(줄이 빠진 뒤 옛 결과가 남지 않는다)', async () => {
  const server = mockPage()
  let fixed = false
  mockApi({
    [RETRY]: () => {
      if (!fixed) return jsonResponse({ id: 31, status: 'UNSYNCED', reason: 'TAB_NOT_FOUND' })
      server.list = page([])
      return jsonResponse({ id: 31, status: 'SYNCED', reason: null })
    },
  })
  await openPage()
  const failed = `${WHO}: 또 쓰지 못했어요. 장부에 그 달 탭(2026-11)을 만들어 주세요.`

  await userEvent.click(retryButton())
  await screen.findByText(failed)
  // 장부에 탭을 만들고 다시 누른다.
  fixed = true
  await userEvent.click(retryButton())

  expect(await screen.findByText(`${WHO}: 장부에 썼어요.`)).toBeInTheDocument()
  expect(screen.queryByText(failed)).not.toBeInTheDocument()
})
