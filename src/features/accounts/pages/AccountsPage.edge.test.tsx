import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { onlineManager } from '@tanstack/react-query'
import { expect, test, vi } from 'vitest'
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
} from '@/test/mockApi'
import { admin, renderApp } from '@/test/renderApp'
import type { Account, AccountPage } from '../api'

// 계정 화면의 가장자리: 저장하는 동안, 응답을 놓쳤을 때, 목록·지점을 받지 못했을 때, 낡은 값.
// 흔한 흐름은 AccountsPage.test.tsx에 있다.

setupMockApi()
setupDialog()

const PATH = '/admin/settings/accounts'
const LIST = 'GET /api/v1/accounts'
const CREATE = 'POST /api/v1/accounts'
const CAMPUSES = 'GET /api/v1/campuses'
const RESET = 'POST /api/v1/accounts/2/password'
const DISABLE = 'POST /api/v1/accounts/2/disable'

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

const PASSWORD = 'first-password-1'
function pageOf(items: Account[], overrides: Partial<AccountPage> = {}): AccountPage {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: 1, ...overrides }
}

/** 지점, 계정 목록, 계정 하나의 조회를 흉내 낸다. 호출할 때마다 `server`의 지금 값을 돌려준다. */
function mockList(items: Account[] = [me, desk]) {
  // detail: 고치기 창이 새로 받는 값. 목록과 다르게 둘 수 있다(목록이 낡은 경우).
  const server = { items, detail: new Map(items.map((item) => [item.id, item])) }
  mockApi({
    [CAMPUSES]: () => jsonResponse(campuses),
    [LIST]: () => jsonResponse(pageOf(server.items)),
    ...Object.fromEntries(
      items.map(({ id }) => [
        `GET /api/v1/accounts/${id}`,
        () => jsonResponse(server.detail.get(id)),
      ]),
    ),
  })
  return server
}

function networkDown(): never {
  throw new TypeError('Failed to fetch')
}

/** 응답을 붙잡아 두었다가 원할 때 보낸다. */
function hold() {
  let respond!: (response: Response) => void
  const response = new Promise<Response>((resolve) => (respond = resolve))
  return { response, respond }
}

function listQueries() {
  return requests()
    .filter((key) => key.startsWith(LIST) && !/accounts\/\d/.test(key))
    .map((key) => key.split('?')[1] ?? '')
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

function table() {
  return screen.findByRole('table', { name: '계정 목록' })
}

function row(loginId: string) {
  // 창이 떠 있으면 뒤의 표는 가려진 것으로 친다(hidden).
  return screen.getByRole('row', {
    name: new RegExp(`^${loginId.replace('.', '\\.')} `),
    hidden: true,
  })
}

async function open(button: string, dialogName: string) {
  await table()
  await userEvent.click(screen.getByRole('button', { name: button }))
  return screen.findByRole('dialog', { name: dialogName })
}

/** 고치기 창을 열고, 그 계정을 새로 받아 폼이 뜰 때까지 기다린다. */
async function openEdit(loginId: string) {
  const dialog = await open(`${loginId} 수정`, '계정 수정')
  await within(dialog).findByLabelText('이름')
  return dialog
}

async function fill(dialog: HTMLElement, label: string, value: string) {
  const input = within(dialog).getByLabelText(label)
  await userEvent.clear(input)
  if (value) await userEvent.type(input, value)
}

function press(dialog: HTMLElement, name: string) {
  return userEvent.click(within(dialog).getByRole('button', { name }))
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

/** Esc를 눌렀을 때 브라우저가 창에 보내는 이벤트 */
function pressEscape(dialog: HTMLElement) {
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
}

// ── 저장하는 동안 ─────────────────────────────────────────

test('만들기: 저장하는 동안에는 입력을 고치거나, 다시 누르거나, 창을 닫을 수 없다. 실패하면 풀리고 입력이 남는다', async () => {
  const created = hold()
  mockList([me])
  mockApi({ [CREATE]: () => created.response })
  renderApp(PATH, { me: admin })
  const dialog = await fillNewStaff()

  await press(dialog, '만들기')

  const saving = await within(dialog).findByRole('button', { name: '저장하는 중' })
  expect(saving).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: '취소' })).toBeDisabled()
  // 그사이 고친 값은 보낸 요청에 없다. 성공 안내의 아이디와 전할 비밀번호가 화면과 달라지면 안 된다.
  for (const label of ['아이디', '이름', '처음 비밀번호', '지점']) {
    expect(within(dialog).getByLabelText(label)).toBeDisabled()
  }
  expect(within(dialog).getByRole('button', { name: '처음 비밀번호 보기' })).toBeDisabled()
  for (const radio of within(dialog).getAllByRole('radio')) expect(radio).toBeDisabled()
  // 닫아도 요청은 끝까지 간다. 멱등 키가 없어, 결과를 못 보고 다시 만들면 409를 보거나 만들어진 줄 모른다.
  pressEscape(dialog)
  expect(screen.getByRole('dialog', { name: '계정 만들기' })).toBeInTheDocument()
  expect(count(CREATE)).toBe(1)

  created.respond(
    problemResponse(409, {
      detail: '이미 사용 중인 아이디입니다.',
      code: 'AUTH_LOGIN_ID_DUPLICATED',
    }),
  )

  await waitFor(() => expect(within(dialog).getByLabelText('아이디')).toBeInvalid())
  expect(within(dialog).getByRole('button', { name: '만들기' })).toBeEnabled()
  expect(within(dialog).getByRole('button', { name: '취소' })).toBeEnabled()
  expect(within(dialog).getByLabelText('아이디')).toHaveValue('desk.new')
  expect(within(dialog).getByLabelText('처음 비밀번호')).toHaveValue(PASSWORD)
})

