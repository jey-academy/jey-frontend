import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { setupDialog } from '@/test/dialog'
import {
  jsonResponse,
  mockApi,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
} from '@/test/mockApi'
import { renderApp, staff } from '@/test/renderApp'
import type { Guardian, Student } from '../api'

// 학생 상세의 "번호 보기". 볼 때마다 서버에 기록이 남고 횟수에 들며, 받은 전체 번호는 화면에만 둔다.

setupMockApi()
setupDialog()

// 콘솔을 막아 둔 테스트가 있다. 뒤의 테스트에서 React 경고가 가려지지 않게 되돌린다.
afterEach(() => vi.restoreAllMocks())

const PATH = '/desk/students/1'
const DETAIL = 'GET /api/v1/students/1'
const REVEAL_STUDENT = 'POST /api/v1/students/1/phone/reveal'
const REVEAL_MOTHER = 'POST /api/v1/students/1/guardians/7/phone/reveal'
const REVEAL_FATHER = 'POST /api/v1/students/1/guardians/8/phone/reveal'

// 전화번호는 서버가 가운데를 가려서 준다.
const mother: Guardian = {
  id: 7,
  relation: 'MOTHER',
  name: '이영희',
  phone: '010-****-5678',
  linkedToExisting: false,
}
const father: Guardian = {
  id: 8,
  relation: 'FATHER',
  name: '김철수',
  phone: '010-****-5432',
  linkedToExisting: false,
}
const doyun: Student = {
  id: 1,
  campusId: 1,
  classId: null,
  name: '김도윤',
  grade: 'MIDDLE_1',
  school: null,
  phone: '010-****-0000',
  status: 'ENROLLED',
  registeredAt: '2026-09-01',
  guardians: [mother, father],
  primaryContact: { name: '이영희', relation: 'MOTHER', phone: '010-****-5678' },
  siblings: [],
}

/** 상세 조회를 흉내 낸다. 호출할 때마다 `server.student`의 지금 값을 돌려준다. */
function mockDetail(student: Student = doyun) {
  const server = { student }
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse([{ id: 1, name: '동탄관' }]),
    'GET /api/v1/classes': () => jsonResponse([]),
    [DETAIL]: () => jsonResponse(server.student),
  })
  return server
}

/** 요청이 너무 많다는 답. retryAfter를 주면 실제 서버처럼 Retry-After(초)를 싣는다. */
function tooMany(code: string, retryAfter?: string) {
  return new Response(
    JSON.stringify({ title: 'Error', status: 429, detail: '요청이 너무 많습니다.', code }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/problem+json',
        ...(retryAfter === undefined ? {} : { 'Retry-After': retryAfter }),
      },
    },
  )
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

function reveals() {
  return requests().filter((request) => request.endsWith('/phone/reveal'))
}

function guardianRow(name: string) {
  const card = screen.getByRole('heading', { level: 2, name: '학부모' }).parentElement!
  return within(card)
    .getAllByRole('listitem')
    .find((item) => item.textContent.includes(name))!
}

async function ready() {
  await screen.findByRole('heading', { level: 1, name: '김도윤' })
}

function press(name: string) {
  return userEvent.click(screen.getByRole('button', { name }))
}

// ── 보기 ─────────────────────────────────────────────────

test('화면을 열기만 해서는 전체 번호를 묻지 않는다', async () => {
  mockDetail()
  renderApp(PATH, { me: staff })
  await ready()

  expect(screen.getByRole('button', { name: '본인 번호 보기' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '이영희 번호 보기' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '김철수 번호 보기' })).toBeEnabled()
  expect(reveals()).toEqual([])
})

test('본인 번호가 없으면 번호 보기를 보여주지 않는다', async () => {
  mockDetail({ ...doyun, phone: null })
  renderApp(PATH, { me: staff })
  await ready()

  expect(screen.queryByRole('button', { name: '본인 번호 보기' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '이영희 번호 보기' })).toBeInTheDocument()
})

