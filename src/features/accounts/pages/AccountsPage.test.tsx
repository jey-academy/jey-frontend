import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { PASSWORD_RULE_HINT } from '@/shared/auth'
import type { Campus } from '@/shared/campus'
import { setupDialog } from '@/test/dialog'
import {
  jsonResponse,
  mockApi,
  noContent,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
  unauthenticated,
  unreadableResponse,
} from '@/test/mockApi'
import { admin, partner, renderApp, staff } from '@/test/renderApp'
import type { Account, AccountPage } from '../api'

setupMockApi()
setupDialog()

const PATH = '/admin/settings/accounts'
const LIST = 'GET /api/v1/accounts'
const CREATE = 'POST /api/v1/accounts'

const campuses: Campus[] = [
  { id: 1, name: '동탄관' },
  { id: 2, name: '능동관' },
]

// renderApp의 admin(id 1)이 로그인한 사람이다.
const me: Account = {
  id: 1,
  loginId: 'admin',
  name: '김원장',
  role: 'ADMIN',
  campusId: null,
  status: 'ACTIVE',
  createdAt: '2026-10-01T00:00:00Z',
}
const desk: Account = {
  id: 2,
  loginId: 'desk.dongtan',
  name: '이데스크',
  role: 'STAFF',
  campusId: 1,
  status: 'ACTIVE',
  createdAt: '2026-10-02T00:00:00Z',
}
const left: Account = {
  id: 3,
  loginId: 'desk.old',
  name: '박퇴사',
  role: 'STAFF',
  campusId: 2,
  status: 'DISABLED',
  createdAt: '2026-10-03T00:00:00Z',
}
const academy: Account = {
  id: 4,
  loginId: 'partner1',
  name: '연계학원',
  role: 'PARTNER',
  campusId: null,
  status: 'ACTIVE',
  createdAt: '2026-10-04T00:00:00Z',
}

const PASSWORD = 'first-password-1'

function pageOf(items: Account[], overrides: Partial<AccountPage> = {}): AccountPage {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: 1, ...overrides }
}

/** 지점과 계정 목록 조회를 흉내 낸다. 목록은 호출할 때마다 `server.items`의 지금 값을 돌려준다. */
function mockList(items: Account[] = [me, desk, left, academy]) {
  const server = { items }
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    [LIST]: () => jsonResponse(pageOf(server.items)),
    ...mockDetails(server),
  })
  return server
}

/** 계정 하나의 조회(고치기 창이 열 때 부른다). 호출할 때마다 `server.items`에서 지금 값을 찾아 돌려준다. */
function mockDetails(server: { items: Account[] }) {
  return Object.fromEntries(
    server.items.map(({ id }) => [
      `GET /api/v1/accounts/${id}`,
      () => {
        const found = server.items.find((item) => item.id === id)
        return found
          ? jsonResponse(found)
          : problemResponse(404, { detail: '계정을 찾을 수 없습니다.', code: 'COMMON_NOT_FOUND' })
      },
    ]),
  )
}

