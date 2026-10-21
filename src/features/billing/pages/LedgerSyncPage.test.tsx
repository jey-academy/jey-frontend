import { screen, waitFor, within } from '@testing-library/react'
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

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

async function openPage(path = PATH) {
  const rendered = renderApp(path, { me: admin })
  await screen.findByRole('table', { name: '장부 미반영' })
  return rendered
}

const retryButton = (name = '김하윤 2026-11 다시 반영') => screen.getByRole('button', { name })

function retried(result: Partial<LedgerSyncRetry>) {
  return () => jsonResponse({ id: 31, status: 'SYNCED', reason: null, ...result })
}

test('직원은 이 화면을 볼 수 없고 아무것도 요청하지 않는다', async () => {
  renderApp(PATH, { me: staff })

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expectNoRequests()
})

test('줄마다 학생(이름은 따로 받음)·지점·대상 월·까닭과 할 일·시도·마지막 시도를 보여 준다', async () => {
  mockPage(
    page([row(), row({ id: 32, studentId: 17, campusId: 2, reason: 'NO_EMPTY_ROW', attempts: 1 })]),
  )
  await openPage()

  expect(lastQuery()).toEqual({})
  expect(screen.getByText('전체 2건')).toBeInTheDocument()
  const [, first, second] = screen.getAllByRole('row')
  await within(first).findByRole('link', { name: '김하윤' })
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

test('학생을 받지 못하면 학생 번호로 보여 준다', async () => {
  mockPage()
  mockApi({ 'GET /api/v1/students/16': () => problemResponse(400, { detail: '거부' }) })
  await openPage()

  expect(await screen.findByRole('link', { name: '학생 16' })).toHaveAttribute(
    'href',
    '/desk/students/16',
  )
})

test('지점을 고르면 그 지점만 요청하고 지점 칸을 숨긴다. 주소에 남는다', async () => {
  mockPage()
  const { router } = await openPage()

  await userEvent.click(screen.getByRole('radio', { name: '능동관' }))

  await waitFor(() => expect(lastQuery()).toEqual({ campusId: '2' }))
  expect(router.state.location.search).toBe('?campusId=2')
  await waitFor(() =>
    expect(screen.queryByRole('columnheader', { name: '지점' })).not.toBeInTheDocument(),
  )
})

test('다음 페이지를 누르면 그 페이지를 요청한다', async () => {
  mockPage(page([row()], { totalElements: 25, totalPages: 2 }))
  const { router } = await openPage()

  await userEvent.click(screen.getByRole('button', { name: '다음' }))

  await waitFor(() => expect(lastQuery()).toEqual({ page: '1' }))
  expect(router.state.location.search).toBe('?page=1')
})

test('다시 반영하면 본문 없이 멱등 키와 함께 보내고, 결과를 위에 알리고 목록을 다시 받는다', async () => {
  const server = mockPage()
  mockApi({
    [RETRY]: () => {
      server.list = page([])
      return jsonResponse({ id: 31, status: 'SYNCED', reason: null })
    },
  })
  await openPage()
  const before = count(LIST)
  await within(screen.getAllByRole('row')[1]).findByRole('link', { name: '김하윤' })

  await userEvent.click(retryButton())

  expect(await screen.findByText('김하윤 2026-11: 장부에 썼어요.')).toBeInTheDocument()
  expect(requestOf(RETRY).body).toBeUndefined()
  expect(requestOf(RETRY).headers.get('Idempotency-Key')).toMatch(UUID)
  await waitFor(() => expect(count(LIST)).toBe(before + 1))
  // 목록에서 빠져도 결과는 남는다.
  expect(await screen.findByText('장부에 쓰지 못한 결제가 없어요')).toBeInTheDocument()
  expect(screen.getByText('김하윤 2026-11: 장부에 썼어요.')).toBeInTheDocument()
})

test.each([
  [{ status: 'PENDING' as const }, '김하윤 2026-11: 잠시 뒤 서버가 자동으로 다시 해요.'],
  [{ status: 'CANCELED' as const }, '김하윤 2026-11: 취소한 결제라 처리를 마쳤어요.'],
  [
    { status: 'IN_PROGRESS' as const },
    '김하윤 2026-11: 다른 쪽이 반영하고 있어요. 목록을 새로 받았어요.',
  ],
  [
    { status: 'UNSYNCED' as const, reason: 'BLOCK_NOT_FOUND' as const },
    '김하윤 2026-11: 또 쓰지 못했어요. 그 반 블록이 없어요. A열 칸의 첫 줄이 반 이름과 같은지 봐 주세요.',
  ],
])('다시 반영의 결과 %o를 알린다', async (result, text) => {
  mockPage()
  mockApi({ [RETRY]: retried(result) })
  await openPage()
  await within(screen.getAllByRole('row')[1]).findByRole('link', { name: '김하윤' })

  await userEvent.click(retryButton())

  expect(await screen.findByText(text)).toBeInTheDocument()
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

test('모르는 까닭은 값 그대로 보이고 개발자 확인을 안내한다', async () => {
  mockPage(page([row({ reason: 'NEW_REASON' as LedgerSync['reason'] })]))
  await openPage()

  expect(screen.getAllByRole('row')[1]).toHaveTextContent('NEW_REASON개발자 확인이 필요해요.')
})

test('다시 반영의 답을 받지 못하면 알리고, 그대로 다시 누르면 같은 키로 보낸다', async () => {
  mockPage()
  let fail = true
  mockApi({ [RETRY]: () => (fail ? unreadableResponse() : retried({})()) })
  await openPage()
  await within(screen.getAllByRole('row')[1]).findByRole('link', { name: '김하윤' })

  await userEvent.click(retryButton())

  expect(
    await screen.findByText(/반영됐을 수도 있어요\. 목록을 새로 받았어요\./),
  ).toBeInTheDocument()
  const firstKey = requestOf(RETRY).headers.get('Idempotency-Key')
  fail = false
  await userEvent.click(retryButton())

  expect(await screen.findByText('김하윤 2026-11: 장부에 썼어요.')).toBeInTheDocument()
  expect(requestOf(RETRY).headers.get('Idempotency-Key')).toBe(firstKey)
})

test.each([
  [
    409,
    'BILLING_LEDGER_SYNC_NOT_RETRYABLE',
    '김하윤 2026-11: 이미 반영됐거나 서버가 다시 하는 중이에요. 목록을 새로 받았어요.',
  ],
  [
    404,
    'BILLING_LEDGER_SYNC_NOT_FOUND',
    '김하윤 2026-11: 반영 기록을 찾지 못했어요. 목록을 새로 받았어요.',
  ],
])('다시 반영이 %s(%s)이면 알리고 목록을 다시 받는다', async (status, code, text) => {
  mockPage()
  mockApi({ [RETRY]: () => problemResponse(status, { code, detail: '거부' }) })
  await openPage()
  const before = count(LIST)
  await within(screen.getAllByRole('row')[1]).findByRole('link', { name: '김하윤' })

  await userEvent.click(retryButton())

  expect(await screen.findByText(text)).toBeInTheDocument()
  await waitFor(() => expect(count(LIST)).toBe(before + 1))
})

test('보내는 동안에는 그 줄의 버튼을 막는다', async () => {
  mockPage()
  let respond!: (response: Response) => void
  const pending = new Promise<Response>((resolve) => (respond = resolve))
  mockApi({ [RETRY]: () => pending })
  await openPage()
  await within(screen.getAllByRole('row')[1]).findByRole('link', { name: '김하윤' })

  await userEvent.click(retryButton())

  expect(retryButton()).toBeDisabled()
  expect(retryButton()).toHaveTextContent('반영하는 중')
  respond(jsonResponse({ id: 31, status: 'SYNCED', reason: null }))
  expect(await screen.findByText('김하윤 2026-11: 장부에 썼어요.')).toBeInTheDocument()
  expect(count(RETRY)).toBe(1)
})

test('미반영이 없으면 그렇게 알린다', async () => {
  mockPage(page([]))
  renderApp(PATH, { me: admin })

  expect(await screen.findByText('장부에 쓰지 못한 결제가 없어요')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
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