test('학부모의 번호 보기를 누르면 그 학부모의 전체 번호만 그 줄에 보여주고, 가리면 버린다', async () => {
  mockDetail()
  mockApi({ [REVEAL_MOTHER]: () => jsonResponse({ phone: '010-1234-5678' }) })
  renderApp(PATH, { me: staff })
  await ready()

  await press('이영희 번호 보기')

  expect(await within(guardianRow('이영희')).findByText('010-1234-5678')).toBeInTheDocument()
  // 본문 없는 POST다. 멱등 키 대상이 아니다.
  expect(requestOf(REVEAL_MOTHER).init.body).toBeUndefined()
  expect(requestOf(REVEAL_MOTHER).headers.get('Idempotency-Key')).toBeNull()
  expect(reveals()).toEqual([REVEAL_MOTHER])
  // 다른 줄과 대표 연락처는 가린 채로 둔다.
  expect(guardianRow('김철수')).toHaveTextContent('010-****-5432')
  expect(document.body.textContent.match(/010-1234-5678/g)).toHaveLength(1)

  await press('이영희 번호 가리기')

  expect(guardianRow('이영희')).toHaveTextContent('010-****-5678')
  expect(document.body.textContent).not.toContain('010-1234-5678')
  expect(screen.getByRole('button', { name: '이영희 번호 보기' })).toBeEnabled()
})

test('가린 뒤 다시 보려면 서버에 다시 묻는다', async () => {
  mockDetail()
  mockApi({ [REVEAL_FATHER]: () => jsonResponse({ phone: '010-9876-5432' }) })
  renderApp(PATH, { me: staff })
  await ready()

  await press('김철수 번호 보기')
  await within(guardianRow('김철수')).findByText('010-9876-5432')
  await press('김철수 번호 가리기')
  await press('김철수 번호 보기')

  await within(guardianRow('김철수')).findByText('010-9876-5432')
  // 볼 때마다 서버에 기록이 남는다. 받아 둔 번호를 다시 꺼내 쓰지 않는다.
  expect(count(REVEAL_FATHER)).toBe(2)
})

test('본인 번호 보기는 학생의 번호를 묻는다', async () => {
  mockDetail()
  mockApi({ [REVEAL_STUDENT]: () => jsonResponse({ phone: '010-5555-0000' }) })
  renderApp(PATH, { me: staff })
  await ready()

  await press('본인 번호 보기')

  expect(await screen.findByText('010-5555-0000')).toBeInTheDocument()
  expect(reveals()).toEqual([REVEAL_STUDENT])
  // 번호 지우기는 그대로 쓸 수 있다.
  expect(screen.getByRole('button', { name: '번호 지우기' })).toBeEnabled()
})

test('보는 중에 두 번 눌러도 한 번만 묻는다', async () => {
  let respond!: (response: Response) => void
  mockDetail()
  mockApi({ [REVEAL_MOTHER]: () => new Promise<Response>((resolve) => (respond = resolve)) })
  renderApp(PATH, { me: staff })
  await ready()

  await userEvent.dblClick(screen.getByRole('button', { name: '이영희 번호 보기' }))

  // 보는 중이라는 것이 버튼 이름에도 드러난다(화면 낭독기).
  const button = screen.getByRole('button', { name: '이영희 번호 보는 중' })
  expect(button).toBeDisabled()
  expect(button).toHaveTextContent('보는 중')
  expect(count(REVEAL_MOTHER)).toBe(1)
  // 다른 줄은 따로 볼 수 있다.
  expect(screen.getByRole('button', { name: '김철수 번호 보기' })).toBeEnabled()

  respond(jsonResponse({ phone: '010-1234-5678' }))
  expect(await screen.findByText('010-1234-5678')).toBeInTheDocument()
})

// ── 전체 번호를 남기지 않는다 ────────────────────────────

