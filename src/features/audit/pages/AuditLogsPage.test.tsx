import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import type { Campus } from '@/shared/campus'
import {
  jsonResponse,
  mockApi,
  problemResponse,
  requests,
  setupMockApi,
  unreadableResponse,
} from '@/test/mockApi'
import { admin, partner, renderApp, staff } from '@/test/renderApp'
import type { AuditLog, AuditLogPage } from '../api'

setupMockApi()

const PATH = '/admin/audit-logs'

const campuses: Campus[] = [
  { id: 1, name: '동탄관' },
  { id: 2, name: '능동관' },
]

function logOf(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 1,
    occurredAt: '2026-10-11T15:38:00Z',
    actorId: 1,
    action: 'member.student-registered',
    outcome: 'DONE',
    targetType: 'student',
    targetId: 12,
    campusId: 1,
    detail: null,
    ...overrides,
  }
}

// 직원(계정 2)이 학부모를 연결했다.
const linked = logOf({
  id: 3,
  actorId: 2,
  action: 'member.guardian-linked',
  targetType: 'guardian',
  targetId: 9,
  campusId: 2,
  detail: { guardianId: 9, linkedToExisting: false },
})
// 거부된 시도. 대상도 지점도 내용도 없다.
const limited = logOf({
  id: 2,
  actorId: 2,
  action: 'member.phone-probe-limited',
  outcome: 'DENIED',
  targetType: null,
  targetId: null,
  campusId: null,
})
const registered = logOf()

function pageOf(items: AuditLog[], overrides: Partial<AuditLogPage> = {}): AuditLogPage {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: 1, ...overrides }
}

type Respond = (query: URLSearchParams) => AuditLogPage | Response | Promise<AuditLogPage>

/** 지점 조회를 흉내 내고, 기록은 받은 쿼리로 응답을 만든다. */
function mockLogs(respond: Respond) {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/audit-logs': async ({ query }) => {
      const result = await respond(query)
      return result instanceof Response ? result : jsonResponse(result)
    },
  })
}

/** 기록 요청들의 쿼리 문자열 */
function logQueries() {
  return requests()
    .filter((key) => key.startsWith('GET /api/v1/audit-logs'))
    .map((key) => key.split('?')[1] ?? '')
}

/** 마지막 기록 요청의 조건 */
function lastQuery() {
  const query: Record<string, string> = {}
  new URLSearchParams(logQueries().at(-1)).forEach((value, key) => {
    query[key] = value
  })
  return query
}

function bodyRows() {
  const [, ...rows] = within(screen.getByRole('table', { name: '기록 목록' })).getAllByRole('row')
  return rows
}

function cellsOf(row: HTMLElement) {
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent)
}

async function table() {
  return screen.findByRole('table', { name: '기록 목록' })
}

/** 응답을 붙잡아 두었다가 원할 때 보낸다. */
function hold() {
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  return { held, release }
}

// ── 들어가기 ─────────────────────────────────────────────

test('관리자는 기록 탭으로 들어와 최신순 기록을 한국 시각과 뜻으로 본다', async () => {
  mockLogs(() => pageOf([linked, limited, registered]))
  const { router } = renderApp('/desk/dongtanpass', { me: admin })

  await userEvent.click(await screen.findByRole('link', { name: '기록' }))

  await table()
  expect(router.state.location.pathname).toBe(PATH)
  expect(screen.getByRole('link', { name: '기록' })).toHaveAttribute('aria-current', 'page')
  // 조건 없이 한 번만 묻는다.
  expect(logQueries()).toEqual([''])
  expect(screen.getByText('전체 3건')).toBeInTheDocument()
  await waitFor(() =>
    expect(bodyRows().map(cellsOf)).toEqual([
      [
        '2026.10.12 00:38:00',
        '계정 2이 계정만',
        '학부모 연결',
        '한 일',
        '학부모 9이 대상만',
        '능동관',
        'guardianId: 9linkedToExisting: false',
      ],
      [
        '2026.10.12 00:38:00',
        '계정 2이 계정만',
        '있는 번호 거부 한도에 막힘',
        '거부',
        '-',
        '-',
        '-',
      ],
      [
        '2026.10.12 00:38:00',
        '계정 1 (나)이 계정만',
        '학생 등록',
        '한 일',
        '학생 12이 대상만',
        '동탄관',
        '-',
      ],
    ]),
  )
})

test.each([
  ['직원', staff],
  ['연계 학원', partner],
])('%s는 기록 화면을 볼 수 없고 요청도 나가지 않는다', async (_name, me) => {
  renderApp(PATH, { me })

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '기록' })).not.toBeInTheDocument()
  expect(logQueries()).toEqual([])
})

// ── 표의 값 ─────────────────────────────────────────────

