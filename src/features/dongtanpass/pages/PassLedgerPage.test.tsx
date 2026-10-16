import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, onTestFinished, test, vi } from 'vitest'
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
import { admin, partner, renderApp } from '@/test/renderApp'
import type { LedgerItem, LedgerPage } from '../api'

setupMockApi()
setupDialog()

const PATH = '/partner/passes'
const LEDGER = 'GET /api/v1/dongtanpass/passes'
const EXPORT = 'GET /api/v1/dongtanpass/passes/export'
const link = (id: number) => `POST /api/v1/dongtanpass/passes/${id}/link`
const cancel = (id: number) => `POST /api/v1/dongtanpass/passes/${id}/cancel`

function item(overrides: Partial<LedgerItem>): LedgerItem {
  return {
    id: 1,
    passNo: 'DT-7KQ4MX',
    studentName: '김도윤',
    // 화면은 발급일을 서버가 정한 issuedOn 그대로 쓴다. 시각(issuedAt)에서 날짜를 만들지 않는지 보려고
    // 일부러 다른 날의 시각을 넣는다(실제로는 같은 날이다).
    issuedAt: '2026-10-14T01:00:00Z',
    issuedOn: '2026-10-16',
    expiresOn: '2026-11-16',
    paidOn: '2026-10-15',
    paidAmount: 280000,
    paymentMethod: 'CARD',
    state: 'ISSUED',
    ...overrides,
  }
}

const issued = item({})
const expired = item({ id: 2, passNo: 'DT-EXP001', studentName: '이서준', state: 'EXPIRED' })
const redeemed = item({ id: 3, passNo: 'DT-RED001', studentName: '박하은', state: 'REDEEMED' })
const canceled = item({ id: 4, passNo: 'DT-CAN001', studentName: '최지우', state: 'CANCELED' })

function page(items: LedgerItem[], overrides: Partial<LedgerPage> = {}): LedgerPage {
  return {
    items,
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages: items.length > 0 ? 1 : 0,
    ...overrides,
  }
}

function mockLedger(body: LedgerPage = page([issued, expired, redeemed, canceled])) {
  mockApi({ [LEDGER]: () => jsonResponse(body) })
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

/** 요청 "메서드 주소"의 쿼리를 객체로 */
function queryOf(key: string) {
  const query: Record<string, string> = {}
  new URLSearchParams(key.split('?')[1] ?? '').forEach((value, name) => {
    query[name] = value
  })
  return query
}

/** 마지막 장부 요청의 쿼리 */
function lastLedgerQuery() {
  const key = requests().findLast((request) => request.startsWith(LEDGER))
  if (!key) throw new Error('장부 요청이 없어요')
  return queryOf(key)
}

function rowOf(passNo: string) {
  return screen.getByText(passNo).closest('li') as HTMLElement
}

async function openPage(path = PATH) {
  const rendered = renderApp(path, { me: partner })
  await screen.findByRole('list', { name: '패스 목록' })
  return rendered
}

test('관리자에게는 목록 대신 안내만 보여 주고 요청을 보내지 않는다', async () => {
  renderApp(PATH, { me: admin })

  expect(
    await screen.findByText('패스 목록은 연계 학원 계정으로 봐요. 관리자 계정으로는 볼 수 없어요.'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'CSV 내려받기' })).not.toBeInTheDocument()
  expectNoRequests()
})

test('줄마다 이름·상태·패스 번호·발급일·기한·결제를 보여 준다. 발급일은 issuedOn 그대로다', async () => {
  mockLedger()
  await openPage()

  const row = rowOf('DT-7KQ4MX')
  expect(within(row).getByText('김도윤')).toBeInTheDocument()
  expect(within(row).getByText('사용 가능')).toBeInTheDocument()
  expect(within(row).getByText('2026.10.16')).toBeInTheDocument()
  expect(within(row).getByText('2026.11.16까지')).toBeInTheDocument()
  expect(within(row).getByText('280,000원 카드')).toBeInTheDocument()
  expect(within(row).getByText('2026.10.15 결제')).toBeInTheDocument()

  expect(within(rowOf('DT-EXP001')).getByText('기간 만료')).toBeInTheDocument()
  expect(within(rowOf('DT-RED001')).getByText('사용 완료')).toBeInTheDocument()
  expect(within(rowOf('DT-CAN001')).getByText('발급 취소')).toBeInTheDocument()
  expect(screen.getByText('전체 4건')).toBeInTheDocument()
  // 첫 페이지와 빈 조건은 싣지 않는다.
  expect(requests()).toEqual([LEDGER])
})