test('받은 전체 번호를 캐시, 주소, 콘솔, 저장소에 남기지 않고, 화면을 떠났다 돌아오면 가려져 있다', async () => {
  const logs = ['log', 'info', 'warn', 'error', 'debug'].map((method) =>
    vi.spyOn(console, method as 'log').mockImplementation(() => {}),
  )
  mockDetail()
  mockApi({
    [REVEAL_MOTHER]: () => jsonResponse({ phone: '010-1234-5678' }),
    'POST /api/v1/students/search': () =>
      jsonResponse({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
  })
  const { router, queryClient } = renderApp(PATH, { me: staff })
  await ready()
  await press('이영희 번호 보기')
  await screen.findByText('010-1234-5678')

  const leaked = (text: string) => ['1234-5678', '12345678'].some((digits) => text.includes(digits))
  // 보여주는 동안에도 화면의 state에만 있다(mutation 캐시에서는 받은 직후 지워진다).
  const caches = () =>
    JSON.stringify([
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
      queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => [mutation.state.data, mutation.state.variables]),
    ])
  await waitFor(() => expect(leaked(caches())).toBe(false))
  expect(leaked(JSON.stringify(router.state.location))).toBe(false)
  expect(leaked(JSON.stringify({ ...localStorage, ...sessionStorage }))).toBe(false)
  expect(requests().some((key) => leaked(key))).toBe(false)

  await router.navigate('/desk/students')
  await screen.findByRole('heading', { level: 1, name: '학생' })
  expect(leaked(document.body.textContent)).toBe(false)
  await router.navigate(PATH)
  await ready()

  // 다시 보려면 다시 눌러야 한다.
  expect(guardianRow('이영희')).toHaveTextContent('010-****-5678')
  expect(leaked(document.body.textContent)).toBe(false)
  expect(leaked(caches())).toBe(false)
  expect(count(REVEAL_MOTHER)).toBe(1)
  // 객체째 찍힌 것도 잡도록 JSON으로 편다.
  const logged = logs.flatMap((log) => log.mock.calls.flat())
  expect(leaked(JSON.stringify(logged))).toBe(false)
})

test('보여주는 사이에 그 학부모의 번호가 바뀌면 보여주던 전체 번호를 버린다', async () => {
  const server = mockDetail()
  mockApi({ [REVEAL_MOTHER]: () => jsonResponse({ phone: '010-1234-5678' }) })
  const { queryClient } = renderApp(PATH, { me: staff })
  await ready()
  await press('이영희 번호 보기')
  await screen.findByText('010-1234-5678')

  // 다른 직원이 번호를 바꿨고, 화면이 학생을 다시 받았다.
  server.student = { ...doyun, guardians: [{ ...mother, phone: '010-****-9999' }, father] }
  await queryClient.invalidateQueries({ queryKey: ['students', 'detail', 1] })

  await waitFor(() => expect(guardianRow('이영희')).toHaveTextContent('010-****-9999'))
  expect(document.body.textContent).not.toContain('010-1234-5678')
  expect(screen.getByRole('button', { name: '이영희 번호 보기' })).toBeEnabled()
})

// ── 실패 ─────────────────────────────────────────────────

test.each([
  [
    '응답을 받지 못하면',
    () => {
      throw new TypeError('Failed to fetch')
    },
    '연결 상태를 확인해 주세요.',
  ],
  [
    '서버 오류면',
    () => problemResponse(500, {}),
    '일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
  ],
  ['권한이 없으면', () => problemResponse(403, { detail: '권한이 없습니다.' }), '권한이 없습니다.'],
])('번호 보기: %s 그 줄에 알리고, 알아서 다시 묻지 않는다', async (_case, respond, message) => {
  mockDetail()
  mockApi({ [REVEAL_MOTHER]: respond })
  renderApp(PATH, { me: staff })
  await ready()

  await press('이영희 번호 보기')

  expect(await within(guardianRow('이영희')).findByRole('alert')).toHaveTextContent(message)
  // 서버가 이미 한 번으로 셌을 수 있다(서버 오류, 응답만 잃은 경우). 다시 보내는 것은 직원이 누를 때만 한다.
  expect(count(REVEAL_MOTHER)).toBe(1)
  // 학생이 달라진 것이 아니므로 다시 받지 않는다.
  expect(count(DETAIL)).toBe(1)
  expect(guardianRow('이영희')).toHaveTextContent('010-****-5678')
  expect(screen.getByRole('button', { name: '이영희 번호 보기' })).toBeEnabled()
  expect(within(guardianRow('김철수')).queryByRole('alert')).not.toBeInTheDocument()
})

test.each([
  ['900', '약 15분 뒤'],
  ['3600', '약 60분 뒤'],
  // 분으로 올린다. 1분 1초면 2분이다.
  ['61', '약 2분 뒤'],
  ['1', '약 1분 뒤'],
  [undefined, '잠시 뒤'],
])(
  '번호 보기 한도(Retry-After: %s)에 걸리면 %s에 다시 하라고 알린다',
  async (retryAfter, phrase) => {
    mockDetail()
    mockApi({ [REVEAL_MOTHER]: () => tooMany('MEMBER_PHONE_REVEAL_LIMITED', retryAfter) })
    renderApp(PATH, { me: staff })
    await ready()

    await press('이영희 번호 보기')

    expect(await within(guardianRow('이영희')).findByRole('alert')).toHaveTextContent(
      `번호 보기를 너무 많이 했어요. ${phrase}에 다시 시도해 주세요.`,
    )
    expect(count(REVEAL_MOTHER)).toBe(1)
    expect(count(DETAIL)).toBe(1)
  },
)

test('번호 보기: 실패한 뒤 다시 눌러 성공하면 안내를 지우고 번호를 보여준다', async () => {
  let attempts = 0
  mockDetail()
  mockApi({
    [REVEAL_MOTHER]: () => {
      attempts += 1
      if (attempts === 1) throw new TypeError('Failed to fetch')
      return jsonResponse({ phone: '010-1234-5678' })
    },
  })
  renderApp(PATH, { me: staff })
  await ready()
  await press('이영희 번호 보기')
  await within(guardianRow('이영희')).findByRole('alert')

  await press('이영희 번호 보기')

  expect(await screen.findByText('010-1234-5678')).toBeInTheDocument()
  expect(within(guardianRow('이영희')).queryByRole('alert')).not.toBeInTheDocument()
})

test.each([
  [
    '연결이 끊긴 학부모',
    '이영희 번호 보기',
    REVEAL_MOTHER,
    'MEMBER_GUARDIAN_NOT_FOUND',
    '이미 연결이 끊긴 학부모예요.',
  ],
  [
    '지워진 본인 번호',
    '본인 번호 보기',
    REVEAL_STUDENT,
    'MEMBER_PHONE_NOT_FOUND',
    '지워진 번호예요.',
  ],
])('번호 보기: %s면 알리고 학생을 다시 받는다', async (_case, button, key, code, message) => {
  mockDetail()
  mockApi({ [key]: () => problemResponse(404, { detail: '찾을 수 없습니다.', code }) })
  renderApp(PATH, { me: staff })
  await ready()

  await press(button)

  expect(await screen.findByText(message)).toBeInTheDocument()
  // 받아 둔 상세가 낡았다.
  await waitFor(() => expect(count(DETAIL)).toBe(2))
  expect(count(key)).toBe(1)
})

test('번호 보기: 다시 받은 학생에 그 학부모가 없으면 줄과 안내가 함께 사라진다', async () => {
  const server = mockDetail()
  mockApi({
    [REVEAL_MOTHER]: () => {
      server.student = { ...doyun, guardians: [father] }
      return problemResponse(404, {
        detail: '학부모를 찾을 수 없습니다.',
        code: 'MEMBER_GUARDIAN_NOT_FOUND',
      })
    },
  })
  renderApp(PATH, { me: staff })
  await ready()

  await press('이영희 번호 보기')

  await waitFor(() =>
    expect(screen.queryByRole('button', { name: '이영희 번호 보기' })).not.toBeInTheDocument(),
  )
  expect(screen.getByRole('button', { name: '김철수 번호 보기' })).toBeEnabled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

// ── 리뷰에서 나온 경우 ───────────────────────────────────

test('번호를 보여주던 학부모의 수정을 시작하면 가린다. 뒷자리가 같은 새 번호로 바꿔도 옛 번호가 남지 않는다', async () => {
  const server = mockDetail()
  mockApi({
    [REVEAL_MOTHER]: () => jsonResponse({ phone: '010-1234-5678' }),
    // 010-9999-5678로 바꿨다. 가린 번호는 010-****-5678 그대로다.
    'PUT /api/v1/guardians/7': () => {
      server.student = { ...doyun }
      return jsonResponse({ id: 7, name: '이영희', phone: '010-****-5678' })
    },
  })
  renderApp(PATH, { me: staff })
  await ready()
  await press('이영희 번호 보기')
  await screen.findByText('010-1234-5678')

  await press('이영희 수정')
  const dialog = await screen.findByRole('dialog', { name: '학부모 수정' })

  // 가린 번호로는 번호가 바뀌었는지 알 수 없다. 수정을 시작할 때 미리 버린다.
  expect(document.body.textContent).not.toContain('010-1234-5678')
  await userEvent.type(within(dialog).getByLabelText('새 휴대전화'), '010-9999-5678')
  await userEvent.click(within(dialog).getByRole('button', { name: '저장' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

  expect(guardianRow('이영희')).toHaveTextContent('010-****-5678')
  expect(document.body.textContent).not.toContain('010-1234-5678')
  expect(screen.getByRole('button', { name: '이영희 번호 보기' })).toBeEnabled()
  expect(count(REVEAL_MOTHER)).toBe(1)
})

test('보여주는 사이에 본인 번호가 바뀌면 보여주던 전체 번호를 버린다', async () => {
  const server = mockDetail()
  mockApi({ [REVEAL_STUDENT]: () => jsonResponse({ phone: '010-5555-0000' }) })
  const { queryClient } = renderApp(PATH, { me: staff })
  await ready()
  await press('본인 번호 보기')
  await screen.findByText('010-5555-0000')

  server.student = { ...doyun, phone: '010-****-9999' }
  await queryClient.invalidateQueries({ queryKey: ['students', 'detail', 1] })

  await screen.findByText('010-****-9999')
  expect(document.body.textContent).not.toContain('010-5555-0000')
  expect(screen.getByRole('button', { name: '본인 번호 보기' })).toBeEnabled()
})

test('두 사람의 번호를 함께 보다가 하나만 가릴 수 있다', async () => {
  mockDetail()
  mockApi({
    [REVEAL_MOTHER]: () => jsonResponse({ phone: '010-1234-5678' }),
    [REVEAL_FATHER]: () => jsonResponse({ phone: '010-9876-5432' }),
  })
  renderApp(PATH, { me: staff })
  await ready()
  await press('이영희 번호 보기')
  await press('김철수 번호 보기')
  await screen.findByText('010-1234-5678')
  await screen.findByText('010-9876-5432')

  await press('이영희 번호 가리기')

  expect(guardianRow('이영희')).toHaveTextContent('010-****-5678')
  expect(guardianRow('김철수')).toHaveTextContent('010-9876-5432')
  expect(reveals()).toHaveLength(2)
})

test('형제의 상세로 넘어가면 보여주던 학부모 번호를 버린다', async () => {
  mockDetail({ ...doyun, siblings: [{ id: 2, name: '김서연', status: 'ENROLLED' }] })
  mockApi({
    [REVEAL_MOTHER]: () => jsonResponse({ phone: '010-1234-5678' }),
    // 형제는 같은 학부모에 연결돼 있다.
    'GET /api/v1/students/2': () =>
      jsonResponse({
        ...doyun,
        id: 2,
        name: '김서연',
        siblings: [{ id: 1, name: '김도윤', status: 'ENROLLED' }],
      }),
  })
  renderApp(PATH, { me: staff })
  await ready()
  await press('이영희 번호 보기')
  await screen.findByText('010-1234-5678')

  await userEvent.click(screen.getByRole('link', { name: '김서연' }))

  await screen.findByRole('heading', { level: 1, name: '김서연' })
  // 서버 기록에는 김도윤의 화면에서 본 것으로 남았다. 다른 학생의 화면에 따라가면 안 된다.
  expect(document.body.textContent).not.toContain('010-1234-5678')
  expect(screen.getByRole('button', { name: '이영희 번호 보기' })).toBeEnabled()
  expect(reveals()).toEqual([REVEAL_MOTHER])
})

test('응답이 오기 전에 화면을 떠나도 받은 전체 번호를 캐시에 남기지 않는다', async () => {
  let respond!: (response: Response) => void
  mockDetail()
  mockApi({
    [REVEAL_MOTHER]: () => new Promise<Response>((resolve) => (respond = resolve)),
    'POST /api/v1/students/search': () =>
      jsonResponse({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
  })
  const { router, queryClient } = renderApp(PATH, { me: staff })
  await ready()
  await press('이영희 번호 보기')
  await screen.findByRole('button', { name: '이영희 번호 보는 중' })

  await router.navigate('/desk/students')
  await screen.findByRole('heading', { level: 1, name: '학생' })
  respond(jsonResponse({ phone: '010-1234-5678' }))
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))

  const leaked = (text: string) => ['1234-5678', '12345678'].some((digits) => text.includes(digits))
  // 화면이 없어 받은 번호를 떼어 낼 곳이 없다. 캐시가 스스로 지워야 한다.
  await waitFor(() =>
    expect(
      leaked(
        JSON.stringify(
          queryClient
            .getMutationCache()
            .getAll()
            .map((mutation) => mutation.state.data),
        ),
      ),
    ).toBe(false),
  )
  expect(queryClient.getMutationCache().getAll()).toEqual([])
  expect(leaked(document.body.textContent)).toBe(false)

  await router.navigate(PATH)
  await ready()
  expect(guardianRow('이영희')).toHaveTextContent('010-****-5678')
  expect(leaked(document.body.textContent)).toBe(false)
  expect(count(REVEAL_MOTHER)).toBe(1)
})

test.each([
  ['본문이 없으면', () => new Response(null, { status: 204 })],
  ['번호가 없으면', () => jsonResponse({})],
  ['번호가 비어 있으면', () => jsonResponse({ phone: '' })],
  ['번호가 글자가 아니면', () => jsonResponse({ phone: 1012345678 })],
  ['본문이 null이면', () => jsonResponse(null)],
])('번호 보기: 성공이라고 왔는데 %s 실패로 알린다', async (_case, respond) => {
  mockDetail()
  mockApi({ [REVEAL_MOTHER]: respond })
  renderApp(PATH, { me: staff })
  await ready()

  await press('이영희 번호 보기')

  // 서버는 한 번으로 셌다. 아무 안내 없이 넘어가면 직원이 모르고 다시 누른다.
  expect(await within(guardianRow('이영희')).findByRole('alert')).toHaveTextContent(
    '일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
  )
  expect(guardianRow('이영희')).toHaveTextContent('010-****-5678')
  expect(screen.getByRole('button', { name: '이영희 번호 보기' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: '이영희 번호 가리기' })).not.toBeInTheDocument()
  expect(document.body.textContent).not.toContain('1012345678')
  expect(count(REVEAL_MOTHER)).toBe(1)
})

// ── 요청 번호 ─────────────────────────────────────────────

test('번호 보기 중 서버 오류가 나면 안내 아래에 요청 번호를 보여준다. 한도 초과에는 붙이지 않는다', async () => {
  let limited = false
  mockDetail()
  mockApi({
    [REVEAL_STUDENT]: () =>
      limited
        ? problemResponse(429, {
            detail: '요청이 너무 많습니다.',
            code: 'MEMBER_PHONE_REVEAL_LIMITED',
            requestId: '2d6a6e90a9d04a16bb607aa43840f2d7',
          })
        : problemResponse(500, {
            detail: '서버 오류',
            requestId: '2d6a6e90a9d04a16bb607aa43840f2d7',
          }),
  })
  renderApp(PATH, { me: staff })
  await ready()

  await press('본인 번호 보기')

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('서버 오류')
  expect(alert).toHaveTextContent(
    '문의할 때 이 번호를 알려 주세요: 2d6a6e90a9d04a16bb607aa43840f2d7',
  )

  limited = true
  await press('본인 번호 보기')

  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('번호 보기를 너무 많이 했어요.'),
  )
  expect(screen.getByRole('alert')).not.toHaveTextContent('문의할 때')
})