test('대상이 학생이면 학생 상세로 가는 링크다. 학부모는 글자만 보여준다', async () => {
  mockLogs(() => pageOf([linked, registered]))
  renderApp(PATH, { me: admin })

  await table()
  expect(screen.getByRole('link', { name: '학생 12' })).toHaveAttribute('href', '/desk/students/12')
  expect(screen.getByText('학부모 9')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '학부모 9' })).not.toBeInTheDocument()
})

test('모르는 행위·대상·지점은 받은 값을 그대로 보여준다', async () => {
  mockLogs(() =>
    pageOf([
      logOf({
        action: 'billing.invoice-created',
        targetType: 'invoice',
        targetId: 7,
        campusId: 99,
        occurredAt: '언젠가',
      }),
    ]),
  )
  renderApp(PATH, { me: admin })

  await table()
  await waitFor(() =>
    expect(cellsOf(bodyRows()[0])).toEqual([
      '언젠가',
      '계정 1 (나)이 계정만',
      'billing.invoice-created',
      '한 일',
      'invoice 7이 대상만',
      '지점 99',
      '-',
    ]),
  )
})

test('로그인 없이 일어난 일은 계정 자리에 그렇게 적고, 거르는 링크를 두지 않는다', async () => {
  mockLogs(() => pageOf([logOf({ actorId: null, targetType: 'student', targetId: null })]))
  renderApp(PATH, { me: admin })

  await table()
  const cells = cellsOf(bodyRows()[0])
  expect(cells[1]).toBe('로그인 없음')
  // 대상의 ID가 없으면 종류만 보여주고 링크를 두지 않는다.
  expect(cells[4]).toBe('학생')
  expect(screen.queryByRole('link', { name: /만 보기/ })).not.toBeInTheDocument()
})

test('손상된 기록은 눈에 띄게, 싣지 못한 내용은 문장으로 보여준다', async () => {
  mockLogs(() =>
    pageOf([
      logOf({ id: 1, detail: { corrupted: true } }),
      logOf({ id: 2, detail: { redacted: true } }),
      logOf({ id: 3, detail: { phoneChanged: true } }),
    ]),
  )
  renderApp(PATH, { me: admin })

  await table()
  // 색만이 아니라 강조(strong)로 그려 화면 낭독기에도 전해진다.
  expect(screen.getByText('기록이 손상됐어요').tagName).toBe('STRONG')
  expect(screen.getByText('개인정보로 보이는 값이 있어 내용을 뺐어요').tagName).toBe('SPAN')
  expect(screen.getByText('phoneChanged: true')).toBeInTheDocument()
})