test('사용 가능은 링크 새로 만들기·취소, 만료는 취소만, 사용·취소된 패스는 버튼이 없다', async () => {
  mockLedger()
  await openPage()

  const buttonsOf = (passNo: string) =>
    within(rowOf(passNo))
      .queryAllByRole('button')
      .map((button) => button.textContent)
  expect(buttonsOf('DT-7KQ4MX')).toEqual(['링크 새로 만들기', '취소'])
  expect(buttonsOf('DT-EXP001')).toEqual(['취소'])
  expect(buttonsOf('DT-RED001')).toEqual([])
  expect(buttonsOf('DT-CAN001')).toEqual([])
  // 이름이 같은 학생이 있어도 어느 패스의 버튼인지 알 수 있다.
  expect(screen.getByRole('button', { name: '패스 취소 (이서준, DT-EXP001)' })).toBeInTheDocument()
})

test('상태 칩을 고르면 그 상태로 첫 페이지부터 다시 받고, 주소에 남긴다', async () => {
  mockLedger()
  const { router } = await openPage(`${PATH}?page=2`)

  await userEvent.click(screen.getByRole('radio', { name: '기간 만료' }))

  await waitFor(() => expect(lastLedgerQuery()).toEqual({ status: 'EXPIRED' }))
  expect(router.state.location.search).toBe('?status=EXPIRED')

  await userEvent.click(screen.getByRole('radio', { name: '전체' }))
  await waitFor(() => expect(router.state.location.search).toBe(''))
})

test('발급일 기간을 넣고 조회하면 날짜 그대로 보낸다', async () => {
  mockLedger()
  const { router } = await openPage(`${PATH}?status=ISSUED`)

  await userEvent.type(screen.getByLabelText('발급일 시작'), '2026-10-01')
  await userEvent.type(screen.getByLabelText('발급일 끝'), '2026-10-16')
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  await waitFor(() =>
    expect(lastLedgerQuery()).toEqual({ status: 'ISSUED', from: '2026-10-01', to: '2026-10-16' }),
  )
  expect(router.state.location.search).toBe('?status=ISSUED&from=2026-10-01&to=2026-10-16')
})

test('끝일이 시작일보다 앞이면 칸에 알리고 요청을 보내지 않는다', async () => {
  mockLedger()
  await openPage()

  await userEvent.type(screen.getByLabelText('발급일 시작'), '2026-10-16')
  await userEvent.type(screen.getByLabelText('발급일 끝'), '2026-10-01')
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  expect(await screen.findByText('끝일이 시작일보다 앞이에요.')).toBeInTheDocument()
  expect(count(LEDGER)).toBe(1)
})

test('주소의 틀린 조건은 버리고 받는다', async () => {
  mockLedger()
  await openPage(`${PATH}?status=USED&from=2026-02-30&to=2026-10-16&page=abc`)

  expect(lastLedgerQuery()).toEqual({ to: '2026-10-16' })
})

test('페이지를 넘기면 그 페이지를 받는다', async () => {
  mockApi({
    [LEDGER]: ({ query }) =>
      jsonResponse(
        page([query.get('page') === '1' ? expired : issued], {
          page: Number(query.get('page') ?? 0),
          totalElements: 21,
          totalPages: 2,
        }),
      ),
  })
  const { router } = await openPage()

  await userEvent.click(screen.getByRole('button', { name: '다음' }))

  expect(await screen.findByText('DT-EXP001')).toBeInTheDocument()
  expect(lastLedgerQuery()).toEqual({ page: '1' })
  expect(router.state.location.search).toBe('?page=1')
})

test('상태를 바꾸면 새 결과가 올 때까지 이전 조건의 줄을 보여 주지 않는다', async () => {
  mockApi({
    [LEDGER]: ({ query }) =>
      query.get('status') ? new Promise<Response>(() => {}) : jsonResponse(page([issued])),
  })
  await openPage()

  await userEvent.click(screen.getByRole('radio', { name: '발급 취소' }))

  expect(await screen.findByText('패스 목록을 불러오고 있어요.')).toBeInTheDocument()
  expect(screen.queryByText('DT-7KQ4MX')).not.toBeInTheDocument()
})

