import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import type { Partner } from '@/shared/partner'
import { setupDialog } from '@/test/dialog'
import {
  jsonResponse,
  mockApi,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
  unreadableResponse,
} from '@/test/mockApi'
import { admin, partner, renderApp, staff } from '@/test/renderApp'

setupMockApi()
setupDialog()

const PATH = '/admin/settings/partners'
const LIST = 'GET /api/v1/dongtanpass/partners'
const CREATE = 'POST /api/v1/dongtanpass/partners'
const ACCOUNTS = 'POST /api/v1/dongtanpass/partners/1/accounts'
const DEACTIVATE = 'POST /api/v1/dongtanpass/partners/1/deactivate'
const ACTIVATE = 'POST /api/v1/dongtanpass/partners/2/activate'
const PASSWORD = 'first-password-1'

const sunshine: Partner = {
  id: 1,
  name: '햇살수학',
  type: 'ACADEMY',
  active: true,
  createdAt: '2026-10-12T09:00:00+09:00',
}
const starlight: Partner = {
  id: 2,
  name: '별빛영어',
  type: 'ACADEMY',
  active: false,
  createdAt: '2026-10-13T09:00:00+09:00',
}

/** 학원 목록 조회를 흉내 낸다. 호출할 때마다 `server.rows`의 지금 값을 돌려준다. */
function mockList(rows: Partner[] = [sunshine, starlight]) {
  const server = { rows }
  mockApi({ [LIST]: () => jsonResponse(server.rows) })
  return server
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

function table() {
  return screen.findByRole('table', { name: '연계 학원' })
}

function cellsOf(name: string) {
  return within(screen.getByRole('row', { name: new RegExp(`^${name} `) }))
    .getAllByRole('cell')
    .slice(0, 3)
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

function closed() {
  return waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

// ── 들어가기와 보기 ──────────────────────────────────────

test('설정 메뉴에서 연계 학원으로 들어와 학원을 이름, 상태, 만든 날로 본다', async () => {
  mockList()
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse([]),
    'GET /api/v1/class-fees': () => jsonResponse([]),
  })
  const { router } = renderApp('/admin/settings/classes', { me: admin })
  const menu = await screen.findByRole('navigation', { name: '설정 메뉴' })

  await userEvent.click(within(menu).getByRole('link', { name: '연계 학원' }))

  await table()
  expect(router.state.location.pathname).toBe(PATH)
  expect(within(menu).getByRole('link', { name: '연계 학원' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(cellsOf('햇살수학')).toEqual(['햇살수학', '켜짐', '2026.10.12'])
  expect(cellsOf('별빛영어')).toEqual(['별빛영어', '꺼짐', '2026.10.13'])
  // 꺼진 학원은 흐리게 보인다.
  expect(screen.getByRole('row', { name: /^별빛영어 / })).toHaveClass('text-sub')
  expect(screen.getByText('켜진 학원 1곳, 꺼진 학원 1곳')).toBeInTheDocument()
})

test.each([
  ['직원', staff],
  ['연계 학원', partner],
])('%s은 연계 학원 화면을 볼 수 없고 목록을 요청하지도 않는다', async (_name, me) => {
  mockList()
  renderApp(PATH, { me })

  expect(
    await screen.findByRole('heading', { name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expect(requests()).toEqual([])
})

test('학원이 하나도 없으면 안내와 만들기 버튼을 보여준다', async () => {
  mockList([])
  renderApp(PATH, { me: admin })

  expect(await screen.findByRole('heading', { name: '연계 학원이 없어요' })).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: '연계 학원 만들기' })).toHaveLength(2)
})

test('목록을 불러오지 못하면 안내와 요청 번호를 보여주고, 그동안 만들기는 막으며, 다시 불러올 수 있다', async () => {
  let fail = true
  mockApi({
    [LIST]: () =>
      fail ? unreadableResponse('3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f') : jsonResponse([sunshine]),
  })
  renderApp(PATH, { me: admin })

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '문의할 때 이 번호를 알려 주세요: 3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f',
  )
  expect(screen.getByRole('button', { name: '연계 학원 만들기' })).toBeDisabled()

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

  await table()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('계정 관리에서 연계 학원 계정만 걸러 보는 링크가 있다', async () => {
  mockList()
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse([]),
    'GET /api/v1/accounts': () =>
      jsonResponse({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
  })
  const { router } = renderApp(PATH, { me: admin })
  await table()

  await userEvent.click(screen.getByRole('link', { name: '계정 관리' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/admin/settings/accounts'))
  expect(router.state.location.search).toBe('?role=PARTNER')
})

// ── 학원 만들기 ──────────────────────────────────────────

test('학원을 만들면 이름(앞뒤 공백을 뗀 것)을 멱등 키와 함께 보내고, 창을 닫고, 목록을 다시 받는다', async () => {
  const server = mockList([sunshine])
  const created: Partner = { ...sunshine, id: 3, name: '달빛국어' }
  mockApi({
    [CREATE]: () => {
      server.rows = [sunshine, created]
      return jsonResponse(created, 201)
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('연계 학원 만들기', '연계 학원 만들기')

  await fill(dialog, '학원 이름', ' 달빛국어 ')
  await press(dialog, '만들기')

  await closed()
  const request = requestOf(CREATE)
  expect(request.body).toEqual({ name: '달빛국어' })
  expect(request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
  expect(screen.getByRole('status')).toHaveTextContent(
    '달빛국어 학원을 만들었어요. 이어서 이 학원의 계정을 만들어 주세요.',
  )
  await waitFor(() => expect(cellsOf('달빛국어')[1]).toBe('켜짐'))
})

test('학원 이름을 비우면 보내지 않는다', async () => {
  mockList()
  renderApp(PATH, { me: admin })
  const dialog = await open('연계 학원 만들기', '연계 학원 만들기')

  await fill(dialog, '학원 이름', '   ')
  await press(dialog, '만들기')

  expect(within(dialog).getByLabelText('학원 이름')).toHaveAccessibleDescription(
    /학원 이름을 입력해 주세요/,
  )
  expect(count(CREATE)).toBe(0)
})

test('같은 이름의 학원이 있으면 이름 칸에 서버 문구를 보여준다', async () => {
  mockList()
  mockApi({
    [CREATE]: () =>
      problemResponse(409, {
        detail: '같은 이름의 연계 학원이 있습니다.',
        code: 'DONGTANPASS_PARTNER_NAME_DUPLICATED',
      }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('연계 학원 만들기', '연계 학원 만들기')

  await fill(dialog, '학원 이름', '햇살수학')
  await press(dialog, '만들기')

  await waitFor(() =>
    expect(within(dialog).getByLabelText('학원 이름')).toHaveAccessibleDescription(
      /같은 이름의 연계 학원이 있습니다/,
    ),
  )
})

test('만들기의 응답을 받지 못한 뒤 그대로 다시 누르면 같은 멱등 키로 보낸다', async () => {
  let attempts = 0
  mockList()
  mockApi({
    [CREATE]: () => {
      attempts += 1
      if (attempts === 1) throw new TypeError('Failed to fetch')
      return jsonResponse({ ...sunshine, id: 3, name: '달빛국어' }, 201)
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('연계 학원 만들기', '연계 학원 만들기')
  await fill(dialog, '학원 이름', '달빛국어')
  await press(dialog, '만들기')
  // 멱등 키를 싣는다. 그대로 다시 눌러도 한 번만 만들어진다.
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('두 번 저장되지 않아요.')
  const firstKey = requestOf(CREATE).headers.get('Idempotency-Key')

  await press(dialog, '만들기')

  await closed()
  expect(requestOf(CREATE).headers.get('Idempotency-Key')).toBe(firstKey)
})

// ── 계정 만들기 ──────────────────────────────────────────

test('계정을 만들면 그 학원의 주소로 아이디·이름·비밀번호를 보내고, 계정 관리로 가는 링크를 보여준다', async () => {
  mockList()
  mockApi({
    [ACCOUNTS]: () =>
      jsonResponse(
        {
          id: 10,
          loginId: 'sunshine.desk',
          name: '햇살수학 데스크',
          partnerId: 1,
          createdAt: '2026-10-15T09:00:00+09:00',
        },
        201,
      ),
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('햇살수학 계정 만들기', '연계 학원 계정 만들기')
  expect(dialog).toHaveTextContent('햇살수학에서 같이 쓰는 계정이에요.')

  // 아이디는 소문자로 바꿔 받는다.
  await fill(dialog, '아이디', 'Sunshine.Desk')
  await fill(dialog, '이름', '햇살수학 데스크')
  await fill(dialog, '처음 비밀번호', PASSWORD)
  await press(dialog, '만들기')

  await closed()
  const request = requestOf(ACCOUNTS)
  expect(request.body).toEqual({
    loginId: 'sunshine.desk',
    name: '햇살수학 데스크',
    password: PASSWORD,
  })
  // 서버가 받지 않는다(비밀번호가 든 본문).
  expect(request.headers.get('Idempotency-Key')).toBeNull()
  const notice = screen.getByRole('status')
  expect(notice).toHaveTextContent('햇살수학의 sunshine.desk 계정을 만들었어요.')
  expect(within(notice).getByRole('link', { name: '연계 학원 계정 보기' })).toHaveAttribute(
    'href',
    '/admin/settings/accounts?role=PARTNER',
  )
})

test('계정 만들기: 아이디·이름·비밀번호를 보내기 전에 확인한다', async () => {
  mockList()
  renderApp(PATH, { me: admin })
  const dialog = await open('햇살수학 계정 만들기', '연계 학원 계정 만들기')

  await fill(dialog, '아이디', 'a!')
  await fill(dialog, '처음 비밀번호', 'short')
  await press(dialog, '만들기')

  expect(within(dialog).getByLabelText('아이디')).toHaveAccessibleDescription(/3~50자여야 해요/)
  expect(within(dialog).getByLabelText('이름')).toHaveAccessibleDescription(/이름을 입력해 주세요/)
  expect(within(dialog).getByLabelText('처음 비밀번호')).toHaveAccessibleDescription(
    /10자 이상으로 입력해 주세요/,
  )
  expect(count(ACCOUNTS)).toBe(0)
})

test('계정 만들기: 이미 쓰는 아이디면 아이디 칸에 서버 문구를 보여준다', async () => {
  mockList()
  mockApi({
    [ACCOUNTS]: () =>
      problemResponse(409, {
        detail: '이미 사용 중인 아이디입니다.',
        code: 'AUTH_LOGIN_ID_DUPLICATED',
      }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('햇살수학 계정 만들기', '연계 학원 계정 만들기')
  await fill(dialog, '아이디', 'sunshine.desk')
  await fill(dialog, '이름', '햇살수학 데스크')
  await fill(dialog, '처음 비밀번호', PASSWORD)

  await press(dialog, '만들기')

  await waitFor(() =>
    expect(within(dialog).getByLabelText('아이디')).toHaveAccessibleDescription(
      /이미 사용 중인 아이디입니다/,
    ),
  )
})

test('계정 만들기: 그 사이 학원이 꺼졌으면 학원을 먼저 켜라고 알리고, 목록을 다시 받는다', async () => {
  const server = mockList()
  mockApi({
    [ACCOUNTS]: () => {
      server.rows = [{ ...sunshine, active: false }, starlight]
      return problemResponse(409, {
        detail: '꺼진 연계 학원에는 계정을 만들 수 없습니다.',
        code: 'DONGTANPASS_PARTNER_INACTIVE_FOR_ACCOUNT',
      })
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('햇살수학 계정 만들기', '연계 학원 계정 만들기')
  await fill(dialog, '아이디', 'sunshine.desk')
  await fill(dialog, '이름', '햇살수학 데스크')
  await fill(dialog, '처음 비밀번호', PASSWORD)

  await press(dialog, '만들기')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '햇살수학 학원이 꺼져 있어요. 학원을 먼저 켠 뒤에 계정을 만들어 주세요.',
  )
  await press(dialog, '취소')
  await closed()
  await waitFor(() => expect(cellsOf('햇살수학')[1]).toBe('꺼짐'))
})

test('계정 만들기: 응답을 받지 못하면 다시 누르라고 하지 않고 계정 관리에서 먼저 확인하라고 알린다', async () => {
  mockList()
  mockApi({
    [ACCOUNTS]: () => {
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('햇살수학 계정 만들기', '연계 학원 계정 만들기')
  await fill(dialog, '아이디', 'sunshine.desk')
  await fill(dialog, '이름', '햇살수학 데스크')
  await fill(dialog, '처음 비밀번호', PASSWORD)

  await press(dialog, '만들기')

  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent('계정 관리에서 sunshine.desk 계정이 있는지 먼저 확인해 주세요.')
  // 멱등 키가 없다. 다시 누르면 "이미 사용 중인 아이디"가 온다.
  expect(alert).not.toHaveTextContent('다시 눌러 주세요')
})

test('꺼진 학원에는 계정 만들기를 막고 그 까닭을 적어 둔다', async () => {
  mockList()
  renderApp(PATH, { me: admin })
  await table()

  expect(screen.getByRole('button', { name: '별빛영어 계정 만들기' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '햇살수학 계정 만들기' })).toBeEnabled()
  expect(
    screen.getByText('꺼진 학원에는 계정을 만들 수 없어요. 먼저 켜 주세요.'),
  ).toBeInTheDocument()
})

// ── 끄기와 켜기 ──────────────────────────────────────────

test('끄기는 계정이 차단된다는 것을 먼저 묻고, 끄면 알리고 목록을 다시 받는다', async () => {
  const server = mockList()
  mockApi({
    [DEACTIVATE]: () => {
      server.rows = [{ ...sunshine, active: false }, starlight]
      return jsonResponse({ ...sunshine, active: false })
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('햇살수학 끄기', '학원을 끌까요?')
  expect(dialog).toHaveTextContent(
    '햇살수학 학원의 계정이 모두 차단되고, 로그인돼 있으면 바로 로그아웃돼요.',
  )
  expect(dialog).toHaveTextContent('이미 발급한 패스는 그대로 쓸 수 있어요.')
  expect(count(DEACTIVATE)).toBe(0)

  await press(dialog, '끄기')

  await closed()
  expect(screen.getByRole('status')).toHaveTextContent(
    '햇살수학 학원을 껐어요. 이 학원의 계정은 모두 차단됐어요.',
  )
  await waitFor(() => expect(cellsOf('햇살수학')[1]).toBe('꺼짐'))
})

test('끄기가 서버 오류로 끝나면 일부 계정이 차단되지 않았다고 알리고, 다시 누르면 다시 보낸다', async () => {
  let attempts = 0
  mockList()
  mockApi({
    [DEACTIVATE]: () => {
      attempts += 1
      if (attempts === 1) {
        // 우리 서버의 500은 늘 코드를 싣는다(COMMON_INTERNAL_ERROR).
        return problemResponse(500, {
          detail: '서버 오류',
          code: 'COMMON_INTERNAL_ERROR',
          requestId: '1f2e3d4c5b6a79880716253443526170',
        })
      }
      return jsonResponse({ ...sunshine, active: false })
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('햇살수학 끄기', '학원을 끌까요?')

  await press(dialog, '끄기')

  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent(
    '일부 계정을 차단하지 못했어요. 다시 눌러 남은 계정을 차단해 주세요.',
  )
  expect(alert).toHaveTextContent(
    '문의할 때 이 번호를 알려 주세요: 1f2e3d4c5b6a79880716253443526170',
  )

  await press(dialog, '끄기')

  await closed()
  expect(count(DEACTIVATE)).toBe(2)
})

test('켜기는 묻지 않고 켜며, 끌 때 차단된 계정은 계정 관리에서 풀라고 링크와 함께 알린다', async () => {
  const server = mockList()
  mockApi({
    [ACTIVATE]: () => {
      server.rows = [sunshine, { ...starlight, active: true }]
      return jsonResponse({ ...starlight, active: true })
    },
  })
  renderApp(PATH, { me: admin })
  await table()

  await userEvent.click(screen.getByRole('button', { name: '별빛영어 켜기' }))

  const notice = await screen.findByRole('status')
  expect(notice).toHaveTextContent(
    '별빛영어 학원을 켰어요. 끌 때 차단된 계정은 계정 관리에서 따로 풀어 주세요.',
  )
  expect(within(notice).getByRole('link', { name: '연계 학원 계정 보기' })).toHaveAttribute(
    'href',
    '/admin/settings/accounts?role=PARTNER',
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(cellsOf('별빛영어')[1]).toBe('켜짐'))
})

test('켜기가 실패하면 어느 학원인지와 서버 문구를 알린다', async () => {
  mockList()
  mockApi({
    [ACTIVATE]: () =>
      problemResponse(404, {
        detail: '연계 학원을 찾을 수 없습니다.',
        code: 'DONGTANPASS_PARTNER_NOT_FOUND',
      }),
  })
  renderApp(PATH, { me: admin })
  await table()

  await userEvent.click(screen.getByRole('button', { name: '별빛영어 켜기' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '별빛영어 학원을 켜지 못했어요. 연계 학원을 찾을 수 없습니다.',
  )
})

// ── 리뷰에서 보강한 것 ──────────────────────────────────

const ACCOUNTS_PATH = '/admin/settings/accounts'
const sunshineDesk = {
  id: 10,
  loginId: 'sunshine.desk',
  name: '햇살수학 데스크',
  role: 'PARTNER' as const,
  campusId: null,
  partnerId: 1,
  status: 'ACTIVE' as 'ACTIVE' | 'DISABLED',
  createdAt: '2026-10-15T09:00:00+09:00',
}

/** 계정 관리 화면의 조회를 흉내 낸다. 목록은 호출할 때마다 `server.items`의 지금 값을 돌려준다. */
function mockAccounts(items: (typeof sunshineDesk)[] = [sunshineDesk]) {
  const server = { items }
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse([]),
    'GET /api/v1/accounts': () =>
      jsonResponse({
        items: server.items,
        page: 0,
        size: 20,
        totalElements: server.items.length,
        totalPages: server.items.length === 0 ? 0 : 1,
      }),
  })
  return server
}

function accountListRequests() {
  return requests().filter((request) => request.startsWith('GET /api/v1/accounts')).length
}

/** 설정 메뉴에서 탭을 눌러 옮겨 간다. 받아 둔 목록이 남아 있는 채로 오간다. */
async function goToTab(name: string) {
  const menu = await screen.findByRole('navigation', { name: '설정 메뉴' })
  await userEvent.click(within(menu).getByRole('link', { name }))
}

test('계정 만들기 창을 닫으면 요청 기록에 비밀번호가 남지 않는다. 성공했든 실패해서 취소했든', async () => {
  let attempts = 0
  mockList()
  mockApi({
    [ACCOUNTS]: () => {
      attempts += 1
      if (attempts === 1) {
        return problemResponse(409, {
          detail: '이미 사용 중인 아이디입니다.',
          code: 'AUTH_LOGIN_ID_DUPLICATED',
        })
      }
      return jsonResponse(sunshineDesk, 201)
    },
  })
  const { queryClient } = renderApp(PATH, { me: admin })

  // 실패한 뒤 취소로 닫는다.
  let dialog = await open('햇살수학 계정 만들기', '연계 학원 계정 만들기')
  await fill(dialog, '아이디', 'sunshine.desk')
  await fill(dialog, '이름', '햇살수학 데스크')
  await fill(dialog, '처음 비밀번호', PASSWORD)
  await press(dialog, '만들기')
  await waitFor(() =>
    expect(within(dialog).getByLabelText('아이디')).toHaveAccessibleDescription(/이미 사용 중/),
  )
  await press(dialog, '취소')
  await closed()
  await waitFor(() => expect(queryClient.getMutationCache().getAll()).toEqual([]))

  // 성공해서 닫힌다.
  dialog = await open('햇살수학 계정 만들기', '연계 학원 계정 만들기')
  await fill(dialog, '아이디', 'sunshine.desk2')
  await fill(dialog, '이름', '햇살수학 데스크')
  await fill(dialog, '처음 비밀번호', PASSWORD)
  await press(dialog, '만들기')
  await closed()
  await waitFor(() => expect(queryClient.getMutationCache().getAll()).toEqual([]))
})

test('학원을 끈 뒤 계정 관리로 돌아가면 계정 목록을 새로 받아 차단된 것이 보인다', async () => {
  const accounts = mockAccounts()
  const server = mockList()
  mockApi({
    [DEACTIVATE]: () => {
      server.rows = [{ ...sunshine, active: false }, starlight]
      accounts.items = [{ ...sunshineDesk, status: 'DISABLED' }]
      return jsonResponse({ ...sunshine, active: false })
    },
  })
  renderApp(ACCOUNTS_PATH, { me: admin })
  await screen.findByRole('table', { name: '계정 목록' })
  expect(accountListRequests()).toBe(1)

  await goToTab('연계 학원')
  const dialog = await open('햇살수학 끄기', '학원을 끌까요?')
  await press(dialog, '끄기')
  await closed()
  await goToTab('계정')

  // 30초 동안은 받아 둔 목록을 그대로 쓴다. 낡은 것으로 표시하지 않으면 "사용 중"으로 남는다.
  await waitFor(() => expect(accountListRequests()).toBe(2))
  await waitFor(() =>
    expect(screen.getByRole('row', { name: /^sunshine\.desk / })).toHaveTextContent('차단됨'),
  )
})

test('계정을 만든 뒤 계정 관리로 돌아가면 계정 목록을 새로 받는다', async () => {
  const accounts = mockAccounts([])
  mockList()
  mockApi({
    [ACCOUNTS]: () => {
      accounts.items = [sunshineDesk]
      return jsonResponse(sunshineDesk, 201)
    },
  })
  renderApp(ACCOUNTS_PATH, { me: admin })
  await screen.findByRole('heading', { name: '계정이 없어요' })

  await goToTab('연계 학원')
  const dialog = await open('햇살수학 계정 만들기', '연계 학원 계정 만들기')
  await fill(dialog, '아이디', 'sunshine.desk')
  await fill(dialog, '이름', '햇살수학 데스크')
  await fill(dialog, '처음 비밀번호', PASSWORD)
  await press(dialog, '만들기')
  await closed()
  await goToTab('계정')

  await waitFor(() => expect(accountListRequests()).toBe(2))
  expect(await screen.findByText('sunshine.desk')).toBeInTheDocument()
})

test('끄기가 실패한 창을 닫고 다시 열면 지난 오류가 남아 있지 않다', async () => {
  mockList()
  mockApi({
    [DEACTIVATE]: () =>
      problemResponse(500, { detail: '서버 오류', code: 'COMMON_INTERNAL_ERROR' }),
  })
  renderApp(PATH, { me: admin })
  let dialog = await open('햇살수학 끄기', '학원을 끌까요?')
  await press(dialog, '끄기')
  await within(dialog).findByRole('alert')
  await press(dialog, '닫기')
  await closed()

  dialog = await open('햇살수학 끄기', '학원을 끌까요?')

  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
})

test('끄기가 실패한 뒤에도 학원 목록을 다시 받아, 닫으면 실제 상태가 보인다', async () => {
  const server = mockList()
  mockApi({
    [DEACTIVATE]: () => {
      // 학원은 꺼졌는데 계정 일부를 차단하지 못했다.
      server.rows = [{ ...sunshine, active: false }, starlight]
      return problemResponse(500, { detail: '서버 오류', code: 'COMMON_INTERNAL_ERROR' })
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('햇살수학 끄기', '학원을 끌까요?')
  await press(dialog, '끄기')
  await within(dialog).findByRole('alert')

  await press(dialog, '닫기')

  await closed()
  await waitFor(() => expect(cellsOf('햇살수학')[1]).toBe('꺼짐'))
})

test('끄기의 응답이 앞단이 만든 5xx(코드 없음)면 꺼졌다고 단정하지 않고 확인하지 못했다고 알린다', async () => {
  mockList()
  mockApi({ [DEACTIVATE]: () => problemResponse(502, { detail: 'Bad Gateway' }) })
  renderApp(PATH, { me: admin })
  const dialog = await open('햇살수학 끄기', '학원을 끌까요?')

  await press(dialog, '끄기')

  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent('꺼졌는지 확인하지 못했어요. 그대로 다시 눌러도 돼요.')
  expect(alert).not.toHaveTextContent('일부 계정을 차단하지 못했어요')
})

test('CSRF 토큰을 받지 못해 끄기를 보내지 않았으면 일부 계정을 차단하지 못했다고 하지 않는다', async () => {
  mockList()
  mockApi({
    'GET /api/v1/auth/csrf': () =>
      problemResponse(500, { detail: '점검 중이에요.', code: 'COMMON_INTERNAL_ERROR' }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await open('햇살수학 끄기', '학원을 끌까요?')
  // 화면을 열어 둔 사이 토큰 쿠키만 사라졌다.
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'

  await press(dialog, '끄기')

  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent('점검 중이에요.')
  expect(alert).not.toHaveTextContent('일부 계정을 차단하지 못했어요')
  expect(count(DEACTIVATE)).toBe(0)
})

test('켜는 중에는 연계 학원 만들기도 막는다. 눌러서 켜기의 결과 안내를 놓치지 않게', async () => {
  let respond!: () => void
  mockList()
  mockApi({
    [ACTIVATE]: () =>
      new Promise<Response>((resolve) => {
        respond = () => resolve(jsonResponse({ ...starlight, active: true }))
      }),
  })
  renderApp(PATH, { me: admin })
  await table()

  await userEvent.click(screen.getByRole('button', { name: '별빛영어 켜기' }))

  await waitFor(() => expect(count(ACTIVATE)).toBe(1))
  expect(screen.getByRole('button', { name: '연계 학원 만들기' })).toBeDisabled()
  respond()
  expect(await screen.findByRole('status')).toHaveTextContent('별빛영어 학원을 켰어요.')
})