test('지점 이름을 받지 못하면 알리고 지점을 번호로 보여준다. 다시 불러오면 이름이 나온다', async () => {
  let fail = true
  mockApi({
    'GET /api/v1/campuses': () =>
      fail ? problemResponse(403, { detail: '권한이 없습니다.' }) : jsonResponse(campuses),
    'GET /api/v1/audit-logs': () => jsonResponse(pageOf([registered])),
  })
  renderApp(PATH, { me: admin })

  await table()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '지점 이름을 불러오지 못했어요. 표의 지점이 번호로 보여요.',
  )
  expect(cellsOf(bodyRows()[0])[5]).toBe('지점 1')

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '지점 다시 불러오기' }))

  await waitFor(() => expect(cellsOf(bodyRows()[0])[5]).toBe('동탄관'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('지점 이름을 받는 동안에도 지점과 무관한 기록(-)과 구분되게 번호로 보여준다', async () => {
  const { held, release } = hold()
  mockApi({
    'GET /api/v1/campuses': async () => {
      await held
      return jsonResponse(campuses)
    },
    'GET /api/v1/audit-logs': () => jsonResponse(pageOf([registered, limited])),
  })
  renderApp(PATH, { me: admin })

  await table()
  expect(bodyRows().map((row) => cellsOf(row)[5])).toEqual(['지점 1', '-'])

  release()

  await waitFor(() => expect(cellsOf(bodyRows()[0])[5]).toBe('동탄관'))
})

// ── 조건 ─────────────────────────────────────────────

test('결과를 고르면 바로 그 결과만 묻고 주소에 남긴다', async () => {
  mockLogs((query) => pageOf(query.get('outcome') === 'DENIED' ? [limited] : [linked, limited]))
  const { router } = renderApp(PATH, { me: admin })
  await table()

  await userEvent.click(screen.getByRole('radio', { name: '거부' }))

  await waitFor(() => expect(bodyRows()).toHaveLength(1))
  expect(lastQuery()).toEqual({ outcome: 'DENIED' })
  expect(router.state.location.search).toBe('?outcome=DENIED')

  await userEvent.click(screen.getByRole('radio', { name: '전체' }))

  await waitFor(() => expect(bodyRows()).toHaveLength(2))
  expect(router.state.location.search).toBe('')
})

test('계정·행위·기간은 조회를 눌러야 적용된다. 기간은 끝일 다음 날 0시 전까지로 보낸다', async () => {
  mockLogs(() => pageOf([linked]))
  const { router } = renderApp(PATH, { me: admin })
  await table()

  await userEvent.type(screen.getByLabelText('계정 ID'), '2')
  await userEvent.selectOptions(screen.getByLabelText('행위'), '학부모 연결')
  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-10-01' } })
  fireEvent.change(screen.getByLabelText('끝일'), { target: { value: '2026-10-31' } })
  // 아직 묻지 않았다.
  expect(logQueries()).toEqual([''])

  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  await waitFor(() => expect(logQueries()).toHaveLength(2))
  expect(lastQuery()).toEqual({
    actorId: '2',
    action: 'member.guardian-linked',
    from: '2026-10-01T00:00:00+09:00',
    to: '2026-11-01T00:00:00+09:00',
  })
  // 시각의 +는 %2B로 실려 간다. 그대로 가면 서버가 공백으로 읽는다.
  expect(logQueries().at(-1)).toContain('from=2026-10-01T00%3A00%3A00%2B09%3A00')
  // 주소에는 고른 날짜 그대로 둔다.
  expect(router.state.location.search).toBe(
    '?actorId=2&action=member.guardian-linked&from=2026-10-01&to=2026-10-31',
  )
})

test('계정 ID 칸에서 Enter를 눌러도 조회된다', async () => {
  mockLogs(() => pageOf([linked]))
  renderApp(PATH, { me: admin })
  await table()

  await userEvent.type(screen.getByLabelText('계정 ID'), '2{Enter}')

  await waitFor(() => expect(lastQuery()).toEqual({ actorId: '2' }))
})

test('결과를 고를 때 입력칸에 넣다 만 값도 함께 적용한다', async () => {
  mockLogs(() => pageOf([limited]))
  renderApp(PATH, { me: admin })
  await table()

  await userEvent.type(screen.getByLabelText('계정 ID'), '2')
  await userEvent.click(screen.getByRole('radio', { name: '거부' }))

  await waitFor(() => expect(lastQuery()).toEqual({ outcome: 'DENIED', actorId: '2' }))
})

test.each<[string, { actorId?: string; from?: string; to?: string }, string]>([
  ['계정 ID가 숫자가 아님', { actorId: 'admin' }, '계정 ID는 1 이상의 숫자로 넣어 주세요.'],
  ['계정 ID가 0', { actorId: '0' }, '계정 ID는 1 이상의 숫자로 넣어 주세요.'],
  ['끝일이 시작일보다 앞', { from: '2026-10-12', to: '2026-10-11' }, '끝일이 시작일보다 앞이에요.'],
  ['받는 범위 밖의 날짜', { from: '1999-12-31' }, '날짜를 확인해 주세요.'],
])('%s: 안내하고 묻지 않는다', async (_name, input, message) => {
  mockLogs(() => pageOf([linked]))
  const { router } = renderApp(PATH, { me: admin })
  await table()

  if (input.actorId) await userEvent.type(screen.getByLabelText('계정 ID'), input.actorId)
  if (input.from) {
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: input.from } })
  }
  if (input.to) fireEvent.change(screen.getByLabelText('끝일'), { target: { value: input.to } })
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  expect(await screen.findByText(message)).toBeInTheDocument()
  expect(logQueries()).toEqual([''])
  expect(router.state.location.search).toBe('')

  // 결과를 골라도 틀린 값이 있으면 적용하지 않는다.
  await userEvent.click(screen.getByRole('radio', { name: '거부' }))
  expect(logQueries()).toEqual([''])
  expect(screen.getByRole('radio', { name: '전체' })).toBeChecked()
})

test('시작일과 끝일이 같은 날이면 그 하루를 묻는다', async () => {
  mockLogs(() => pageOf([linked]))
  renderApp(PATH, { me: admin })
  await table()

  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-10-12' } })
  fireEvent.change(screen.getByLabelText('끝일'), { target: { value: '2026-10-12' } })
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  await waitFor(() =>
    expect(lastQuery()).toEqual({
      from: '2026-10-12T00:00:00+09:00',
      to: '2026-10-13T00:00:00+09:00',
    }),
  )
})