test('페이지만 넘길 때는 받는 동안 이전 줄을 흐리게 남기고 다시 넘기지 못하게 한다', async () => {
  mockApi({
    [LEDGER]: ({ query }) =>
      query.get('page')
        ? new Promise<Response>(() => {})
        : jsonResponse(page([issued], { totalElements: 21, totalPages: 2 })),
  })
  await openPage()

  await userEvent.click(screen.getByRole('button', { name: '다음' }))

  await waitFor(() =>
    expect(screen.getByText('DT-7KQ4MX').closest('[aria-busy]')).toHaveAttribute(
      'aria-busy',
      'true',
    ),
  )
  expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
})

test('없는 페이지면 조건은 그대로 두고 첫 페이지로 가는 길을 보여 준다', async () => {
  mockApi({ [LEDGER]: () => jsonResponse(page([], { page: 3, totalElements: 21, totalPages: 2 })) })
  renderApp(`${PATH}?status=ISSUED&page=3`, { me: partner })

  expect(await screen.findByText('이 페이지에는 패스가 없어요')).toBeInTheDocument()
  expect(screen.getByText('조건에 맞는 패스는 모두 21건이에요.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '첫 페이지로' })).toHaveAttribute(
    'href',
    `${PATH}?status=ISSUED`,
  )
})

test('같은 조건으로 조회를 누르면 주소는 그대로 두고 새로 받는다', async () => {
  mockLedger()
  const { router } = await openPage()

  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  await waitFor(() => expect(count(LEDGER)).toBe(2))
  expect(router.state.location.search).toBe('')
})

test('조건 지우기를 누르면 기간 칸도 비워, 다음 조회에 옛 기간이 다시 걸리지 않는다', async () => {
  mockLedger()
  await openPage(`${PATH}?from=2026-10-01&to=2026-10-16`)
  expect(screen.getByLabelText('발급일 시작')).toHaveValue('2026-10-01')

  await userEvent.click(screen.getByRole('link', { name: '조건 지우기' }))

  await waitFor(() => expect(screen.getByLabelText('발급일 시작')).toHaveValue(''))
  expect(screen.getByLabelText('발급일 끝')).toHaveValue('')
  await userEvent.click(screen.getByRole('radio', { name: '기간 만료' }))
  await waitFor(() => expect(lastLedgerQuery()).toEqual({ status: 'EXPIRED' }))
})

test('발급한 패스가 없으면 발급 화면으로 가는 길을, 조건에 맞는 것이 없으면 그 안내를 보여 준다', async () => {
  mockLedger(page([]))
  renderApp(PATH, { me: partner })

  expect(await screen.findByText('아직 발급한 패스가 없어요')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '패스 발급하기' })).toHaveAttribute(
    'href',
    '/partner/passes/new',
  )

  await userEvent.click(screen.getByRole('radio', { name: '발급 취소' }))
  expect(await screen.findByText('조건에 맞는 패스가 없어요')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '패스 발급하기' })).not.toBeInTheDocument()
})

test('서버가 기간이 틀렸다고 하면 고칠 곳을 알린다', async () => {
  mockApi({
    [LEDGER]: () =>
      problemResponse(400, {
        detail: '기간이 올바르지 않습니다.',
        code: 'DONGTANPASS_INVALID_PERIOD',
      }),
  })
  renderApp(`${PATH}?from=2026-10-16&to=2026-10-01`, { me: partner })

  expect(
    await screen.findByText('기간이 맞지 않아요. 시작일과 끝일을 고쳐 주세요.'),
  ).toBeInTheDocument()
})

test('꺼진 학원이면 목록 대신 서버의 안내만 보여 준다', async () => {
  mockApi({
    [LEDGER]: () =>
      problemResponse(403, {
        detail: '이용이 중지된 학원입니다.',
        code: 'DONGTANPASS_PARTNER_INACTIVE',
      }),
  })
  renderApp(PATH, { me: partner })

  expect(await screen.findByText('이용이 중지된 학원입니다.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'CSV 내려받기' })).not.toBeInTheDocument()
})

/** 내려받기를 흉내 낸다. 저장한 파일의 이름과 내용을 돌려준다. */
function captureSave() {
  const saved: { name: string; blob: Blob }[] = []
  const blobs = new Map<string, Blob>()
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (blob: Blob) => {
      const url = `blob:test/${blobs.size}`
      blobs.set(url, blob)
      return url
    },
    revokeObjectURL: vi.fn(),
  })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push({ name: this.download, blob: blobs.get(this.getAttribute('href') ?? '')! })
  })
  onTestFinished(() => click.mockRestore())
  return saved
}