test('차단: 바꾸는 동안에는 다시 누르거나 창을 닫을 수 없다', async () => {
  const disabled = hold()
  mockList()
  mockApi({ [DISABLE]: () => disabled.response })
  renderApp(PATH, { me: admin })
  const dialog = await open('desk.dongtan 차단', '계정을 차단할까요?')

  await press(dialog, '차단')

  expect(await within(dialog).findByRole('button', { name: '차단하는 중' })).toBeDisabled()
  // 닫기는 지난 결과를 지운다(reset). 진행 중인 요청의 결과를 버리면 안 된다.
  expect(within(dialog).getByRole('button', { name: '닫기' })).toBeDisabled()
  pressEscape(dialog)
  expect(screen.getByRole('dialog', { name: '계정을 차단할까요?' })).toBeInTheDocument()
  expect(count(DISABLE)).toBe(1)

  disabled.respond(jsonResponse({ ...desk, status: 'DISABLED' }))
  await closed()
})

test('오프라인이어도 만들기를 바로 시도해 실패를 알린다. "저장하는 중"으로 잠긴 채 멈추지 않는다', async () => {
  mockList([me])
  mockApi({ [CREATE]: networkDown })
  renderApp(PATH, { me: admin })
  const dialog = await fillNewStaff()
  // 브라우저가 오프라인이라고 알린 상태. 기본 설정이면 요청을 보내지 않고 연결이 돌아올 때까지 기다린다.
  // 그러면 닫을 수도 없는 창에 갇힌다.
  onlineManager.setOnline(false)
  try {
    await press(dialog, '만들기')

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('연결 상태를 확인해 주세요.')
    expect(within(dialog).getByRole('button', { name: '만들기' })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeEnabled()
  } finally {
    onlineManager.setOnline(true)
  }
})

test('오프라인이어도 차단을 바로 시도해 실패를 알린다', async () => {
  mockList()
  mockApi({ [DISABLE]: networkDown })
  renderApp(PATH, { me: admin })
  const dialog = await open('desk.dongtan 차단', '계정을 차단할까요?')
  onlineManager.setOnline(false)
  try {
    await press(dialog, '차단')

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('연결 상태를 확인해 주세요.')
    expect(within(dialog).getByRole('button', { name: '닫기' })).toBeEnabled()
  } finally {
    onlineManager.setOnline(true)
  }
})

test('오프라인이어도 목록을 바로 물어 실패를 알린다', async () => {
  mockApi({ [CAMPUSES]: () => jsonResponse(campuses), [LIST]: networkDown })
  onlineManager.setOnline(false)
  try {
    renderApp(PATH, { me: admin })

    expect(await screen.findByRole('alert', {}, { timeout: 15_000 })).toHaveTextContent(
      '연결 상태를 확인해 주세요.',
    )
  } finally {
    onlineManager.setOnline(true)
  }
}, 20_000)

test('차단한 뒤 새 목록이 3초 넘게 오지 않으면 기다리지 않고 창을 닫는다. 표는 받는 중임을 알리고, 목록이 오면 바뀐다', async () => {
  // 시간을 가짜로 돌린다. 실제 시간도 흐르게 두어 화면의 기다림(waitFor)은 그대로 동작한다.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    const refreshed = hold()
    let lists = 0
    mockApi({
      [CAMPUSES]: () => jsonResponse(campuses),
      [LIST]: () => {
        lists += 1
        return lists === 1 ? jsonResponse(pageOf([me, desk])) : refreshed.response
      },
      [DISABLE]: () => jsonResponse({ ...desk, status: 'DISABLED' }),
    })
    renderApp(PATH, { me: admin })
    const dialog = await open('desk.dongtan 차단', '계정을 차단할까요?')
    await press(dialog, '차단')
    await waitFor(() => expect(lists).toBe(2))

    // 상한 전에는 기다린다. (정확한 경계는 waitForRefresh.test.ts가 본다. 여기서는 여유를 넉넉히 둔다.)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(within(dialog).getByRole('button', { name: '차단하는 중' })).toBeDisabled()

    // 차단은 이미 끝났다. 목록이 늦는다고 창을 잠가 두지 않는다.
    await vi.advanceTimersByTimeAsync(1_500)
    await closed()
    expect(screen.getByRole('status')).toHaveTextContent('desk.dongtan 계정을 차단했어요.')
    // 표는 아직 옛 값이다. 받는 중이라고 알린다(흐리게 + aria-busy).
    const scroller = screen.getByRole('table', { name: '계정 목록' }).parentElement
    expect(scroller).toHaveAttribute('aria-busy', 'true')
    expect(row('desk.dongtan')).toHaveTextContent('사용 중')

    refreshed.respond(jsonResponse(pageOf([me, { ...desk, status: 'DISABLED' }])))

    await waitFor(() => expect(row('desk.dongtan')).toHaveTextContent('차단됨'))
    expect(scroller).not.toHaveAttribute('aria-busy')
  } finally {
    vi.useRealTimers()
  }
})