test('주소의 조건으로 묻고 입력칸에도 그 값을 보여준다', async () => {
  mockLogs(() => pageOf([limited], { page: 2, totalPages: 3, totalElements: 41 }))
  renderApp(
    `${PATH}?outcome=DENIED&actorId=2&action=member.phone-probe-limited&from=2026-10-01&to=2026-10-12&page=2`,
    { me: admin },
  )

  await table()
  expect(lastQuery()).toEqual({
    outcome: 'DENIED',
    actorId: '2',
    action: 'member.phone-probe-limited',
    from: '2026-10-01T00:00:00+09:00',
    to: '2026-10-13T00:00:00+09:00',
    page: '2',
  })
  expect(screen.getByRole('radio', { name: '거부' })).toBeChecked()
  expect(screen.getByLabelText('계정 ID')).toHaveValue('2')
  expect(screen.getByLabelText('행위')).toHaveDisplayValue('있는 번호 거부 한도에 막힘')
  expect(screen.getByLabelText('시작일')).toHaveValue('2026-10-01')
  expect(screen.getByLabelText('끝일')).toHaveValue('2026-10-12')
})

test('주소의 모양이 맞지 않는 값은 없는 조건으로 본다', async () => {
  mockLogs(() => pageOf([linked]))
  renderApp(
    `${PATH}?outcome=ALL&actorId=abc&action=${encodeURIComponent('학생 등록')}&targetId=5&from=2026-02-30&to=어제&page=-1&size=1000`,
    { me: admin },
  )

  await table()
  // 대상의 ID만 있으면 서버가 거부하므로 보내지 않는다.
  expect(logQueries()).toEqual([''])
  expect(screen.getByRole('radio', { name: '전체' })).toBeChecked()
  expect(screen.queryByText(/기록만 보고 있어요/)).not.toBeInTheDocument()
})

test('주소의 행위가 모르는 이름이어도 선택 상자에 고른 것으로 보여준다', async () => {
  mockLogs(() => pageOf([logOf({ action: 'billing.invoice-created' })]))
  renderApp(`${PATH}?action=billing.invoice-created`, { me: admin })

  await table()
  expect(lastQuery()).toEqual({ action: 'billing.invoice-created' })
  expect(screen.getByLabelText('행위')).toHaveDisplayValue('billing.invoice-created')
})

test('"이 계정만"을 누르면 그 계정으로 거르고 입력칸에도 넣는다. 다른 조건은 남긴다', async () => {
  mockLogs((query) => pageOf(query.get('actorId') === '2' ? [limited] : [limited, registered]))
  const { router } = renderApp(`${PATH}?outcome=DENIED&page=1`, { me: admin })
  await table()

  await userEvent.click(screen.getByRole('link', { name: '이 계정만 보기 (계정 2)' }))

  await waitFor(() => expect(bodyRows()).toHaveLength(1))
  // 조건이 바뀌었으므로 첫 페이지부터 본다.
  expect(router.state.location.search).toBe('?outcome=DENIED&actorId=2')
  expect(screen.getByLabelText('계정 ID')).toHaveValue('2')
  // 이미 그 계정으로 거른 뒤에는 링크를 두지 않는다.
  expect(screen.queryByRole('link', { name: '이 계정만 보기 (계정 2)' })).not.toBeInTheDocument()
})

test('"이 대상만"을 누르면 그 대상으로 거르고, 걸려 있다는 것과 푸는 링크를 보여준다', async () => {
  mockLogs((query) => pageOf(query.get('targetId') ? [linked] : [linked, registered]))
  const { router } = renderApp(PATH, { me: admin })
  await table()

  await userEvent.click(screen.getByRole('link', { name: '이 대상만 보기 (학부모 9)' }))

  await waitFor(() => expect(bodyRows()).toHaveLength(1))
  expect(lastQuery()).toEqual({ targetType: 'guardian', targetId: '9' })
  expect(screen.getByText('학부모 9의 기록만 보고 있어요.')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '이 대상만 보기 (학부모 9)' })).not.toBeInTheDocument()

  // 조회를 다시 눌러도 대상 조건은 남는다.
  await userEvent.type(screen.getByLabelText('계정 ID'), '2')
  await userEvent.click(screen.getByRole('button', { name: '조회' }))
  await waitFor(() =>
    expect(lastQuery()).toEqual({ targetType: 'guardian', targetId: '9', actorId: '2' }),
  )

  await userEvent.click(screen.getByRole('link', { name: '대상 조건 풀기' }))

  await waitFor(() => expect(router.state.location.search).toBe('?actorId=2'))
  expect(screen.queryByText(/기록만 보고 있어요/)).not.toBeInTheDocument()
})

test('조건 지우기는 모든 조건을 풀고 입력칸도 비운다', async () => {
  mockLogs(() => pageOf([linked]))
  const { router } = renderApp(`${PATH}?outcome=DONE&actorId=2&targetType=guardian&targetId=9`, {
    me: admin,
  })
  await table()

  await userEvent.click(screen.getByRole('link', { name: '조건 지우기' }))

  await waitFor(() => expect(logQueries().at(-1)).toBe(''))
  expect(router.state.location.search).toBe('')
  expect(screen.getByLabelText('계정 ID')).toHaveValue('')
  expect(screen.getByRole('radio', { name: '전체' })).toBeChecked()
  // 조건이 없으면 지우기 링크도 없다.
  expect(screen.queryByRole('link', { name: '조건 지우기' })).not.toBeInTheDocument()
})