/** 계정 목록 요청들의 쿼리 문자열 */
function listQueries() {
  return requests()
    .filter((key) => key.startsWith(LIST))
    .map((key) => key.split('?')[1] ?? '')
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

function table() {
  return screen.findByRole('table', { name: '계정 목록' })
}

function cellsOf(loginId: string) {
  return within(screen.getByRole('row', { name: new RegExp(`^${loginId} `) }))
    .getAllByRole('cell')
    .slice(0, 5)
    .map((cell) => cell.textContent)
}

async function open(button: string, dialogName: string) {
  await table()
  await userEvent.click(screen.getByRole('button', { name: button }))
  return screen.findByRole('dialog', { name: dialogName })
}

async function fill(dialog: HTMLElement, label: string, value: string) {
  const input = within(dialog).getByLabelText(label)
  await userEvent.clear(input)
  if (value) await userEvent.type(input, value)
}

function press(dialog: HTMLElement, name: string) {
  return userEvent.click(within(dialog).getByRole('button', { name }))
}

/** 고치기 창을 열고, 그 계정을 새로 받아 폼이 뜰 때까지 기다린다. */
async function openEdit(loginId: string) {
  const dialog = await open(`${loginId} 수정`, '계정 수정')
  await within(dialog).findByLabelText('이름')
  return dialog
}

function closed() {
  return waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

/** 만들기 창을 열고 직원 계정의 값을 채운다. */
async function fillNewStaff() {
  const dialog = await open('계정 만들기', '계정 만들기')
  await fill(dialog, '아이디', 'desk.new')
  await fill(dialog, '이름', '최신입')
  await fill(dialog, '처음 비밀번호', PASSWORD)
  await userEvent.selectOptions(within(dialog).getByLabelText('지점'), '능동관')
  return dialog
}

// ── 들어가기 ─────────────────────────────────────────────

test('관리자는 설정 메뉴의 계정으로 들어와 계정을 아이디, 이름, 역할, 지점, 상태로 본다', async () => {
  mockList()
  mockApi({ 'GET /api/v1/class-fees': () => jsonResponse([]) })
  const { router } = renderApp('/admin/settings/classes', { me: admin })
  const menu = await screen.findByRole('navigation', { name: '설정 메뉴' })

  await userEvent.click(within(menu).getByRole('link', { name: '계정' }))

  await table()
  expect(router.state.location.pathname).toBe(PATH)
  expect(within(menu).getByRole('link', { name: '계정' })).toHaveAttribute('aria-current', 'page')
  // 지점 이름은 따로 받아 붙인다.
  await waitFor(() =>
    expect(cellsOf('desk.dongtan')).toEqual([
      'desk.dongtan',
      '이데스크',
      '직원',
      '동탄관',
      '사용 중',
    ]),
  )
  // 관리자와 연계 학원은 지점이 없다. 내 줄에는 "나"가 붙는다.
  expect(cellsOf('admin')).toEqual(['admin', '김원장나', '관리자', '-', '사용 중'])
  expect(cellsOf('partner1')).toEqual(['partner1', '연계학원', '연계 학원', '-', '사용 중'])
  expect(cellsOf('desk.old')).toEqual(['desk.old', '박퇴사', '직원', '능동관', '차단됨'])
  // 차단된 계정은 흐리게 보인다.
  expect(screen.getByRole('row', { name: /^desk\.old / })).toHaveClass('text-sub')
  expect(screen.getByRole('row', { name: /^desk\.dongtan / })).not.toHaveClass('text-sub')
  expect(screen.getByText('전체 4개')).toBeInTheDocument()
  // 조건 없이 첫 페이지를 묻는다.
  expect(listQueries()).toEqual(['page=0'])
})

test.each([
  ['직원', staff],
  ['연계 학원', partner],
])('%s은 이 화면을 볼 수 없고 계정 목록을 요청하지도 않는다', async (_name, user) => {
  renderApp(PATH, { me: user })

  expect(
    await screen.findByRole('heading', { name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expect(requests()).toEqual([])
})

test('모르는 역할·상태 값이 와도 다른 뜻의 표시로 바꾸지 않고 받은 값을 보여준다', async () => {
  // 서버가 값을 먼저 추가하고 프론트 타입이 아직 옛것일 때
  mockList([{ ...desk, role: 'AUDITOR', status: 'LOCKED' } as unknown as Account])
  renderApp(PATH, { me: admin })
  await table()

  const cells = cellsOf('desk.dongtan')
  expect(cells[2]).toBe('AUDITOR')
  expect(cells[4]).toBe('LOCKED')
  // 차단된 계정처럼 흐리게 그리지도 않는다.
  expect(screen.getByRole('row', { name: /^desk\.dongtan / })).not.toHaveClass('text-sub')
})

test('내 줄에는 수정만 있고, 차단과 비밀번호 다시 정하기는 없다', async () => {
  mockList()
  renderApp(PATH, { me: admin })
  await table()

  expect(screen.getByRole('button', { name: 'admin 수정' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'admin 차단' })).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'admin 비밀번호 다시 정하기' }),
  ).not.toBeInTheDocument()
  // 다른 계정의 줄에는 셋 다 있다. 차단된 계정은 차단 풀기다.
  for (const name of [
    'desk.dongtan 수정',
    'desk.dongtan 비밀번호 다시 정하기',
    'desk.dongtan 차단',
  ]) {
    expect(screen.getByRole('button', { name })).toBeEnabled()
  }
  expect(screen.getByRole('button', { name: 'desk.old 차단 풀기' })).toBeEnabled()
})

// ── 조건과 페이지 ─────────────────────────────────────────

test('역할, 지점, 상태를 고르면 그 조건으로 묻고 주소에 남긴다', async () => {
  mockList()
  const { router } = renderApp(PATH, { me: admin })
  await table()

  await userEvent.selectOptions(screen.getByLabelText('역할'), '직원')
  await userEvent.selectOptions(await screen.findByLabelText('지점'), '능동관')
  await userEvent.selectOptions(screen.getByLabelText('상태'), '차단됨')

  await waitFor(() =>
    expect(listQueries().at(-1)).toBe('role=STAFF&campusId=2&status=DISABLED&page=0'),
  )
  expect(router.state.location.search).toBe('?role=STAFF&campusId=2&status=DISABLED')
})

test('주소의 조건으로 묻고 선택 상자에도 그 값을 보여준다. 조건을 바꾸면 첫 페이지부터 본다', async () => {
  mockList()
  const { router } = renderApp(`${PATH}?role=STAFF&status=ACTIVE&page=2`, { me: admin })
  await waitFor(() => expect(listQueries()).toEqual(['role=STAFF&status=ACTIVE&page=2']))
  expect(screen.getByLabelText('역할')).toHaveDisplayValue('직원')
  expect(screen.getByLabelText('상태')).toHaveDisplayValue('사용 중')

  await userEvent.selectOptions(screen.getByLabelText('상태'), '전체')

  await waitFor(() => expect(listQueries().at(-1)).toBe('role=STAFF&page=0'))
  expect(router.state.location.search).toBe('?role=STAFF')
})

test('주소의 모양이 맞지 않는 값은 없는 조건으로 본다', async () => {
  mockList()
  renderApp(`${PATH}?role=staff&campusId=abc&status=GONE&page=10001`, { me: admin })

  await table()
  expect(listQueries()).toEqual(['page=0'])
})

test('다음 페이지로 넘기면 조건을 지닌 채 그 페이지를 묻는다', async () => {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    [LIST]: ({ query }) =>
      jsonResponse(
        pageOf([desk], { page: Number(query.get('page')), totalPages: 3, totalElements: 45 }),
      ),
  })
  const { router } = renderApp(`${PATH}?role=STAFF`, { me: admin })
  await table()

  await userEvent.click(screen.getByRole('button', { name: '다음' }))

  await waitFor(() => expect(listQueries().at(-1)).toBe('role=STAFF&page=1'))
  expect(router.state.location.search).toBe('?role=STAFF&page=1')
})