test('CSV는 칸에 넣다 만 값이 아니라 걸린 기간으로 받아 서버가 정한 이름으로 저장한다. 상태는 싣지 않는다', async () => {
  mockLedger()
  mockApi({
    [EXPORT]: () =>
      new Response('﻿패스 번호,학생 이름\n', {
        headers: {
          'Content-Type': 'text/csv; charset=UTF-8',
          'Content-Disposition': 'attachment; filename="passes-2026-10.csv"',
        },
      }),
  })
  const saved = captureSave()
  await openPage(`${PATH}?status=ISSUED&from=2026-10-01&to=2026-10-16`)
  // 칸만 고치고 조회하지 않았다. 목록은 아직 10월 1일부터다.
  await userEvent.clear(screen.getByLabelText('발급일 시작'))
  await userEvent.type(screen.getByLabelText('발급일 시작'), '2026-09-01')

  await userEvent.click(screen.getByRole('button', { name: 'CSV 내려받기' }))

  await waitFor(() => expect(saved).toHaveLength(1))
  expect(saved[0].name).toBe('passes-2026-10.csv')
  expect(await saved[0].blob.text()).toContain('패스 번호')
  const exported = requests().find((request) => request.startsWith(EXPORT))!
  expect(queryOf(exported)).toEqual({
    from: '2026-10-01',
    to: '2026-10-16',
  })
  // 파일 형식만 받겠다고 하면 오류 본문(JSON)을 받지 못할 수 있다.
  expect(requestOf(exported).headers.get('Accept')).toBe('*/*')
})

test('CSV를 받지 못하면 알리고 저장하지 않는다', async () => {
  mockLedger()
  // 앞단(프록시)이 끊은 답. 본문이 JSON이 아니다.
  mockApi({ [EXPORT]: () => new Response('<html>Bad Gateway</html>', { status: 502 }) })
  const saved = captureSave()
  await openPage()

  await userEvent.click(screen.getByRole('button', { name: 'CSV 내려받기' }))

  expect(await screen.findByText(/CSV를 내려받지 못했어요/)).toBeInTheDocument()
  expect(saved).toEqual([])
  expect(screen.getByRole('button', { name: 'CSV 내려받기' })).toBeEnabled()
})

test('서버가 파일 이름을 주지 않으면 정해 둔 이름으로 저장한다', async () => {
  mockLedger()
  mockApi({
    [EXPORT]: () => new Response('a,b\n', { headers: { 'Content-Type': 'text/csv' } }),
  })
  const saved = captureSave()
  await openPage()

  await userEvent.click(screen.getByRole('button', { name: 'CSV 내려받기' }))

  await waitFor(() => expect(saved).toHaveLength(1))
  expect(saved[0].name).toBe('dongtanpass-passes.csv')
})

test('CSV를 받다가 꺼진 학원이라는 답이 오면 목록 대신 서버의 안내만 보여 준다', async () => {
  mockLedger()
  mockApi({
    [EXPORT]: () =>
      problemResponse(403, {
        detail: '이용이 중지된 학원입니다.',
        code: 'DONGTANPASS_PARTNER_INACTIVE',
      }),
  })
  const saved = captureSave()
  await openPage()

  await userEvent.click(screen.getByRole('button', { name: 'CSV 내려받기' }))

  expect(await screen.findByText('이용이 중지된 학원입니다.')).toBeInTheDocument()
  expect(screen.queryByRole('list', { name: '패스 목록' })).not.toBeInTheDocument()
  expect(saved).toEqual([])
})

async function openLinkDialog() {
  await userEvent.click(
    screen.getByRole('button', { name: '링크 새로 만들기 (김도윤, DT-7KQ4MX)' }),
  )
  return screen.findByRole('dialog', { name: '링크를 새로 만들까요?' })
}

test('링크를 새로 만들면 같은 창에서 새 링크를 보여 주고 "링크 복사"로 포커스를 옮긴다', async () => {
  mockLedger()
  mockApi({ [link(1)]: () => jsonResponse({ id: 1, linkToken: 'newToken123' }) })
  await openPage()

  const dialog = await openLinkDialog()
  expect(within(dialog).getByText(/예전 링크는 더 쓸 수 없게 돼요/)).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: '새로 만들기' }))

  const done = await screen.findByRole('dialog', { name: '새 링크를 만들었어요' })
  expect(within(done).getByLabelText('학부모 링크')).toHaveValue(
    `${window.location.origin}/p/newToken123`,
  )
  await waitFor(() => expect(within(done).getByRole('button', { name: '링크 복사' })).toHaveFocus())
  const { headers, body } = requestOf(link(1))
  expect(headers.get('Idempotency-Key')).toBeTruthy()
  expect(body).toBeUndefined()

  // 닫았다 다시 열면 확인부터 다시 한다. 앞 링크는 남지 않는다.
  await userEvent.click(within(done).getByRole('button', { name: '닫기' }))
  const again = await openLinkDialog()
  expect(within(again).queryByLabelText('학부모 링크')).not.toBeInTheDocument()
})