// ── 페이지 ─────────────────────────────────────────────

test('조회를 누르면 보던 페이지가 아니라 첫 페이지부터 본다', async () => {
  mockLogs(() => pageOf([linked], { page: 1, totalPages: 2, totalElements: 21 }))
  const { router } = renderApp(`${PATH}?page=1`, { me: admin })
  await table()

  await userEvent.type(screen.getByLabelText('계정 ID'), '2')
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  await waitFor(() => expect(router.state.location.search).toBe('?actorId=2'))
  expect(lastQuery()).toEqual({ actorId: '2' })
})

test('페이지를 넘기면 조건은 그대로 두고 그 페이지를 묻는다', async () => {
  mockLogs((query) =>
    pageOf([query.get('page') === '1' ? registered : linked], {
      page: Number(query.get('page') ?? 0),
      totalPages: 2,
      totalElements: 21,
    }),
  )
  const { router } = renderApp(`${PATH}?outcome=DONE`, { me: admin })
  await table()

  await userEvent.click(screen.getByRole('button', { name: '다음' }))

  await waitFor(() => expect(cellsOf(bodyRows()[0])[2]).toBe('학생 등록'))
  expect(lastQuery()).toEqual({ outcome: 'DONE', page: '1' })
  expect(router.state.location.search).toBe('?outcome=DONE&page=1')
})

test('없는 페이지로 들어오면 기록이 없다고 하지 않고 첫 페이지로 보낸다', async () => {
  mockLogs((query) =>
    query.get('page') === '9'
      ? pageOf([], { page: 9, totalPages: 1, totalElements: 2 })
      : pageOf([linked, registered]),
  )
  const { router } = renderApp(`${PATH}?outcome=DONE&page=9`, { me: admin })

  expect(
    await screen.findByRole('heading', { name: '이 페이지에는 기록이 없어요' }),
  ).toBeInTheDocument()
  expect(screen.getByText('조건에 맞는 기록은 모두 2건이에요.')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('link', { name: '첫 페이지로' }))

  await table()
  expect(router.state.location.search).toBe('?outcome=DONE')
})