// ── 만들기 응답을 놓쳤을 때 ───────────────────────────────

test('만들기: 응답을 놓친 뒤 같은 아이디로 다시 눌러 "이미 사용 중"이 오면, 방금 만든 계정일 수 있다고 알린다', async () => {
  let attempts = 0
  mockList([me])
  mockApi({
    [CREATE]: () => {
      attempts += 1
      // 처음 요청으로 만들어졌는데 응답을 받지 못했다. 멱등 키가 없어 두 번째는 중복으로 거부된다.
      if (attempts === 1) networkDown()
      return problemResponse(409, {
        detail: '이미 사용 중인 아이디입니다.',
        code: 'AUTH_LOGIN_ID_DUPLICATED',
      })
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await fillNewStaff()
  await press(dialog, '만들기')
  await within(dialog).findByRole('alert')

  await press(dialog, '만들기')

  // 남이 쓰는 아이디로 읽고 아이디를 바꿔 계정을 하나 더 만들면 안 된다.
  await waitFor(() =>
    expect(within(dialog).getByLabelText('아이디')).toHaveAccessibleDescription(
      '앞서 보낸 요청으로 이미 만들어졌을 수 있어요. 창을 닫고 목록에서 desk.new 계정을 확인해 주세요.',
    ),
  )
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
})

test('만들기: 응답을 놓친 뒤 아이디를 바꿔 보낸 요청의 "이미 사용 중"은 서버 문구 그대로 보여준다', async () => {
  let attempts = 0
  mockList([me])
  mockApi({
    [CREATE]: () => {
      attempts += 1
      if (attempts === 1) networkDown()
      return problemResponse(409, {
        detail: '이미 사용 중인 아이디입니다.',
        code: 'AUTH_LOGIN_ID_DUPLICATED',
      })
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await fillNewStaff()
  await press(dialog, '만들기')
  await within(dialog).findByRole('alert')

  // 다른 아이디다. 앞선 요청과 상관없이 정말 남이 쓰는 아이디다.
  await fill(dialog, '아이디', 'desk.other')
  await press(dialog, '만들기')

  await waitFor(() =>
    expect(within(dialog).getByLabelText('아이디')).toHaveAccessibleDescription(
      '이미 사용 중인 아이디입니다.',
    ),
  )
})

test('만들기에 성공했는데 새 목록을 받지 못하면, 만들었다고 알리고 표가 이전 내용일 수 있다고 알린다', async () => {
  let lists = 0
  mockApi({
    [CAMPUSES]: () => jsonResponse(campuses),
    [LIST]: () => {
      lists += 1
      return lists === 1
        ? jsonResponse(pageOf([me]))
        : // 다시 보내지 않는 실패(4xx). 만들기가 실패한 것이 아니다.
          problemResponse(403, { detail: '권한이 없습니다.', code: 'AUTH_ROLE_NOT_ALLOWED' })
    },
    [CREATE]: () => jsonResponse({ ...desk, id: 9, loginId: 'desk.new' }, 201),
  })
  renderApp(PATH, { me: admin })
  const dialog = await fillNewStaff()

  await press(dialog, '만들기')

  await closed()
  // 만들기 실패로 보이면 다시 만들어 409를 본다.
  expect(screen.getByRole('status')).toHaveTextContent('desk.new 계정을 만들었어요.')
  expect(screen.getByRole('alert')).toHaveTextContent(
    '최신 내용을 불러오지 못했어요. 아래 표는 이전 내용일 수 있어요.',
  )
  expect(count(CREATE)).toBe(1)
})

// ── 비밀번호 규칙(서버와 같게) ────────────────────────────

test.each([
  ['공백으로 길이를 채운 비밀번호', 'abc def gh1', '공백을 빼고 10자 이상으로 입력해 주세요.'],
  ['대소문자만 다른 아이디', 'DESK.NEW', '아이디와 같은 비밀번호는 쓸 수 없어요.'],
])('만들기: %s는 서버가 거부하므로 보내지 않고 까닭을 알린다', async (_name, password, message) => {
  mockList([me])
  renderApp(PATH, { me: admin })
  const dialog = await fillNewStaff()
  // 길이 규칙에 걸리지 않게 아이디를 열 자로 맞춘 경우도 본다.
  if (password === 'DESK.NEW') {
    await fill(dialog, '아이디', 'desk.newstaff')
    await fill(dialog, '처음 비밀번호', 'DESK.NewStaff')
  } else {
    await fill(dialog, '처음 비밀번호', password)
  }

  await press(dialog, '만들기')

  expect(within(dialog).getByLabelText('처음 비밀번호')).toHaveAccessibleDescription(message)
  expect(count(CREATE)).toBe(0)
})

// ── 보이지 않는 칸의 오류 ─────────────────────────────────

test('만들기: 화면에 없는 칸(관리자의 지점)의 오류가 오면 폼 아래에 보여준다', async () => {
  mockList([me])
  mockApi({
    [CREATE]: () =>
      problemResponse(400, {
        detail: '관리자 계정에는 지점을 둘 수 없습니다.',
        code: 'AUTH_ROLE_CAMPUS_MISMATCH',
      }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('계정 만들기', '계정 만들기')
  await fill(dialog, '아이디', 'vice')
  await fill(dialog, '이름', '부원장')
  await fill(dialog, '처음 비밀번호', PASSWORD)
  await userEvent.click(within(dialog).getByRole('radio', { name: '관리자' }))

  await press(dialog, '만들기')

  // 지점 칸은 그려지지 않는다. 칸 밑에만 두면 아무 안내 없이 버튼만 되돌아온다.
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '관리자 계정에는 지점을 둘 수 없습니다.',
  )
})

test('역할 칸의 오류는 역할 묶음의 설명으로 읽힌다', async () => {
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
  const roles = within(dialog).getByRole('radiogroup', { name: '역할' })
  expect(roles).toHaveAccessibleDescription('역할이나 지점을 바꾸면 그 계정은 바로 로그아웃돼요.')

  await press(dialog, '저장')

  await waitFor(() =>
    expect(roles).toHaveAccessibleDescription('마지막 관리자는 바꿀 수 없습니다.'),
  )
  expect(roles).toBeInvalid()
})

test('서버 오류가 떠 있어도, 고쳐서 다시 냈을 때 보내지 않았으면 지난 서버 오류는 지운다', async () => {
  mockList([me])
  mockApi({
    [CREATE]: () =>
      problemResponse(409, {
        detail: '이미 사용 중인 아이디입니다.',
        code: 'AUTH_LOGIN_ID_DUPLICATED',
      }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await fillNewStaff()
  await press(dialog, '만들기')
  await waitFor(() => expect(within(dialog).getByLabelText('아이디')).toBeInvalid())

  // 아이디는 고쳤는데 이름을 지웠다. 보내지 않는다.
  await fill(dialog, '아이디', 'desk.newer')
  await fill(dialog, '이름', '')
  await press(dialog, '만들기')

  expect(within(dialog).getByLabelText('이름')).toHaveAccessibleDescription('이름을 입력해 주세요.')
  // "이미 사용 중인 아이디"는 지난 입력에 대한 것이다.
  expect(within(dialog).getByLabelText('아이디')).not.toBeInvalid()
  expect(count(CREATE)).toBe(1)
})

// ── 고치기 창은 계정을 새로 받는다 ────────────────────────

test('고치기 창은 목록의 값이 아니라 새로 받은 값으로 채운다. 이름만 고쳐도 그사이 바뀐 지점을 되돌리지 않는다', async () => {
  const server = mockList()
  // 목록을 받은 뒤 다른 관리자가 이 직원의 지점을 능동관으로 옮겼다.
  server.detail.set(2, { ...desk, campusId: 2 })
  mockApi({
    'PUT /api/v1/accounts/2': () => jsonResponse({ ...desk, name: '이실장', campusId: 2 }),
  })
  renderApp(PATH, { me: admin })
  await waitFor(() => expect(row('desk.dongtan')).toHaveTextContent('동탄관'))

  const dialog = await openEdit('desk.dongtan')
  expect(within(dialog).getByLabelText('지점')).toHaveDisplayValue('능동관')
  await fill(dialog, '이름', '이실장')
  await press(dialog, '저장')

  await closed()
  // 옛 지점(1)을 보내면 그 변경을 되돌리고 그 계정을 로그아웃시킨다.
  expect(requestOf('PUT /api/v1/accounts/2').body).toEqual({
    name: '이실장',
    role: 'STAFF',
    campusId: 2,
  })
})

test('고치기 창: 계정을 받는 동안에는 폼 대신 안내를 보여주고, 닫을 수 있다', async () => {
  const detail = hold()
  mockList()
  mockApi({ 'GET /api/v1/accounts/2': () => detail.response })
  renderApp(PATH, { me: admin })

  const dialog = await open('desk.dongtan 수정', '계정 수정')

  expect(within(dialog).getByRole('status')).toHaveTextContent(
    'desk.dongtan 계정을 불러오고 있어요.',
  )
  // 받기 전의(목록의) 값으로 폼을 먼저 보여주지 않는다.
  expect(within(dialog).queryByLabelText('이름')).not.toBeInTheDocument()
  await press(dialog, '닫기')
  await closed()
  detail.respond(jsonResponse(desk))
})

test('고치기 창: 계정을 받지 못하면 알리고, 다시 불러오면 폼이 뜬다', async () => {
  let attempts = 0
  mockList()
  mockApi({
    'GET /api/v1/accounts/2': () => {
      attempts += 1
      return attempts === 1
        ? problemResponse(404, { detail: '계정을 찾을 수 없습니다.', code: 'COMMON_NOT_FOUND' })
        : jsonResponse(desk)
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('desk.dongtan 수정', '계정 수정')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('계정을 찾을 수 없습니다.')
  expect(within(dialog).queryByLabelText('이름')).not.toBeInTheDocument()
  await press(dialog, '다시 불러오기')

  expect(await within(dialog).findByLabelText('이름')).toHaveValue('이데스크')
})

test('고치기 창을 다시 열면 받아 둔 값을 쓰지 않고 또 새로 받는다', async () => {
  mockList()
  renderApp(PATH, { me: admin })
  const first = await openEdit('desk.dongtan')
  await press(first, '취소')
  await closed()

  await openEdit('desk.dongtan')

  expect(count('GET /api/v1/accounts/2')).toBe(2)
})

test('이 화면이 모르는 역할의 계정은 이름만 고칠 수 있고, 역할과 지점은 받은 값을 그대로 보낸다', async () => {
  // 서버가 지점에 묶인 역할을 먼저 추가하고 프론트 타입이 아직 옛것일 때
  const manager = {
    ...desk,
    id: 6,
    loginId: 'manager',
    role: 'MANAGER',
    campusId: 2,
  } as unknown as Account
  mockList([me, manager])
  mockApi({ 'PUT /api/v1/accounts/6': () => jsonResponse({ ...manager, name: '오실장' }) })
  renderApp(PATH, { me: admin })
  const dialog = await openEdit('manager')
  expect(within(dialog).getByLabelText('역할')).toHaveValue('MANAGER')
  // 연계 학원이라고 단정하지 않는다.
  expect(within(dialog).getByLabelText('역할')).toHaveAccessibleDescription(
    '이 화면이 모르는 역할이에요. 이름만 고칠 수 있어요.',
  )

  await fill(dialog, '이름', '오실장')
  await press(dialog, '저장')

  await closed()
  // 지점을 null로 바꿔 보내면 이름만 고치려다 지점이 지워진다.
  expect(requestOf('PUT /api/v1/accounts/6').body).toEqual({
    name: '오실장',
    role: 'MANAGER',
    campusId: 2,
  })
})

// ── 지점 목록을 받지 못했을 때 ────────────────────────────

test('지점 목록을 받지 못하면 표에 알리고, 직원의 지점은 번호로 보여준다. 다시 불러오면 이름이 붙는다', async () => {
  let attempts = 0
  mockApi({
    [CAMPUSES]: () => {
      attempts += 1
      return attempts === 1
        ? problemResponse(403, { detail: '권한이 없습니다.', code: 'AUTH_ROLE_NOT_ALLOWED' })
        : jsonResponse(campuses)
    },
    [LIST]: () => jsonResponse(pageOf([me, desk])),
  })
  renderApp(PATH, { me: admin })
  await table()

  expect(await screen.findByRole('alert')).toHaveTextContent('지점 이름을 불러오지 못했어요.')
  // 지점이 없는 계정("-")과 같게 보이면 안 된다. "목록에 없는 지점"도 아니다(목록을 못 받았을 뿐이다).
  expect(row('desk.dongtan')).toHaveTextContent('지점 1')
  expect(within(row('admin')).getAllByRole('cell')[3]).toHaveTextContent('-')
  await userEvent.click(screen.getByRole('button', { name: '지점 다시 불러오기' }))

  await waitFor(() => expect(row('desk.dongtan')).toHaveTextContent('동탄관'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('만들기 창: 지점 목록을 받지 못하면 "골라 주세요"가 아니라 까닭을 알리고, 창 안에서 다시 불러올 수 있다', async () => {
  let attempts = 0
  mockApi({
    [CAMPUSES]: () => {
      attempts += 1
      // 화면이 뜰 때 한 번, 창이 열릴 때 한 번 다시 묻는다. 둘 다 실패하고, 직접 다시 불러올 때 성공한다.
      return attempts <= 2
        ? problemResponse(403, { detail: '권한이 없습니다.', code: 'AUTH_ROLE_NOT_ALLOWED' })
        : jsonResponse(campuses)
    },
    [LIST]: () => jsonResponse(pageOf([me])),
    [CREATE]: () => jsonResponse({ ...desk, id: 9, loginId: 'desk.new' }, 201),
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('계정 만들기', '계정 만들기')
  await fill(dialog, '아이디', 'desk.new')
  await fill(dialog, '이름', '최신입')
  await fill(dialog, '처음 비밀번호', PASSWORD)
  const campus = within(dialog).getByLabelText('지점')
  await waitFor(() => expect(campus).toHaveAccessibleDescription(/지점을 불러오지 못했어요/))
  expect(campus).toBeDisabled()

  await press(dialog, '만들기')

  // 막힌 선택 상자 아래에 "골라 주세요"만 남으면 할 수 있는 일이 없다.
  expect(campus).toHaveAccessibleDescription(
    '지점을 불러오지 못했어요. 아래에서 다시 불러와 주세요.',
  )
  expect(count(CREATE)).toBe(0)
  await press(dialog, '지점 다시 불러오기')

  // 창을 닫지 않았으므로 입력한 값이 남아 있다.
  await waitFor(() => expect(campus).toBeEnabled())
  expect(campus).not.toBeInvalid()
  expect(within(dialog).getByLabelText('처음 비밀번호')).toHaveValue(PASSWORD)
  await userEvent.selectOptions(campus, '능동관')
  await press(dialog, '만들기')
  await closed()
  expect(requestOf(CREATE).body).toMatchObject({ loginId: 'desk.new', campusId: 2 })
})

test('고치기 창: 지점 목록에 없는 지점의 직원은 그 지점을 선택지로 남기고, 이름만 고치면 그대로 보낸다', async () => {
  const far: Account = { ...desk, campusId: 7 }
  mockList([me, far])
  mockApi({ 'PUT /api/v1/accounts/2': () => jsonResponse({ ...far, name: '이실장' }) })
  renderApp(PATH, { me: admin })
  const dialog = await openEdit('desk.dongtan')
  expect(within(dialog).getByLabelText('지점')).toHaveDisplayValue('지점 7')

  await fill(dialog, '이름', '이실장')
  await press(dialog, '저장')

  await closed()
  expect(requestOf('PUT /api/v1/accounts/2').body).toEqual({
    name: '이실장',
    role: 'STAFF',
    campusId: 7,
  })
})

// ── 비밀번호 다시 정하기 창의 폼 전체 오류 ────────────────

test('비밀번호 다시 정하기: 응답을 받지 못하면 그대로 다시 눌러도 된다고 알린다', async () => {
  mockList()
  mockApi({ [RESET]: networkDown })
  renderApp(PATH, { me: admin })
  const dialog = await open('desk.dongtan 비밀번호 다시 정하기', '비밀번호 다시 정하기')
  await fill(dialog, '새 비밀번호', PASSWORD)

  await press(dialog, '저장')

  // 비밀번호는 목록에 보이지 않는다. "목록을 먼저 확인"은 할 수 없는 안내다.
  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent('저장됐는지 확인하지 못했어요. 그대로 다시 눌러도 돼요.')
  expect(alert).not.toHaveTextContent('목록')
  // 다시 누를 수 있게 입력은 남아 있다.
  expect(within(dialog).getByLabelText('새 비밀번호')).toHaveValue(PASSWORD)
})

test.each([
  ['차단', DISABLE, 'desk.dongtan 차단', '계정을 차단할까요?', '차단'],
  [
    '비밀번호 다시 정하기',
    RESET,
    'desk.dongtan 비밀번호 다시 정하기',
    '비밀번호 다시 정하기',
    '저장',
  ],
])(
  '%s: 서버 오류(5xx)면 그대로 다시 눌러도 된다고 알리고 요청 번호를 보여준다',
  async (_name, key, button, dialogName, action) => {
    mockList()
    mockApi({
      [key]: () =>
        problemResponse(500, {
          detail: '서버 오류',
          code: 'COMMON_INTERNAL_ERROR',
          requestId: '2d6a6e90a9d04a16bb607aa43840f2d7',
        }),
    })
    renderApp(PATH, { me: admin })
    const dialog = await open(button, dialogName)
    if (key === RESET) await fill(dialog, '새 비밀번호', PASSWORD)

    await press(dialog, action)

    // 응답은 왔지만 서버 쪽 문제다. 저장됐는지 알 수 없다.
    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent(
      '서버 오류 저장됐는지 확인하지 못했어요. 그대로 다시 눌러도 돼요.',
    )
    expect(alert).toHaveTextContent(
      '문의할 때 이 번호를 알려 주세요: 2d6a6e90a9d04a16bb607aa43840f2d7',
    )
  },
)

test('비밀번호 다시 정하기: 응답을 놓친 뒤 그대로 다시 눌러 성공하면 창을 닫고 알린다', async () => {
  let attempts = 0
  mockList()
  mockApi({
    [RESET]: () => {
      attempts += 1
      if (attempts === 1) networkDown()
      return noContent()
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('desk.dongtan 비밀번호 다시 정하기', '비밀번호 다시 정하기')
  await fill(dialog, '새 비밀번호', PASSWORD)
  await press(dialog, '저장')
  await within(dialog).findByRole('alert')

  // 입력이 남아 있어 다시 치지 않고 누른다.
  await press(dialog, '저장')

  await closed()
  expect(count(RESET)).toBe(2)
  expect(requestOf(RESET).body).toEqual({ password: PASSWORD })
  expect(screen.getByRole('status')).toHaveTextContent(
    'desk.dongtan 계정의 비밀번호를 다시 정했어요.',
  )
})

test('차단: 응답을 받지 못하면 그대로 다시 눌러도 된다고 알린다', async () => {
  mockList()
  mockApi({ [DISABLE]: networkDown })
  renderApp(PATH, { me: admin })
  const dialog = await open('desk.dongtan 차단', '계정을 차단할까요?')

  await press(dialog, '차단')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '저장됐는지 확인하지 못했어요. 그대로 다시 눌러도 돼요.',
  )
})

// ── 비밀번호가 남지 않는다 ────────────────────────────────

test('비밀번호를 다시 정한 뒤에는 요청에 실은 비밀번호가 캐시에 남지 않는다', async () => {
  mockList()
  mockApi({ [RESET]: () => noContent() })
  const { queryClient } = renderApp(PATH, { me: admin })
  const dialog = await open('desk.dongtan 비밀번호 다시 정하기', '비밀번호 다시 정하기')
  await fill(dialog, '새 비밀번호', PASSWORD)

  await press(dialog, '저장')

  await closed()
  await waitFor(() => expect(queryClient.getMutationCache().getAll()).toEqual([]))
})

test('비밀번호 다시 정하기가 실패한 뒤 창을 닫아도 요청에 실은 비밀번호가 캐시에 남지 않는다', async () => {
  mockList()
  mockApi({
    [RESET]: () =>
      problemResponse(400, {
        detail: '사용할 수 없는 비밀번호입니다.',
        code: 'AUTH_PASSWORD_NOT_ACCEPTABLE',
      }),
  })
  const { queryClient } = renderApp(PATH, { me: admin })
  const dialog = await open('desk.dongtan 비밀번호 다시 정하기', '비밀번호 다시 정하기')
  await fill(dialog, '새 비밀번호', PASSWORD)
  await press(dialog, '저장')
  await waitFor(() => expect(within(dialog).getByLabelText('새 비밀번호')).toBeInvalid())
  // 실패한 요청은 고치는 동안 폼과 함께 남아 있다.
  expect(
    JSON.stringify(
      queryClient
        .getMutationCache()
        .getAll()
        .map((m) => m.state.variables),
    ),
  ).toContain(PASSWORD)

  await press(dialog, '취소')

  await closed()
  await waitFor(() => expect(queryClient.getMutationCache().getAll()).toEqual([]))
})

// ── 목록의 가장자리 ───────────────────────────────────────

test('조건을 바꾸면 새 결과를 받는 동안 이전 조건의 계정을 보여주지 않는다', async () => {
  const filtered = hold()
  mockApi({
    [CAMPUSES]: () => jsonResponse(campuses),
    [LIST]: ({ query }) =>
      query.get('role') ? filtered.response : jsonResponse(pageOf([me, desk])),
  })
  renderApp(PATH, { me: admin })
  await table()

  await userEvent.selectOptions(screen.getByLabelText('역할'), '관리자')

  // 직원 줄이 "관리자" 조건 아래에 보이면, 그 줄의 차단 버튼도 눌린다.
  await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument())
  expect(screen.getByRole('status')).toHaveTextContent('계정 목록을 불러오고 있어요.')
  expect(screen.queryByText(/^전체 \d+개$/)).not.toBeInTheDocument()

  filtered.respond(jsonResponse(pageOf([me])))
  await table()
  expect(screen.queryByRole('row', { name: /^desk\.dongtan / })).not.toBeInTheDocument()
})

test('같은 조건에서 페이지를 넘기면 받는 동안 이전 페이지를 흐리게 보여주고, 또 넘기지 못하게 한다', async () => {
  const next = hold()
  mockApi({
    [CAMPUSES]: () => jsonResponse(campuses),
    [LIST]: ({ query }) =>
      query.get('page') === '0'
        ? jsonResponse(pageOf([desk], { totalPages: 3, totalElements: 45 }))
        : next.response,
  })
  renderApp(PATH, { me: admin })
  const first = await table()

  await userEvent.click(screen.getByRole('button', { name: '다음' }))

  await waitFor(() => expect(first.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true'))
  // 이전 페이지의 줄이 남아 있고, 받는 동안 "다음"을 연달아 눌러 페이지를 건너뛸 수 없다.
  expect(row('desk.dongtan')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()
  // 바깥 묶음이 흐리게 한다. 표까지 따로 흐리게 하면 두 번 겹쳐 너무 흐려진다.
  expect(first.parentElement).not.toHaveClass('opacity-60')

  next.respond(jsonResponse(pageOf([me], { page: 1, totalPages: 3, totalElements: 45 })))
  await waitFor(() => expect(row('admin')).toBeInTheDocument())
  expect(first.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false')
  expect(screen.getByRole('button', { name: '다음' })).toBeEnabled()
})

test('계정은 있는데 이 페이지가 비어 있으면 그렇게 알리고, 조건을 지닌 채 첫 페이지로 갈 수 있다', async () => {
  mockApi({
    [CAMPUSES]: () => jsonResponse(campuses),
    [LIST]: ({ query }) =>
      jsonResponse(
        query.get('page') === '0'
          ? pageOf([desk])
          : pageOf([], { page: 9, totalPages: 1, totalElements: 1 }),
      ),
  })
  const { router } = renderApp(`${PATH}?role=STAFF&page=9`, { me: admin })

  // "계정이 없어요"가 아니다.
  expect(
    await screen.findByRole('heading', { name: '이 페이지에는 계정이 없어요' }),
  ).toBeInTheDocument()
  expect(screen.getByText('조건에 맞는 계정은 모두 1개예요.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '첫 페이지로' }))

  await table()
  expect(router.state.location.search).toBe('?role=STAFF')
  expect(listQueries().at(-1)).toBe('role=STAFF&page=0')
})

test('주소의 지점이 지점 목록에 없어도 그 조건으로 묻고, 선택 상자에 고른 것으로 보여준다', async () => {
  mockList()
  renderApp(`${PATH}?campusId=7`, { me: admin })

  await waitFor(() => expect(listQueries()).toEqual(['campusId=7&page=0']))
  // 빼 버리면 지점으로 걸러진 목록인데 아무 지점도 고르지 않은 것처럼 보인다.
  expect(await screen.findByLabelText('지점')).toHaveDisplayValue('지점 7')
})