test('링크 응답을 받지 못하면 그대로 다시 누르게 하고, 다시 보낼 때 같은 키를 싣는다', async () => {
  mockLedger()
  mockApi({ [link(1)]: () => unreadableResponse() })
  await openPage()

  const dialog = await openLinkDialog()
  await userEvent.click(within(dialog).getByRole('button', { name: '새로 만들기' }))

  expect(
    await within(dialog).findByText(/그대로 다시 누르면 같은 링크를 받아요/),
  ).toBeInTheDocument()
  const firstKey = requestOf(link(1)).headers.get('Idempotency-Key')

  mockApi({ [link(1)]: () => jsonResponse({ id: 1, linkToken: 'newToken123' }) })
  await userEvent.click(within(dialog).getByRole('button', { name: '새로 만들기' }))

  await screen.findByRole('dialog', { name: '새 링크를 만들었어요' })
  expect(requestOf(link(1)).headers.get('Idempotency-Key')).toBe(firstKey)
  expect(count(link(1))).toBe(2)
})

test('링크 응답을 못 받은 뒤 창을 닫았다 같은 패스로 열어도 같은 키를, 만든 뒤에는 새 키를 쓴다', async () => {
  mockLedger()
  mockApi({ [link(1)]: () => unreadableResponse() })
  await openPage()

  let dialog = await openLinkDialog()
  await userEvent.click(within(dialog).getByRole('button', { name: '새로 만들기' }))
  await within(dialog).findByText(/그대로 다시 누르면 같은 링크를 받아요/)
  const firstKey = requestOf(link(1)).headers.get('Idempotency-Key')
  await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }))

  mockApi({ [link(1)]: () => jsonResponse({ id: 1, linkToken: 'tokenA' }) })
  dialog = await openLinkDialog()
  await userEvent.click(within(dialog).getByRole('button', { name: '새로 만들기' }))
  const made = await screen.findByRole('dialog', { name: '새 링크를 만들었어요' })
  // 처음 요청이 서버에서 끝났다면 이 키로 그 응답을 받는다. 링크가 두 번 바뀌지 않는다.
  expect(requestOf(link(1)).headers.get('Idempotency-Key')).toBe(firstKey)
  await userEvent.click(within(made).getByRole('button', { name: '닫기' }))

  // 새로 누르는 것이다. 같은 키면 서버가 옛 응답(tokenA)을 돌려준다.
  mockApi({ [link(1)]: () => jsonResponse({ id: 1, linkToken: 'tokenB' }) })
  dialog = await openLinkDialog()
  await userEvent.click(within(dialog).getByRole('button', { name: '새로 만들기' }))
  await screen.findByRole('dialog', { name: '새 링크를 만들었어요' })
  expect(requestOf(link(1)).headers.get('Idempotency-Key')).not.toBe(firstKey)
})

test('그 사이 사용된 패스라는 답이면 알리고 목록을 다시 받는다', async () => {
  mockLedger()
  mockApi({
    [link(1)]: () =>
      problemResponse(409, {
        detail: '이미 사용된 패스입니다.',
        code: 'DONGTANPASS_PASS_ALREADY_REDEEMED',
      }),
  })
  await openPage()

  const dialog = await openLinkDialog()
  await userEvent.click(within(dialog).getByRole('button', { name: '새로 만들기' }))

  expect(
    await within(dialog).findByText('이미 사용된 패스입니다. 목록을 새로 불러왔어요.'),
  ).toBeInTheDocument()
  await waitFor(() => expect(count(LEDGER)).toBe(2))
})

async function openCancelDialog(name = '패스 취소 (김도윤, DT-7KQ4MX)') {
  await userEvent.click(screen.getByRole('button', { name }))
  return screen.findByRole('dialog', { name: '패스를 취소할까요?' })
}