test('조건에 맞는 계정이 없으면 알리고, 조건을 지울 수 있다', async () => {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    [LIST]: ({ query }) => jsonResponse(pageOf(query.get('status') ? [] : [desk])),
  })
  const { router } = renderApp(`${PATH}?status=DISABLED`, { me: admin })

  expect(
    await screen.findByRole('heading', { name: '조건에 맞는 계정이 없어요' }),
  ).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '조건 지우기' }))

  await table()
  expect(router.state.location.search).toBe('')
})

test('목록을 받지 못하면 서버 문구를 알리고 다시 불러올 수 있다', async () => {
  let attempts = 0
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    [LIST]: () => {
      attempts += 1
      return attempts === 1
        ? problemResponse(403, { detail: '권한이 없습니다.', code: 'AUTH_ROLE_NOT_ALLOWED' })
        : jsonResponse(pageOf([desk]))
    },
  })
  renderApp(PATH, { me: admin })

  expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

  await table()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('세션이 끊겨 401이 오면 로그인 화면으로 간다', async () => {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    [LIST]: () => unauthenticated(),
  })
  const { router } = renderApp(PATH, { me: admin })

  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
})

// ── 만들기 ───────────────────────────────────────────────

test('직원 계정을 만들면 입력한 값을 멱등 키 없이 보내고, 목록을 다시 받아 알린다', async () => {
  const server = mockList([me])
  const created: Account = { ...desk, id: 9, loginId: 'desk.new', name: '최신입', campusId: 2 }
  mockApi({
    [CREATE]: () => {
      server.items = [me, created]
      return jsonResponse(created, 201)
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await fillNewStaff()
  // 역할은 직원이 골라져 있다.
  expect(within(dialog).getByRole('radio', { name: '직원' })).toBeChecked()

  await press(dialog, '만들기')

  await closed()
  const request = requestOf(CREATE)
  expect(request.body).toEqual({
    loginId: 'desk.new',
    name: '최신입',
    password: PASSWORD,
    role: 'STAFF',
    campusId: 2,
  })
  // 계정 API는 멱등 키를 받지 않는다.
  expect(request.headers.get('Idempotency-Key')).toBeNull()
  expect(screen.getByRole('status')).toHaveTextContent(
    'desk.new 계정을 만들었어요. 처음 비밀번호를 직접 전하고, 로그인한 뒤 바꾸게 안내해 주세요.',
  )
  // 창이 닫힐 때 목록은 이미 바뀌어 있다.
  expect(cellsOf('desk.new')).toEqual(['desk.new', '최신입', '직원', '능동관', '사용 중'])
})

test('만들기에 성공하면 새 목록을 받은 뒤에 창을 닫는다', async () => {
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  let lists = 0
  const created: Account = { ...desk, id: 9, loginId: 'desk.new', name: '최신입', campusId: 2 }
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    [LIST]: async () => {
      lists += 1
      if (lists === 1) return jsonResponse(pageOf([me]))
      // 만든 뒤의 목록은 붙잡아 둔다.
      await held
      return jsonResponse(pageOf([me, created]))
    },
    [CREATE]: () => jsonResponse(created, 201),
  })
  renderApp(PATH, { me: admin })
  const dialog = await fillNewStaff()

  await press(dialog, '만들기')

  await waitFor(() => expect(lists).toBe(2))
  // 목록이 오기 전에 닫으면, 만들었다는 안내는 떴는데 표에는 그 계정이 없는 순간이 생긴다.
  expect(screen.getByRole('dialog', { name: '계정 만들기' })).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  release()

  await closed()
  expect(cellsOf('desk.new')[0]).toBe('desk.new')
})

test('관리자 계정을 만들면 지점 칸이 사라지고 지점을 null로 보낸다', async () => {
  mockList([me])
  mockApi({ [CREATE]: () => jsonResponse({ ...me, id: 9, loginId: 'vice' }, 201) })
  renderApp(PATH, { me: admin })
  const dialog = await open('계정 만들기', '계정 만들기')
  await fill(dialog, '아이디', 'vice')
  await fill(dialog, '이름', '부원장')
  await fill(dialog, '처음 비밀번호', PASSWORD)

  await userEvent.click(within(dialog).getByRole('radio', { name: '관리자' }))

  expect(within(dialog).queryByLabelText('지점')).not.toBeInTheDocument()
  await press(dialog, '만들기')
  await closed()
  expect(requestOf(CREATE).body).toEqual({
    loginId: 'vice',
    name: '부원장',
    password: PASSWORD,
    role: 'ADMIN',
    campusId: null,
  })
})

test('만들 수 있는 역할은 직원과 관리자뿐이다', async () => {
  mockList([me])
  renderApp(PATH, { me: admin })
  const dialog = await open('계정 만들기', '계정 만들기')

  expect(
    within(dialog)
      .getAllByRole('radio')
      .map((radio) => radio.getAttribute('value')),
  ).toEqual(['STAFF', 'ADMIN'])
})

test('아이디는 대문자로 쳐도 소문자로 바뀐다', async () => {
  mockList([me])
  renderApp(PATH, { me: admin })
  const dialog = await open('계정 만들기', '계정 만들기')

  await fill(dialog, '아이디', 'Desk.New')

  expect(within(dialog).getByLabelText('아이디')).toHaveValue('desk.new')
})

test('만들기: 빈 칸과 틀린 값은 칸마다 알리고 보내지 않는다', async () => {
  mockList([me])
  renderApp(PATH, { me: admin })
  const dialog = await open('계정 만들기', '계정 만들기')
  await fill(dialog, '아이디', '.a')
  await fill(dialog, '처음 비밀번호', 'short')

  await press(dialog, '만들기')

  expect(within(dialog).getByLabelText('아이디')).toHaveAccessibleDescription(
    '영문 소문자, 숫자, 점(.), 밑줄(_), 하이픈(-)으로 3~50자여야 해요. 첫 글자는 영문이나 숫자예요.',
  )
  expect(within(dialog).getByLabelText('이름')).toHaveAccessibleDescription('이름을 입력해 주세요.')
  expect(within(dialog).getByLabelText('처음 비밀번호')).toHaveAccessibleDescription(
    '공백을 빼고 10자 이상으로 입력해 주세요.',
  )
  expect(within(dialog).getByLabelText('지점')).toHaveAccessibleDescription('지점을 골라 주세요.')
  expect(count(CREATE)).toBe(0)
})

test('만들기: 비밀번호가 아이디와 같으면 보내지 않는다', async () => {
  mockList([me])
  renderApp(PATH, { me: admin })
  const dialog = await fillNewStaff()
  await fill(dialog, '아이디', 'desk.newstaff')
  await fill(dialog, '처음 비밀번호', 'desk.newstaff')

  await press(dialog, '만들기')

  expect(within(dialog).getByLabelText('처음 비밀번호')).toHaveAccessibleDescription(
    '아이디와 같은 비밀번호는 쓸 수 없어요.',
  )
  expect(count(CREATE)).toBe(0)
})

test.each([
  ['AUTH_LOGIN_ID_DUPLICATED', 409, '이미 사용 중인 아이디입니다.', '아이디'],
  ['AUTH_PASSWORD_NOT_ACCEPTABLE', 400, '사용할 수 없는 비밀번호입니다.', '처음 비밀번호'],
  ['AUTH_CAMPUS_NOT_FOUND', 400, '지점을 찾을 수 없습니다.', '지점'],
  ['AUTH_ROLE_CAMPUS_MISMATCH', 400, '직원 계정에는 지점이 있어야 합니다.', '지점'],
])(
  '만들기: %s는 서버 문구를 그 칸에 보여주고 입력을 남긴다',
  async (code, status, detail, label) => {
    mockList([me])
    mockApi({ [CREATE]: () => problemResponse(status, { detail, code }) })
    renderApp(PATH, { me: admin })
    const dialog = await fillNewStaff()

    await press(dialog, '만들기')

    await waitFor(() =>
      expect(within(dialog).getByLabelText(label)).toHaveAccessibleDescription(detail),
    )
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    // 고쳐서 다시 보낼 수 있게 입력은 그대로 둔다. 비밀번호도 다시 치지 않는다.
    expect(within(dialog).getByLabelText('아이디')).toHaveValue('desk.new')
    expect(within(dialog).getByLabelText('처음 비밀번호')).toHaveValue(PASSWORD)
    expect(within(dialog).getByRole('button', { name: '만들기' })).toBeEnabled()
  },
)

test('만들기: 서버가 칸을 짚어 거부하면 그 칸에 보여준다', async () => {
  mockList([me])
  mockApi({
    [CREATE]: () =>
      problemResponse(400, {
        detail: '입력값이 올바르지 않습니다.',
        code: 'COMMON_VALIDATION_FAILED',
        errors: [{ field: 'loginId', message: '형식이 올바르지 않습니다.' }],
      }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await fillNewStaff()

  await press(dialog, '만들기')

  await waitFor(() =>
    expect(within(dialog).getByLabelText('아이디')).toHaveAccessibleDescription(
      '형식이 올바르지 않습니다.',
    ),
  )
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
})

test('만들기: 응답을 받지 못하면 목록을 먼저 확인하라고 알리고, 만들어졌으면 창 뒤의 목록에 보인다', async () => {
  const server = mockList([me])
  mockApi({
    [CREATE]: () => {
      // 서버에는 만들어졌는데 응답을 받지 못했다.
      server.items = [me, { ...desk, id: 9, loginId: 'desk.new', name: '최신입' }]
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await fillNewStaff()

  await press(dialog, '만들기')

  // 멱등 키가 없어 그대로 다시 보내면 "이미 사용 중인 아이디"가 온다. 다시 누르라고 하지 않고, 확인할 아이디를 알린다.
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '만들어졌을 수도 있어요. 다시 만들기 전에, 창을 닫고 목록에 desk.new 계정이 있는지 먼저 확인해 주세요.',
  )
  await waitFor(() =>
    expect(screen.getByRole('row', { name: /^desk\.new /, hidden: true })).toBeInTheDocument(),
  )
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('입력한 비밀번호는 주소에도, 요청이 끝난 뒤의 캐시에도 남지 않는다', async () => {
  mockList([me])
  mockApi({ [CREATE]: () => jsonResponse({ ...desk, id: 9, loginId: 'desk.new' }, 201) })
  const { router, queryClient } = renderApp(PATH, { me: admin })
  const dialog = await fillNewStaff()

  await press(dialog, '만들기')

  await closed()
  await waitFor(() => expect(queryClient.getMutationCache().getAll()).toEqual([]))
  const cached = JSON.stringify(
    queryClient
      .getQueryCache()
      .getAll()
      .map((query) => [query.queryKey, query.state.data]),
  )
  expect(cached).not.toContain(PASSWORD)
  expect(JSON.stringify(router.state.location)).not.toContain(PASSWORD)
  // 창을 다시 열면 비밀번호 칸은 비어 있다.
  const reopened = await open('계정 만들기', '계정 만들기')
  expect(within(reopened).getByLabelText('처음 비밀번호')).toHaveValue('')
})

// ── 고치기 ───────────────────────────────────────────────

test('고치기 창은 지금 값으로 채워져 있고 아이디는 바꿀 수 없다. 저장하면 이름·역할·지점을 통째로 보낸다', async () => {
  const server = mockList()
  mockApi({
    'PUT /api/v1/accounts/2': () => {
      server.items = [me, { ...desk, name: '이실장', campusId: 2 }, left, academy]
      return jsonResponse(server.items[1])
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await openEdit('desk.dongtan')
  expect(within(dialog).getByLabelText('아이디')).toHaveValue('desk.dongtan')
  expect(within(dialog).getByLabelText('아이디')).toBeDisabled()
  expect(within(dialog).getByRole('radio', { name: '직원' })).toBeChecked()
  expect(within(dialog).getByLabelText('지점')).toHaveDisplayValue('동탄관')
  // 고칠 때는 비밀번호를 받지 않는다.
  expect(within(dialog).queryByLabelText('처음 비밀번호')).not.toBeInTheDocument()

  await fill(dialog, '이름', ' 이실장 ')
  await userEvent.selectOptions(within(dialog).getByLabelText('지점'), '능동관')
  await press(dialog, '저장')

  await closed()
  expect(requestOf('PUT /api/v1/accounts/2').body).toEqual({
    name: '이실장',
    role: 'STAFF',
    campusId: 2,
  })
  expect(screen.getByRole('status')).toHaveTextContent('desk.dongtan 계정을 고쳤어요.')
  expect(cellsOf('desk.dongtan')).toEqual(['desk.dongtan', '이실장', '직원', '능동관', '사용 중'])
})

test('직원을 관리자로 바꾸면 지점을 null로 보낸다', async () => {
  mockList()
  mockApi({ 'PUT /api/v1/accounts/2': () => jsonResponse({ ...desk, role: 'ADMIN' }) })
  renderApp(PATH, { me: admin })
  const dialog = await openEdit('desk.dongtan')

  await userEvent.click(within(dialog).getByRole('radio', { name: '관리자' }))
  await press(dialog, '저장')

  await closed()
  expect(requestOf('PUT /api/v1/accounts/2').body).toEqual({
    name: '이데스크',
    role: 'ADMIN',
    campusId: null,
  })
})

test('내 계정은 이름만 고칠 수 있다. 역할과 지점은 지금 값을 그대로 보낸다', async () => {
  mockList()
  mockApi({ 'PUT /api/v1/accounts/1': () => jsonResponse({ ...me, name: '김대표' }) })
  renderApp(PATH, { me: admin })
  const dialog = await openEdit('admin')
  for (const radio of within(dialog).getAllByRole('radio')) expect(radio).toBeDisabled()
  expect(within(dialog).getByText('내 역할과 지점은 바꿀 수 없어요.')).toBeInTheDocument()

  await fill(dialog, '이름', '김대표')
  await press(dialog, '저장')

  await closed()
  expect(requestOf('PUT /api/v1/accounts/1').body).toEqual({
    name: '김대표',
    role: 'ADMIN',
    campusId: null,
  })
})

test('연계 학원 계정은 이름만 고칠 수 있다. 역할은 PARTNER, 지점은 null로 그대로 보낸다', async () => {
  mockList()
  mockApi({ 'PUT /api/v1/accounts/4': () => jsonResponse({ ...academy, name: '동탄수학' }) })
  renderApp(PATH, { me: admin })
  const dialog = await openEdit('partner1')
  expect(within(dialog).getByLabelText('역할')).toHaveValue('연계 학원')
  expect(within(dialog).getByLabelText('역할')).toBeDisabled()
  expect(within(dialog).queryByRole('radio')).not.toBeInTheDocument()
  expect(within(dialog).queryByLabelText('지점')).not.toBeInTheDocument()

  await fill(dialog, '이름', '동탄수학')
  await press(dialog, '저장')

  await closed()
  expect(requestOf('PUT /api/v1/accounts/4').body).toEqual({
    name: '동탄수학',
    role: 'PARTNER',
    campusId: null,
  })
})

test('고치기: 마지막 관리자를 직원으로 바꾸려 하면 서버 문구를 역할 칸 아래에 보여준다', async () => {
  const other: Account = { ...me, id: 5, loginId: 'vice', name: '부원장' }
  mockList([me, other])
  mockApi({
    'PUT /api/v1/accounts/5': () =>
      problemResponse(409, {
        detail: '마지막 관리자는 바꿀 수 없습니다.',
        code: 'AUTH_LAST_ADMIN',
      }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await openEdit('vice')
  await userEvent.click(within(dialog).getByRole('radio', { name: '직원' }))
  await userEvent.selectOptions(within(dialog).getByLabelText('지점'), '동탄관')

  await press(dialog, '저장')

  expect(await within(dialog).findByText('마지막 관리자는 바꿀 수 없습니다.')).toBeInTheDocument()
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
})

test('고치기: 응답을 받지 못하면 그대로 다시 눌러도 된다고 알린다', async () => {
  mockList()
  mockApi({
    'PUT /api/v1/accounts/2': () => {
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await openEdit('desk.dongtan')

  await press(dialog, '저장')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '저장됐는지 확인하지 못했어요. 그대로 다시 눌러도 돼요.',
  )
})

// ── 응답을 놓쳤는데 저장은 된 경우 ───────────────────────

test('차단: 응답을 놓쳤는데 차단은 됐으면 목록은 바뀌어 있다. 창의 물음은 뒤집히지 않고, 그대로 다시 누르면 끝난다', async () => {
  const server = mockList()
  let attempts = 0
  mockApi({
    'POST /api/v1/accounts/2/disable': () => {
      attempts += 1
      // 처음 요청에서 이미 차단은 저장됐다.
      server.items = [me, { ...desk, status: 'DISABLED' }, left, academy]
      if (attempts === 1) throw new TypeError('Failed to fetch')
      return jsonResponse(server.items[1])
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('desk.dongtan 차단', '계정을 차단할까요?')

  await press(dialog, '차단')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '저장됐는지 확인하지 못했어요. 그대로 다시 눌러도 돼요.',
  )
  await waitFor(() =>
    expect(screen.getByRole('row', { name: /^desk\.dongtan /, hidden: true })).toHaveTextContent(
      '차단됨',
    ),
  )
  // 목록이 바뀌어도 창의 물음은 "차단 풀기"로 뒤집히지 않는다. 다시 누르면 차단을 한 번 더 보낸다(풀기가 아니다).
  expect(screen.getByRole('dialog', { name: '계정을 차단할까요?' })).toBeInTheDocument()
  await press(dialog, '차단')

  await closed()
  expect(count('POST /api/v1/accounts/2/disable')).toBe(2)
  expect(count('POST /api/v1/accounts/2/enable')).toBe(0)
  expect(screen.getByRole('status')).toHaveTextContent('desk.dongtan 계정을 차단했어요.')
})

// ── 차단과 차단 풀기 ─────────────────────────────────────

test('차단하면 누구를 차단하는지 묻고, 차단한 뒤 목록을 다시 받아 알린다', async () => {
  const server = mockList()
  mockApi({
    'POST /api/v1/accounts/2/disable': () => {
      server.items = [me, { ...desk, status: 'DISABLED' }, left, academy]
      return jsonResponse(server.items[1])
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('desk.dongtan 차단', '계정을 차단할까요?')
  expect(dialog).toHaveAccessibleDescription(
    '이데스크(desk.dongtan) 계정을 차단해요. 로그인할 수 없게 되고, 지금 로그인돼 있으면 바로 로그아웃돼요. 나중에 다시 풀 수 있어요.',
  )

  await press(dialog, '차단')

  await closed()
  expect(requestOf('POST /api/v1/accounts/2/disable').body).toBeUndefined()
  expect(screen.getByRole('status')).toHaveTextContent('desk.dongtan 계정을 차단했어요.')
  expect(cellsOf('desk.dongtan')[4]).toBe('차단됨')
  expect(screen.getByRole('button', { name: 'desk.dongtan 차단 풀기' })).toBeInTheDocument()
})

test('차단: 닫기를 누르면 차단하지 않는다', async () => {
  mockList()
  renderApp(PATH, { me: admin })
  const dialog = await open('desk.dongtan 차단', '계정을 차단할까요?')

  await press(dialog, '닫기')

  await closed()
  expect(count('POST /api/v1/accounts/2/disable')).toBe(0)
})

test('차단 풀기를 하면 풀고 알린다', async () => {
  const server = mockList()
  mockApi({
    'POST /api/v1/accounts/3/enable': () => {
      server.items = [me, desk, { ...left, status: 'ACTIVE' }, academy]
      return jsonResponse(server.items[2])
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('desk.old 차단 풀기', '차단을 풀까요?')

  await press(dialog, '차단 풀기')

  await closed()
  expect(screen.getByRole('status')).toHaveTextContent('desk.old 계정의 차단을 풀었어요.')
  expect(cellsOf('desk.old')[4]).toBe('사용 중')
})

test('차단: 마지막 관리자라 거부되면 서버 문구를 창 안에 보여주고, 다시 열면 지난 안내는 없다', async () => {
  const other: Account = { ...me, id: 5, loginId: 'vice', name: '부원장' }
  mockList([me, other])
  mockApi({
    'POST /api/v1/accounts/5/disable': () =>
      problemResponse(409, {
        detail: '마지막 관리자는 차단할 수 없습니다.',
        code: 'AUTH_LAST_ADMIN',
      }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('vice 차단', '계정을 차단할까요?')

  await press(dialog, '차단')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '마지막 관리자는 차단할 수 없습니다.',
  )
  await press(dialog, '닫기')
  await closed()
  const reopened = await open('vice 차단', '계정을 차단할까요?')
  expect(within(reopened).queryByRole('alert')).not.toBeInTheDocument()
})

// ── 비밀번호 다시 정하기 ─────────────────────────────────

test('비밀번호를 다시 정하면 새 비밀번호만 보내고 알린다', async () => {
  mockList()
  mockApi({ 'POST /api/v1/accounts/2/password': () => noContent() })
  renderApp(PATH, { me: admin })
  const dialog = await open('desk.dongtan 비밀번호 다시 정하기', '비밀번호 다시 정하기')
  expect(dialog).toHaveAccessibleDescription(
    '이데스크(desk.dongtan) 계정의 비밀번호를 새로 정해요. 저장하면 그 계정은 바로 로그아웃돼요.',
  )

  await fill(dialog, '새 비밀번호', PASSWORD)
  await press(dialog, '저장')

  await closed()
  const request = requestOf('POST /api/v1/accounts/2/password')
  expect(request.body).toEqual({ password: PASSWORD })
  expect(request.headers.get('Idempotency-Key')).toBeNull()
  expect(screen.getByRole('status')).toHaveTextContent(
    'desk.dongtan 계정의 비밀번호를 다시 정했어요.',
  )
})

test('비밀번호 다시 정하기: 규칙에 맞지 않거나 그 계정의 아이디와 같으면 보내지 않는다', async () => {
  mockList()
  renderApp(PATH, { me: admin })
  const dialog = await open('desk.dongtan 비밀번호 다시 정하기', '비밀번호 다시 정하기')
  // 규칙은 칸 밑에 미리 적혀 있다.
  expect(within(dialog).getByLabelText('새 비밀번호')).toHaveAccessibleDescription(
    PASSWORD_RULE_HINT,
  )

  await press(dialog, '저장')
  expect(within(dialog).getByLabelText('새 비밀번호')).toHaveAccessibleDescription(
    '비밀번호를 입력해 주세요.',
  )
  await fill(dialog, '새 비밀번호', 'desk.dongtan')
  await press(dialog, '저장')

  expect(within(dialog).getByLabelText('새 비밀번호')).toHaveAccessibleDescription(
    '아이디와 같은 비밀번호는 쓸 수 없어요.',
  )
  expect(count('POST /api/v1/accounts/2/password')).toBe(0)
})

test('비밀번호 다시 정하기: 서버가 받지 않는 비밀번호면 서버 문구를 칸 아래에 보여준다', async () => {
  mockList()
  mockApi({
    'POST /api/v1/accounts/2/password': () =>
      problemResponse(400, {
        detail: '사용할 수 없는 비밀번호입니다.',
        code: 'AUTH_PASSWORD_NOT_ACCEPTABLE',
      }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('desk.dongtan 비밀번호 다시 정하기', '비밀번호 다시 정하기')
  await fill(dialog, '새 비밀번호', PASSWORD)

  await press(dialog, '저장')

  await waitFor(() =>
    expect(within(dialog).getByLabelText('새 비밀번호')).toHaveAccessibleDescription(
      '사용할 수 없는 비밀번호입니다.',
    ),
  )
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
})

test('비밀번호 다시 정하기: 창을 닫았다 다시 열면 입력한 비밀번호가 남아 있지 않다', async () => {
  mockList()
  renderApp(PATH, { me: admin })
  const dialog = await open('desk.dongtan 비밀번호 다시 정하기', '비밀번호 다시 정하기')
  await fill(dialog, '새 비밀번호', PASSWORD)

  await press(dialog, '취소')
  await closed()

  const reopened = await open('desk.dongtan 비밀번호 다시 정하기', '비밀번호 다시 정하기')
  expect(within(reopened).getByLabelText('새 비밀번호')).toHaveValue('')
})

// ── 안내 지우기 ──────────────────────────────────────────

test('끝난 일의 안내는 다음 일을 시작하면 지운다', async () => {
  mockList()
  mockApi({ 'POST /api/v1/accounts/2/password': () => noContent() })
  renderApp(PATH, { me: admin })
  const dialog = await open('desk.dongtan 비밀번호 다시 정하기', '비밀번호 다시 정하기')
  await fill(dialog, '새 비밀번호', PASSWORD)
  await press(dialog, '저장')
  await closed()
  expect(screen.getByRole('status')).toBeInTheDocument()

  const next = await openEdit('desk.dongtan')

  expect(screen.queryByText(/비밀번호를 다시 정했어요/)).not.toBeInTheDocument()
  await press(next, '취소')
})

test('지점 이름을 읽지 못하면 그 안내 아래에 요청 번호를 보여준다', async () => {
  mockList()
  mockApi({ 'GET /api/v1/campuses': () => unreadableResponse('4b1d6c0e2f3a4b5c6d7e8f9012345678') })
  renderApp(PATH, { me: admin })

  const notice = await screen.findByText(/지점 이름을 불러오지 못했어요/)
  expect(notice.closest('[role="alert"]')).toHaveTextContent(
    '문의할 때 이 번호를 알려 주세요: 4b1d6c0e2f3a4b5c6d7e8f9012345678',
  )
})