test.each([
  ['조건 없이', PATH, '남은 기록이 없어요'],
  ['조건을 걸고', `${PATH}?outcome=DENIED`, '조건에 맞는 기록이 없어요'],
])('%s 기록이 하나도 없을 때의 안내', async (_name, path, title) => {
  mockLogs(() => pageOf([]))
  renderApp(path, { me: admin })

  expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

// ── 실패 ─────────────────────────────────────────────

test('불러오지 못하면 서버의 안내를 보여주고, 다시 불러오면 표가 나온다', async () => {
  let fail = true
  mockLogs(() =>
    fail
      ? problemResponse(403, { detail: '권한이 없습니다.', code: 'COMMON_FORBIDDEN' })
      : pageOf([linked]),
  )
  renderApp(PATH, { me: admin })

  expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

  await table()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('주소의 기간이 거꾸로면 서버의 거부를 기간을 고치라는 안내로 보여준다', async () => {
  mockLogs(() =>
    problemResponse(400, {
      detail: '조회 기간이 올바르지 않습니다.',
      code: 'AUDIT_INVALID_PERIOD',
    }),
  )
  renderApp(`${PATH}?from=2026-10-12&to=2026-10-01`, { me: admin })

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '끝일이 시작일보다 앞이에요. 기간 칸을 고친 뒤 조회해 주세요.',
  )
  // 입력칸에는 주소의 값이 그대로 보여 어디를 고칠지 알 수 있다.
  expect(screen.getByLabelText('시작일')).toHaveValue('2026-10-12')
  expect(screen.getByLabelText('끝일')).toHaveValue('2026-10-01')
  // 다시 불러와도 같은 답이다.
  expect(screen.queryByRole('button', { name: '다시 불러오기' })).not.toBeInTheDocument()
})

// ── 받는 동안 ─────────────────────────────────────────────

test('다음 페이지를 받는 동안에는 이전 페이지를 흐리게 보여준다', async () => {
  const { held, release } = hold()
  mockLogs(async (query) => {
    if (query.get('page') !== '1') return pageOf([linked], { totalPages: 2, totalElements: 21 })
    await held
    return pageOf([registered], { page: 1, totalPages: 2, totalElements: 21 })
  })
  renderApp(PATH, { me: admin })
  await table()

  await userEvent.click(screen.getByRole('button', { name: '다음' }))

  await waitFor(() => expect(logQueries()).toHaveLength(2))
  expect(cellsOf(bodyRows()[0])[2]).toBe('학부모 연결')
  expect(screen.getByRole('table').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()

  release()

  await waitFor(() => expect(cellsOf(bodyRows()[0])[2]).toBe('학생 등록'))
  expect(screen.getByRole('table').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false')
})

test('조건을 바꾸면 새 결과를 받을 때까지 이전 조건의 기록을 보여주지 않는다', async () => {
  const { held, release } = hold()
  mockLogs(async (query) => {
    if (!query.get('outcome')) return pageOf([linked])
    await held
    return pageOf([limited])
  })
  renderApp(PATH, { me: admin })
  await table()

  await userEvent.click(screen.getByRole('radio', { name: '거부' }))

  expect(await screen.findByText('기록을 불러오고 있어요.')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()

  release()

  await table()
  expect(cellsOf(bodyRows()[0])[3]).toBe('거부')
})

// ── 조건이 남고 풀리는 것 ─────────────────────────────────────────────

test('조회를 눌러도 결과 조건은 남는다', async () => {
  mockLogs(() => pageOf([limited]))
  renderApp(`${PATH}?outcome=DENIED`, { me: admin })
  await table()

  await userEvent.type(screen.getByLabelText('계정 ID'), '2')
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  await waitFor(() => expect(lastQuery()).toEqual({ outcome: 'DENIED', actorId: '2' }))
  expect(screen.getByRole('radio', { name: '거부' })).toBeChecked()
})

test('입력칸을 비우고 조회하면 그 조건이 풀린다', async () => {
  mockLogs(() => pageOf([linked]))
  const { router } = renderApp(
    `${PATH}?actorId=2&action=member.guardian-linked&from=2026-10-01&to=2026-10-12`,
    { me: admin },
  )
  await table()

  await userEvent.clear(screen.getByLabelText('계정 ID'))
  await userEvent.selectOptions(screen.getByLabelText('행위'), '전체')
  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '' } })
  fireEvent.change(screen.getByLabelText('끝일'), { target: { value: '' } })
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  await waitFor(() => expect(router.state.location.search).toBe(''))
  expect(lastQuery()).toEqual({})
})

test('"이 대상만"과 "대상 조건 풀기"는 다른 조건을 남기고 첫 페이지부터 본다', async () => {
  mockLogs((query) =>
    pageOf([linked], { page: Number(query.get('page') ?? 0), totalPages: 2, totalElements: 21 }),
  )
  const { router } = renderApp(`${PATH}?outcome=DONE&actorId=2&page=1`, { me: admin })
  await table()

  await userEvent.click(screen.getByRole('link', { name: '이 대상만 보기 (학부모 9)' }))

  await waitFor(() =>
    expect(lastQuery()).toEqual({
      outcome: 'DONE',
      actorId: '2',
      targetType: 'guardian',
      targetId: '9',
    }),
  )

  await userEvent.click(screen.getByRole('button', { name: '다음' }))
  await waitFor(() => expect(lastQuery().page).toBe('1'))
  await userEvent.click(screen.getByRole('link', { name: '대상 조건 풀기' }))

  await waitFor(() => expect(router.state.location.search).toBe('?outcome=DONE&actorId=2'))
})

test('넣다 만 값은 조건 지우기를 누르면 지워진다', async () => {
  mockLogs(() => pageOf([limited]))
  renderApp(`${PATH}?outcome=DENIED`, { me: admin })
  await table()

  await userEvent.type(screen.getByLabelText('계정 ID'), '5')
  await userEvent.click(screen.getByRole('link', { name: '조건 지우기' }))

  await waitFor(() => expect(screen.getByRole('radio', { name: '전체' })).toBeChecked())
  // 표는 전체 기록이다. 칸에 5가 남아 있으면 계정 5의 기록으로 읽힌다.
  expect(screen.getByLabelText('계정 ID')).toHaveValue('')
})

test('넣다 만 값과 오류 안내는 페이지를 넘기면 지워진다', async () => {
  mockLogs((query) =>
    pageOf([linked], { page: Number(query.get('page') ?? 0), totalPages: 2, totalElements: 21 }),
  )
  renderApp(`${PATH}?actorId=2`, { me: admin })
  await table()

  await userEvent.clear(screen.getByLabelText('계정 ID'))
  await userEvent.type(screen.getByLabelText('계정 ID'), 'abc')
  await userEvent.click(screen.getByRole('button', { name: '조회' }))
  expect(await screen.findByText('계정 ID는 1 이상의 숫자로 넣어 주세요.')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '다음' }))

  await waitFor(() => expect(lastQuery()).toEqual({ actorId: '2', page: '1' }))
  expect(screen.getByLabelText('계정 ID')).toHaveValue('2')
  expect(screen.queryByText('계정 ID는 1 이상의 숫자로 넣어 주세요.')).not.toBeInTheDocument()
})

test('틀린 값을 지금 조건과 같은 값으로 고쳐 조회하면 안내가 사라진다', async () => {
  mockLogs(() => pageOf([linked]))
  renderApp(`${PATH}?actorId=2`, { me: admin })
  await table()
  const input = screen.getByLabelText('계정 ID')

  await userEvent.clear(input)
  await userEvent.type(input, 'abc')
  await userEvent.click(screen.getByRole('button', { name: '조회' }))
  expect(await screen.findByText('계정 ID는 1 이상의 숫자로 넣어 주세요.')).toBeInTheDocument()

  await userEvent.clear(input)
  await userEvent.type(input, '2')
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  await waitFor(() =>
    expect(screen.queryByText('계정 ID는 1 이상의 숫자로 넣어 주세요.')).not.toBeInTheDocument(),
  )
})

test('뒤로 가면 조건과 입력칸이 그 전의 것으로 돌아온다', async () => {
  mockLogs(() => pageOf([linked]))
  const { router } = renderApp(PATH, { me: admin })
  await table()
  await userEvent.type(screen.getByLabelText('계정 ID'), '2')
  await userEvent.click(screen.getByRole('button', { name: '조회' }))
  await waitFor(() => expect(router.state.location.search).toBe('?actorId=2'))

  await router.navigate(-1)

  await waitFor(() => expect(screen.getByLabelText('계정 ID')).toHaveValue(''))
  expect(router.state.location.search).toBe('')
})

// ── 다시 조회 ─────────────────────────────────────────────

test('조건을 바꾸지 않고 조회를 누르면 새로 받는다. 받는 동안 버튼이 잠긴다', async () => {
  const gate = hold()
  let holding = false
  let items = [limited]
  mockLogs(async () => {
    const answer = pageOf(items)
    if (holding) await gate.held
    return answer
  })
  const { router } = renderApp(`${PATH}?outcome=DENIED&actorId=2`, { me: admin })
  await table()
  expect(logQueries()).toHaveLength(1)
  const keyBefore = router.state.location.key

  // 그동안 거부 기록이 하나 더 생겼다.
  items = [
    logOf({ id: 9, actorId: 2, action: 'member.phone-change-limited', outcome: 'DENIED' }),
    limited,
  ]
  holding = true
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  await waitFor(() => expect(logQueries()).toHaveLength(2))
  expect(screen.getByRole('button', { name: '조회 중' })).toBeDisabled()

  gate.release()

  await waitFor(() => expect(bodyRows()).toHaveLength(2))
  expect(screen.getByRole('button', { name: '조회' })).toBeEnabled()
  // 같은 주소를 기록에 또 쌓지 않는다.
  expect(router.state.location.key).toBe(keyBefore)
})

// ── 날짜 칸 ─────────────────────────────────────────────

test.each([
  ['시작일', '끝일'],
  ['끝일', '시작일'],
])('%s 칸에 날짜로 읽히지 않는 글자가 있으면 그 조건 없이 조회하지 않는다', async (bad, good) => {
  mockLogs(() => pageOf([linked]))
  renderApp(PATH, { me: admin })
  await table()

  // 브라우저는 달력에 없는 날짜(02-30)나 넣다 만 날짜를 빈 값으로 주고 badInput만 켠다.
  Object.defineProperty(screen.getByLabelText(bad), 'validity', {
    value: { badInput: true },
    configurable: true,
  })
  fireEvent.change(screen.getByLabelText(good), { target: { value: '2026-10-12' } })
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  expect(await screen.findByText('날짜를 확인해 주세요.')).toBeInTheDocument()
  expect(screen.getByLabelText(bad)).toBeInvalid()
  expect(logQueries()).toEqual([''])
})

test('끝일만 받는 범위 밖이어도 안내하고 묻지 않는다', async () => {
  mockLogs(() => pageOf([linked]))
  renderApp(PATH, { me: admin })
  await table()

  fireEvent.change(screen.getByLabelText('끝일'), { target: { value: '2100-01-01' } })
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  expect(await screen.findByText('날짜를 확인해 주세요.')).toBeInTheDocument()
  expect(logQueries()).toEqual([''])
})

// ── 주소의 값 ─────────────────────────────────────────────

test.each([
  ['actorId가 0', 'actorId=0'],
  ['actorId가 소수', 'actorId=1.5'],
  ['actorId가 지수 표기', 'actorId=1e3'],
  ['actorId가 음수', 'actorId=-1'],
  ['actorId가 16자리', 'actorId=1234567890123456'],
  ['page가 소수', 'page=1.5'],
  ['page가 지수 표기', 'page=1e3'],
  ['page가 7자리', 'page=1234567'],
  ['page가 서버의 상한을 넘음', 'page=10001'],
  ['action에 대문자', 'action=Member.x'],
  ['action이 점으로 시작', 'action=.x'],
  ['action이 101자', `action=${'a'.repeat(101)}`],
  ['outcome이 소문자', 'outcome=denied'],
  ['targetType에 대문자(ID도 함께 버린다)', 'targetType=Student&targetId=5'],
  ['targetType에 공백(ID도 함께 버린다)', 'targetType=a%20b&targetId=5'],
])('주소의 %s: 없는 조건으로 본다', async (_name, search) => {
  mockLogs(() => pageOf([linked]))
  renderApp(`${PATH}?${search}`, { me: admin })

  await table()
  expect(logQueries()).toEqual([''])
  expect(screen.queryByText(/기록만 보고 있어요/)).not.toBeInTheDocument()
})

test('주소의 값이 받는 범위의 끝이면 그대로 묻는다', async () => {
  // page는 서버가 받는 가장 큰 값(10000)이다.
  mockLogs(() => pageOf([], { page: 10000, totalPages: 1, totalElements: 1 }))
  renderApp(`${PATH}?actorId=123456789012345&page=10000`, { me: admin })

  await screen.findByRole('heading', { name: '이 페이지에는 기록이 없어요' })
  expect(lastQuery()).toEqual({ actorId: '123456789012345', page: '10000' })
})

test('주소에 대상의 종류만 있으면 종류로만 거른다', async () => {
  mockLogs(() => pageOf([linked]))
  renderApp(`${PATH}?targetType=guardian`, { me: admin })

  await table()
  expect(lastQuery()).toEqual({ targetType: 'guardian' })
  expect(screen.getByText('학부모의 기록만 보고 있어요.')).toBeInTheDocument()
})

test('주소의 행위가 all이면 그 이름의 행위를 찾는다. 선택 상자의 "전체"와 섞이지 않는다', async () => {
  mockLogs(() => pageOf([]))
  renderApp(`${PATH}?action=all`, { me: admin })

  await screen.findByRole('heading', { name: '조건에 맞는 기록이 없어요' })
  expect(lastQuery()).toEqual({ action: 'all' })
  expect(screen.getByLabelText('행위')).toHaveDisplayValue('all')
})

// ── 받다가 실패 ─────────────────────────────────────────────

test('다음 페이지를 받지 못하면 이전 페이지를 새 페이지처럼 두지 않고 알린다', async () => {
  let fail = true
  mockLogs((query) => {
    if (query.get('page') !== '1') return pageOf([linked], { totalPages: 2, totalElements: 21 })
    return fail
      ? problemResponse(403, { detail: '권한이 없습니다.', code: 'COMMON_FORBIDDEN' })
      : pageOf([registered], { page: 1, totalPages: 2, totalElements: 21 })
  })
  renderApp(PATH, { me: admin })
  await table()

  await userEvent.click(screen.getByRole('button', { name: '다음' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

  await table()
  expect(cellsOf(bodyRows()[0])[2]).toBe('학생 등록')
})

test('보던 표를 새로 받지 못하면 이전 내용일 수 있다는 것과 까닭을 알린다', async () => {
  let fail = false
  mockLogs(() =>
    fail
      ? problemResponse(403, { detail: '권한이 없습니다.', code: 'COMMON_FORBIDDEN' })
      : pageOf([linked]),
  )
  renderApp(PATH, { me: admin })
  await table()

  fail = true
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('최신 내용을 불러오지 못했어요. 아래 표는 이전 내용일 수 있어요.')
  expect(alert).toHaveTextContent('권한이 없습니다.')
  expect(bodyRows()).toHaveLength(1)

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(bodyRows()).toHaveLength(1)
})

test('기록을 읽지 못하면 안내 아래에 요청 번호를 보여준다', async () => {
  mockLogs(() => unreadableResponse('4b1d6c0e2f3a4b5c6d7e8f9012345678'))
  renderApp(PATH, { me: admin })

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '문의할 때 이 번호를 알려 주세요: 4b1d6c0e2f3a4b5c6d7e8f9012345678',
  )
})

test('지점 이름을 읽지 못하면 그 안내 아래에 요청 번호를 보여준다', async () => {
  mockLogs(() => pageOf([linked]))
  mockApi({ 'GET /api/v1/campuses': () => unreadableResponse('9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a49') })
  renderApp(PATH, { me: admin })

  const notice = await screen.findByText(/지점 이름을 불러오지 못했어요/)
  expect(notice.closest('[role="alert"]')).toHaveTextContent(
    '문의할 때 이 번호를 알려 주세요: 9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a49',
  )
})