test('취소하면 확인 창에서 환불을 안내하고, 취소한 뒤 안내를 남기고 목록을 다시 받는다', async () => {
  mockLedger()
  mockApi({ [cancel(2)]: () => jsonResponse({ id: 2, state: 'CANCELED' }) })
  await openPage()

  const dialog = await openCancelDialog('패스 취소 (이서준, DT-EXP001)')
  expect(within(dialog).getByText(/되돌릴 수 없고/)).toBeInTheDocument()
  expect(within(dialog).getByText(/학원에서 따로 환불해 주세요/)).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: '패스 취소하기' }))

  const notice = await screen.findByText(
    '이서준 학생의 패스(DT-EXP001)를 취소했어요. 결제 환불은 학원에서 따로 해 주세요.',
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  // 누른 버튼이 사라지므로 포커스를 남긴 안내로 옮긴다(Chrome에서는 창이 닫힌 다음 차례에 옮겨야 한다).
  await waitFor(() => expect(notice.parentElement).toHaveFocus())
  expect(requestOf(cancel(2)).headers.get('Idempotency-Key')).toBeTruthy()
  await waitFor(() => expect(count(LEDGER)).toBe(2))
})

test('취소 응답을 받지 못하면 창을 열어 둔 채 다시 누르게 하고, 같은 키로 다시 보낸다', async () => {
  mockLedger()
  mockApi({ [cancel(1)]: () => unreadableResponse() })
  await openPage()

  const dialog = await openCancelDialog()
  await userEvent.click(within(dialog).getByRole('button', { name: '패스 취소하기' }))

  expect(await within(dialog).findByText(/그대로 다시 눌러도 한 번만 취소돼요/)).toBeInTheDocument()
  // 취소됐을 수도 있으니 목록은 다시 받는다.
  await waitFor(() => expect(count(LEDGER)).toBe(2))
  const firstKey = requestOf(cancel(1)).headers.get('Idempotency-Key')

  mockApi({ [cancel(1)]: () => jsonResponse({ id: 1, state: 'CANCELED' }) })
  await userEvent.click(within(dialog).getByRole('button', { name: '패스 취소하기' }))

  await screen.findByText(/김도윤 학생의 패스\(DT-7KQ4MX\)를 취소했어요/)
  expect(requestOf(cancel(1)).headers.get('Idempotency-Key')).toBe(firstKey)
})

test('취소한 안내는 다른 조건으로 옮기면 지운다', async () => {
  mockLedger()
  mockApi({ [cancel(1)]: () => jsonResponse({ id: 1, state: 'CANCELED' }) })
  await openPage()

  const dialog = await openCancelDialog()
  await userEvent.click(within(dialog).getByRole('button', { name: '패스 취소하기' }))
  await screen.findByText(/취소했어요/)

  await userEvent.click(screen.getByRole('radio', { name: '발급 취소' }))
  await waitFor(() => expect(screen.queryByText(/취소했어요/)).not.toBeInTheDocument())
})

test('취소가 실패하면 목록을 다시 받는 것을 기다리지 않고 바로 알리고 창을 풀어 준다', async () => {
  let ledgerCalls = 0
  mockApi({
    // 다시 받기는 끝나지 않는다(느린 서버, 다시 보내는 중).
    [LEDGER]: () =>
      ++ledgerCalls === 1 ? jsonResponse(page([issued])) : new Promise<Response>(() => {}),
    [cancel(1)]: () => Promise.reject(new TypeError('Failed to fetch')),
  })
  await openPage()

  const dialog = await openCancelDialog()
  await userEvent.click(within(dialog).getByRole('button', { name: '패스 취소하기' }))

  expect(await within(dialog).findByText(/취소됐는지 확인하지 못했어요/)).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: '닫기' })).toBeEnabled()
  expect(within(dialog).getByRole('button', { name: '패스 취소하기' })).toBeEnabled()
})

test('이미 취소된 패스라는 답이면 알리고 목록을 다시 받으며, 창을 닫았다 열면 그 안내는 남지 않는다', async () => {
  mockLedger()
  mockApi({
    [cancel(1)]: () =>
      problemResponse(409, {
        detail: '이미 취소된 패스입니다.',
        code: 'DONGTANPASS_PASS_CANCELED',
      }),
  })
  await openPage()

  const dialog = await openCancelDialog()
  await userEvent.click(within(dialog).getByRole('button', { name: '패스 취소하기' }))

  expect(
    await within(dialog).findByText('이미 취소된 패스입니다. 목록을 새로 불러왔어요.'),
  ).toBeInTheDocument()
  await waitFor(() => expect(count(LEDGER)).toBe(2))

  await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
  const again = await openCancelDialog()
  expect(within(again).queryByText(/이미 취소된 패스입니다/)).not.toBeInTheDocument()
})
