import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { setupDialog } from '@/test/dialog'
import { loseFocus } from '@/test/focus'
import {
  jsonResponse,
  mockApi,
  noContent,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
  unreadableResponse,
} from '@/test/mockApi'
import { admin, renderApp, staff } from '@/test/renderApp'
import type { Guardian, Student } from '../api'

// 학부모 추가·수정·연결 끊기에서 자료가 새거나, 결과 안내를 놓치거나, 틀리게 알릴 수 있는 상황을 모았다.
// 기본 흐름은 StudentDetailPage.guardians.test.tsx에 있다.

setupMockApi()
setupDialog()

const PATH = '/desk/students/1'
const DETAIL = 'GET /api/v1/students/1'
const ADD = 'POST /api/v1/students/1/guardians'
const RELATION = 'PUT /api/v1/students/1/guardians/7'
const PROFILE = 'PUT /api/v1/guardians/7'
const UNLINK = 'DELETE /api/v1/students/1/guardians/7'

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
const grandma: Guardian = {
  id: 9,
  relation: 'GRANDPARENT',
  name: '박순자',
  phone: '010-****-1111',
  linkedToExisting: false,
}
const doyun: Student = {
  id: 1,
  campusId: 1,
  classId: null,
  name: '김도윤',
  grade: 'MIDDLE_1',
  school: null,
  phone: null,
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

/** 테스트가 원하는 때에 답하는 요청. */
function deferred(key: string) {
  // respond는 요청이 나간 뒤에 채워진다.
  const control = {} as { respond: (response: Response) => void }
  mockApi({ [key]: () => new Promise<Response>((resolve) => (control.respond = resolve)) })
  return control
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

function guardianRows() {
  const card = screen.getByRole('heading', { level: 2, name: '학부모' }).parentElement!
  return (
    within(card)
      .queryAllByRole('listitem')
      // 줄의 버튼은 빼고 관계·이름·번호만 본다.
      .map((item) => {
        const row = item.cloneNode(true) as HTMLElement
        row.querySelectorAll('button').forEach((button) => button.remove())
        return row.textContent
      })
  )
}

async function open(button: string, dialogName: string) {
  await screen.findByRole('heading', { level: 1, name: '김도윤' })
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

async function fillNewGuardian(dialog: HTMLElement) {
  await fill(dialog, '이름', '박순자')
  await fill(dialog, '휴대전화', '010-2222-1111')
}

// ── 자료가 새지 않는다 ───────────────────────────────────

test.each([
  ['학부모 추가', '다른 사람이 로그인했으면', staff],
  ['학부모 추가', '로그아웃했으면', null],
  ['관계 수정', '로그아웃했으면', null],
])(
  '%s: 응답을 기다리는 사이에 %s 받은 학생을 캐시에 넣지 않는다',
  async (action, _case, nextUser) => {
    mockDetail()
    const answered = { ...doyun, guardians: [{ ...mother, relation: 'OTHER' as const }, grandma] }
    const request = deferred(action === '학부모 추가' ? ADD : RELATION)
    const { queryClient } = renderApp(PATH, { me: admin })
    if (action === '학부모 추가') {
      const dialog = await open('학부모 추가', '학부모 추가')
      await fillNewGuardian(dialog)
      await press(dialog, '추가')
      await within(dialog).findByRole('button', { name: '추가하는 중' })
    } else {
      const dialog = await open('이영희 수정', '학부모 수정')
      await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '기타')
      await press(dialog, '저장')
      await within(dialog).findByRole('button', { name: '저장하는 중' })
    }

    // 같은 기기에서 앞사람이 나가고 다음 사람이 들어왔다.
    queryClient.setQueryData(['auth', 'me'], nextUser)
    request.respond(jsonResponse(answered, action === '학부모 추가' ? 201 : 200))
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))

    // 앞사람이 받은 학생 자료가 다음 사람의 캐시에 새로 들어가면 안 된다.
    const cached = queryClient.getQueryData<Student>(['students', 'detail', 1])
    expect(cached?.guardians.some((guardian) => guardian.id === 9)).not.toBe(true)
    expect(cached?.guardians.some((guardian) => guardian.relation === 'OTHER')).not.toBe(true)
  },
)

test.each([
  ['추가한 번호', 'add'],
  ['수정한 새 번호', 'edit'],
  ['추가하다 실패해 취소한 번호', 'cancel'],
])('%s를 주소, 콘솔, 캐시, 화면에 남기지 않는다', async (_case, flow) => {
  const logs = ['log', 'info', 'warn', 'error', 'debug'].map((method) =>
    vi.spyOn(console, method as 'log').mockImplementation(() => {}),
  )
  const server = mockDetail()
  mockApi({
    [ADD]: () =>
      flow === 'cancel'
        ? problemResponse(403, { detail: '권한이 없습니다.' })
        : jsonResponse({ ...doyun, guardians: [mother, father, grandma] }, 201),
    [PROFILE]: () => {
      server.student = { ...doyun, guardians: [{ ...mother, phone: '010-****-1111' }, father] }
      return jsonResponse({ id: 7, name: '이영희', phone: '010-****-1111' })
    },
  })
  const { router, queryClient } = renderApp(PATH, { me: staff })

  if (flow === 'edit') {
    const dialog = await open('이영희 수정', '학부모 수정')
    await fill(dialog, '새 휴대전화', '010-2222-1111')
    await press(dialog, '저장')
  } else {
    const dialog = await open('학부모 추가', '학부모 추가')
    await fillNewGuardian(dialog)
    await press(dialog, '추가')
    if (flow === 'cancel') {
      await within(dialog).findByRole('alert')
      await press(dialog, '취소')
    }
  }
  await closed()

  const leaked = (text: string) => ['2222-1111', '22221111'].some((digits) => text.includes(digits))
  // 요청 본문은 mutation 캐시에 들어 있다. 창이 닫히면 남기지 않는다.
  await waitFor(() =>
    expect(
      leaked(
        JSON.stringify(
          queryClient
            .getMutationCache()
            .getAll()
            .map((mutation) => mutation.state.variables),
        ),
      ),
    ).toBe(false),
  )
  expect(queryClient.getMutationCache().getAll()).toEqual([])
  const cached = JSON.stringify(
    queryClient
      .getQueryCache()
      .getAll()
      .map((query) => [query.queryKey, query.state.data]),
  )
  expect(leaked(cached)).toBe(false)
  expect(leaked(JSON.stringify(router.state.location))).toBe(false)
  const logged = logs.flatMap((log) => log.mock.calls.flat()).map((arg: unknown) => String(arg))
  expect(leaked(JSON.stringify(logged))).toBe(false)
  expect(leaked(JSON.stringify({ ...localStorage, ...sessionStorage }))).toBe(false)
  expect(requests().some((key) => leaked(key))).toBe(false)
  // 화면에는 서버가 가려서 준 번호만 남는다.
  expect(leaked(document.body.textContent)).toBe(false)
})

// ── 다른 학생의 자료 ─────────────────────────────────────

test.each([
  ['학부모를 추가하면', 'add', false],
  ['관계를 바꾸면', 'relation', false],
  ['이름을 고치면', 'profile', true],
  ['연결을 끊으면', 'unlink', true],
])('%s 목록과 형제의 상세를 다시 받게 한다', async (_case, action, refetchesSelf) => {
  const server = mockDetail()
  mockApi({
    'POST /api/v1/students/search': () =>
      jsonResponse({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
    'GET /api/v1/students/2': () => jsonResponse({ ...doyun, id: 2, name: '김서연' }),
    [ADD]: () => jsonResponse({ ...doyun, guardians: [mother, father, grandma] }, 201),
    [RELATION]: () =>
      jsonResponse({ ...doyun, guardians: [{ ...mother, relation: 'OTHER' }, father] }),
    [PROFILE]: () => jsonResponse({ id: 7, name: '이영화', phone: '010-****-5678' }),
    [UNLINK]: () => {
      server.student = { ...doyun, guardians: [father] }
      return noContent()
    },
  })
  // 목록과 형제의 상세를 본 뒤에 학부모를 고친다. 둘 다 이 학부모를 보여줄 수 있다.
  const { router, queryClient } = renderApp('/desk/students', { me: staff })
  await screen.findByRole('heading', { level: 1, name: '학생' })
  await router.navigate('/desk/students/2')
  await screen.findByRole('heading', { level: 1, name: '김서연' })
  await router.navigate(PATH)

  if (action === 'add') {
    const dialog = await open('학부모 추가', '학부모 추가')
    await fillNewGuardian(dialog)
    await press(dialog, '추가')
  } else if (action === 'unlink') {
    await press(await open('이영희 연결 끊기', '학부모 연결을 끊을까요?'), '연결 끊기')
  } else {
    const dialog = await open('이영희 수정', '학부모 수정')
    if (action === 'relation') {
      await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '기타')
    } else {
      await fill(dialog, '이름', '이영화')
    }
    await press(dialog, '저장')
  }
  await closed()

  const invalidated = (key: unknown[]) =>
    queryClient
      .getQueryCache()
      .findAll({ queryKey: key })
      .map((query) => query.state.isInvalidated)
  await waitFor(() => expect(invalidated(['students', 'list'])).toEqual([true]))
  expect(invalidated(['students', 'detail', 2])).toEqual([true])
  // 응답으로 학생을 받는 요청은 이 학생의 상세를 다시 받지 않는다. 받지 않는 요청은 다시 받는다.
  await waitFor(() => expect(count(DETAIL)).toBe(refetchesSelf ? 2 : 1))
})

// ── 저장하는 동안 ────────────────────────────────────────

test('추가하는 동안에는 두 번 보내지 않고, 닫아 달라고 해도 닫지 않는다', async () => {
  mockDetail()
  const request = deferred(ADD)
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)

  await userEvent.dblClick(within(dialog).getByRole('button', { name: '추가' }))

  expect(await within(dialog).findByRole('button', { name: '추가하는 중' })).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: '취소' })).toBeDisabled()
  expect(count(ADD)).toBe(1)
  // Esc를 누른 것과 같다. 닫히면 실패했을 때 안내를 볼 곳이 없어진다.
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('dialog', { name: '학부모 추가' })).toBeInTheDocument()

  request.respond(jsonResponse({ ...doyun, guardians: [mother, father, grandma] }, 201))
  await closed()
  expect(count(ADD)).toBe(1)
})

test('수정을 저장하는 동안에는 두 번 보내지 않고, 닫아 달라고 해도 닫지 않는다', async () => {
  mockDetail()
  const request = deferred(RELATION)
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '기타')

  await userEvent.dblClick(within(dialog).getByRole('button', { name: '저장' }))

  expect(await within(dialog).findByRole('button', { name: '저장하는 중' })).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: '취소' })).toBeDisabled()
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('dialog', { name: '학부모 수정' })).toBeInTheDocument()

  request.respond(jsonResponse({ ...doyun, guardians: [{ ...mother, relation: 'OTHER' }, father] }))
  await closed()
  expect(count(RELATION)).toBe(1)
})

test('끊는 중에 두 번 눌러도 한 번만 보내고, 다른 일은 막고, 창을 닫아도 결과를 화면에서 알린다', async () => {
  const server = mockDetail()
  const request = deferred(UNLINK)
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 연결 끊기', '학부모 연결을 끊을까요?')

  await userEvent.dblClick(within(dialog).getByRole('button', { name: '연결 끊기' }))
  expect(within(dialog).getByRole('button', { name: '끊는 중' })).toBeDisabled()
  expect(count(UNLINK)).toBe(1)
  // 닫아 달라면 닫는다.
  await press(dialog, '닫기')
  await closed()
  // 끊는 중에 다른 일을 시작하면 끊기의 결과를 받지 못한다. 끝날 때까지 막아 둔다.
  for (const name of ['이영희 수정', '김철수 수정', '이영희 연결 끊기', '김철수 연결 끊기']) {
    expect(screen.getByRole('button', { name })).toBeDisabled()
  }
  expect(screen.getByRole('button', { name: '학부모 추가' })).toBeDisabled()

  server.student = { ...doyun, guardians: [father] }
  request.respond(noContent())

  expect(await screen.findByRole('status')).toHaveTextContent('이영희 학부모의 연결을 끊었어요.')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '학부모 추가' })).toBeEnabled()
})

test('끊는 중에 창을 닫은 뒤 실패해도 화면에서 알린다', async () => {
  mockDetail({ ...doyun, guardians: [mother] })
  const request = deferred(UNLINK)
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 연결 끊기', '학부모 연결을 끊을까요?')
  await press(dialog, '연결 끊기')
  await press(dialog, '닫기')
  await closed()

  request.respond(
    problemResponse(409, {
      detail: '마지막 연락처는 지울 수 없습니다.',
      code: 'MEMBER_LAST_CONTACT',
    }),
  )

  expect(await screen.findByRole('alert')).toHaveTextContent('하나 남은 연락처라 끊을 수 없어요.')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '이영희 연결 끊기' })).toBeEnabled()
})

// ── 서버가 칸을 짚을 때 ──────────────────────────────────

test('추가: 서버가 칸을 짚은 오류는 그 칸 아래에 보여준다', async () => {
  mockDetail()
  mockApi({
    [ADD]: () =>
      problemResponse(400, {
        detail: '입력값이 올바르지 않습니다.',
        code: 'COMMON_VALIDATION_FAILED',
        errors: [
          { field: 'relation', message: '고를 수 없는 관계입니다' },
          { field: 'name', message: '50자 이하여야 합니다' },
          { field: 'phone', message: '공백일 수 없습니다' },
        ],
      }),
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)

  await press(dialog, '추가')

  await waitFor(() =>
    expect(within(dialog).getByLabelText('관계')).toHaveAccessibleDescription(
      '고를 수 없는 관계입니다',
    ),
  )
  expect(within(dialog).getByLabelText('이름')).toHaveAccessibleDescription('50자 이하여야 합니다')
  expect(within(dialog).getByLabelText('휴대전화')).toHaveAccessibleDescription(
    '공백일 수 없습니다',
  )
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
})

test('수정: 서버가 칸을 짚은 오류는 그 칸 아래에 보여주고, 번호 중복이 아니면 다른 안내를 덧붙이지 않는다', async () => {
  mockDetail()
  mockApi({
    [PROFILE]: () =>
      problemResponse(400, {
        detail: '입력값이 올바르지 않습니다.',
        code: 'COMMON_VALIDATION_FAILED',
        errors: [
          { field: 'name', message: '50자 이하여야 합니다' },
          { field: 'phone', message: '20자 이하여야 합니다' },
        ],
      }),
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await fill(dialog, '새 휴대전화', '010-2222-1111')

  await press(dialog, '저장')

  await waitFor(() =>
    expect(within(dialog).getByLabelText('새 휴대전화')).toHaveAccessibleDescription(
      '20자 이하여야 합니다',
    ),
  )
  expect(within(dialog).getByLabelText('이름')).toHaveAccessibleDescription('50자 이하여야 합니다')
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
})

test('수정: 이름을 비우면 보내지 않는다', async () => {
  mockDetail()
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')

  await fill(dialog, '이름', '')
  await press(dialog, '저장')

  expect(within(dialog).getByLabelText('이름')).toHaveAccessibleDescription('이름을 입력해 주세요.')
  expect(count(PROFILE)).toBe(0)
})

test('추가: 어머니가 없으면 어머니가 골라져 있다', async () => {
  mockDetail({ ...doyun, guardians: [father] })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')

  expect(within(dialog).getByLabelText('관계')).toHaveDisplayValue('어머니')
})

// ── 결과를 틀리게 알리지 않는다 ──────────────────────────

test('연결 끊기: 다른 404(없는 학생)는 끊은 것으로 보지 않는다', async () => {
  mockDetail()
  mockApi({
    [UNLINK]: () =>
      problemResponse(404, {
        detail: '학생을 찾을 수 없습니다.',
        code: 'MEMBER_STUDENT_NOT_FOUND',
      }),
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 연결 끊기', '학부모 연결을 끊을까요?')

  await press(dialog, '연결 끊기')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('학생을 찾을 수 없습니다.')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(guardianRows()).toHaveLength(2)
})

test('연결 끊기: 끊은 학부모가 다시 연결돼 돌아와도 확인 창이 저절로 열리지 않는다', async () => {
  const server = mockDetail()
  mockApi({
    [UNLINK]: () => {
      server.student = { ...doyun, guardians: [father] }
      return noContent()
    },
  })
  const { queryClient } = renderApp(PATH, { me: staff })
  await press(await open('이영희 연결 끊기', '학부모 연결을 끊을까요?'), '연결 끊기')
  await closed()
  await waitFor(() => expect(guardianRows()).toHaveLength(1))

  // 다른 직원이 같은 학부모를 다시 붙였고, 화면이 학생을 다시 받았다.
  server.student = doyun
  await queryClient.invalidateQueries({ queryKey: ['students', 'detail', 1] })

  await waitFor(() => expect(guardianRows()).toHaveLength(2))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('연결 끊기: 묻는 사이에 다른 곳에서 끊겼으면 창을 닫고 이미 끊겼다고 알린다', async () => {
  const server = mockDetail()
  const { queryClient } = renderApp(PATH, { me: staff })
  await open('이영희 연결 끊기', '학부모 연결을 끊을까요?')

  server.student = { ...doyun, guardians: [father] }
  await queryClient.invalidateQueries({ queryKey: ['students', 'detail', 1] })

  await closed()
  expect(screen.getByRole('alert')).toHaveTextContent('이영희 학부모는 이미 연결이 끊겼어요.')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(count(UNLINK)).toBe(0)

  // 다음 일을 시작하면 지운다.
  const dialog = await open('학부모 추가', '학부모 추가')
  expect(screen.queryByText('이영희 학부모는 이미 연결이 끊겼어요.')).not.toBeInTheDocument()
  await press(dialog, '취소')
})

test('수정: 관계는 저장됐는데 이름·번호의 응답을 받지 못하면 저장되지 않았다고 단정하지 않는다', async () => {
  const server = mockDetail()
  mockApi({
    [RELATION]: () => {
      server.student = { ...doyun, guardians: [{ ...mother, relation: 'OTHER' }, father] }
      return jsonResponse(server.student)
    },
    [PROFILE]: () => {
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '기타')
  await fill(dialog, '이름', '이영화')

  await press(dialog, '저장')

  const status = await within(dialog).findByRole('status')
  expect(status).toHaveTextContent('관계는 저장됐어요. 이름과 번호는 저장됐는지 확인하지 못했어요.')
  expect(status).not.toHaveTextContent('아직 저장되지 않았어요')
  expect(within(dialog).getByRole('alert')).toHaveTextContent('그대로 다시 저장해도 돼요.')
})

test('수정: 응답을 받지 못했는데 저장돼 있었으면, 다시 저장을 눌렀을 때 보내지 않고 고쳤다고 알린다', async () => {
  const server = mockDetail()
  mockApi({
    [PROFILE]: () => {
      // 서버는 저장했는데 응답이 끊겼다.
      server.student = { ...doyun, guardians: [{ ...mother, name: '이영화' }, father] }
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await fill(dialog, '이름', '이영화')
  await press(dialog, '저장')
  await within(dialog).findByRole('alert')
  // 실패해도 학생을 다시 받는다. 받아 보니 이름이 바뀌어 있다.
  await waitFor(() => expect(guardianRows()[0]).toContain('이영화'))

  await press(dialog, '저장')

  await closed()
  expect(count(PROFILE)).toBe(1)
  expect(screen.getByRole('status')).toHaveTextContent('학부모 정보를 고쳤어요.')
})

test('수정: 거부된 뒤 값을 되돌려 저장하면 고쳤다고 알리지 않는다', async () => {
  mockDetail()
  mockApi({ [PROFILE]: () => problemResponse(403, { detail: '권한이 없습니다.' }) })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await fill(dialog, '이름', '이영화')
  await press(dialog, '저장')
  await within(dialog).findByRole('alert')

  await fill(dialog, '이름', '이영희')
  await press(dialog, '저장')

  await closed()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(count(PROFILE)).toBe(1)
})

test('추가: 응답을 받지 못해도 학생을 다시 받아, 추가됐으면 창 뒤의 목록에 보인다', async () => {
  const server = mockDetail()
  mockApi({
    [ADD]: () => {
      server.student = { ...doyun, guardians: [mother, father, grandma] }
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)

  await press(dialog, '추가')

  await within(dialog).findByRole('alert')
  await waitFor(() => expect(guardianRows()).toHaveLength(3))
  expect(requestOf(ADD).headers.get('Idempotency-Key')).not.toBeNull()
})

test('추가: 세 명에서 응답을 놓쳐 네 명이 돼도 창은 남아 같은 키로 다시 보낼 수 있고, 닫힌 뒤에는 추가를 막는다', async () => {
  const uncle: Guardian = { ...father, id: 30, relation: 'OTHER', name: '최삼촌' }
  const four = { ...doyun, guardians: [mother, father, uncle, grandma] }
  const server = mockDetail({ ...doyun, guardians: [mother, father, uncle] })
  let attempts = 0
  mockApi({
    [ADD]: () => {
      attempts += 1
      // 서버에는 추가됐는데 응답을 받지 못했다.
      server.student = four
      if (attempts === 1) throw new TypeError('Failed to fetch')
      return jsonResponse(four, 201)
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)

  await press(dialog, '추가')

  await within(dialog).findByRole('alert')
  // 창 뒤의 학부모는 네 명이 됐다. 그래도 창은 닫히지 않는다. 닫히면 같은 키로 다시 보낼 기회가 없어진다.
  await waitFor(() => expect(guardianRows()).toHaveLength(4))
  expect(dialog).toBeVisible()
  const firstKey = requestOf(ADD).headers.get('Idempotency-Key')
  await press(dialog, '추가')

  await closed()
  expect(requestOf(ADD).headers.get('Idempotency-Key')).toBe(firstKey)
  expect(screen.getByRole('status')).toHaveTextContent('박순자 학부모를 추가했어요.')
  expect(screen.getByRole('button', { name: '학부모 추가' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
})

// ── 안내 지우기 ──────────────────────────────────────────

test('추가했다는 안내는 다음 일을 시작하면 지운다', async () => {
  mockDetail()
  mockApi({ [ADD]: () => jsonResponse({ ...doyun, guardians: [mother, father, grandma] }, 201) })
  renderApp(PATH, { me: staff })
  const adding = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(adding)
  await press(adding, '추가')
  await closed()
  expect(screen.getByRole('status')).toHaveTextContent('박순자 학부모를 추가했어요.')

  const dialog = await open('이영희 수정', '학부모 수정')

  expect(screen.queryByText('박순자 학부모를 추가했어요.')).not.toBeInTheDocument()
  await press(dialog, '취소')
})

test('고치려던 학부모가 끊겼다는 안내는 다음 일을 시작하면 지운다', async () => {
  const server = mockDetail()
  mockApi({
    [RELATION]: () => {
      server.student = { ...doyun, guardians: [father] }
      return problemResponse(404, {
        detail: '학부모를 찾을 수 없습니다.',
        code: 'MEMBER_GUARDIAN_NOT_FOUND',
      })
    },
  })
  renderApp(PATH, { me: staff })
  const editing = await open('이영희 수정', '학부모 수정')
  await userEvent.selectOptions(within(editing).getByLabelText('관계'), '기타')
  await press(editing, '저장')
  await closed()
  expect(screen.getByRole('alert')).toHaveTextContent('고치려던 학부모는 이미 연결이 끊겼어요.')

  const dialog = await open('학부모 추가', '학부모 추가')

  expect(screen.queryByText('고치려던 학부모는 이미 연결이 끊겼어요.')).not.toBeInTheDocument()
  await press(dialog, '취소')
})

// ── 요청 한도 ────────────────────────────────────────────

/** 전화번호가 실린 요청이 너무 많다는 답. 실제 서버처럼 Retry-After(초)를 싣는다. */
function phoneChangeLimited() {
  return new Response(
    JSON.stringify({
      title: 'Error',
      status: 429,
      detail: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
      code: 'MEMBER_PHONE_CHANGE_LIMITED',
    }),
    { status: 429, headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '601' } },
  )
}

test('추가: 전화번호가 실린 요청의 한도(429)에 걸리면 창 안에 남은 시간을 알리고 입력은 그대로 둔다', async () => {
  mockDetail()
  mockApi({ [ADD]: phoneChangeLimited })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)

  await press(dialog, '추가')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '요청이 너무 많아요. 약 11분 뒤에 다시 시도해 주세요.',
  )
  expect(count(ADD)).toBe(1)
  expect(within(dialog).getByLabelText('이름')).toHaveValue('박순자')
  expect(within(dialog).getByLabelText('휴대전화')).toHaveValue('010-2222-1111')
  expect(within(dialog).getByLabelText('휴대전화')).toHaveAccessibleDescription(
    '이미 등록된 번호면 새로 만들지 않고 그 학부모에 연결해요.',
  )
})

test('수정: 새 번호가 한도(429)에 걸리면 창 안에 남은 시간을 알리고, 번호 중복 안내는 붙이지 않는다', async () => {
  mockDetail()
  mockApi({ [PROFILE]: phoneChangeLimited })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await fill(dialog, '새 휴대전화', '010-2222-1111')

  await press(dialog, '저장')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '요청이 너무 많아요. 약 11분 뒤에 다시 시도해 주세요.',
  )
  expect(count(PROFILE)).toBe(1)
  expect(within(dialog).getByLabelText('새 휴대전화')).toHaveValue('010-2222-1111')
  expect(within(dialog).getByLabelText('새 휴대전화')).toHaveAccessibleDescription(
    '지금 번호: 010-****-5678. 바꿀 때만 입력해요.',
  )
})

// ── 추가 결과 안내를 놓치지 않는다 ───────────────────────────────

// 같은 번호로 이미 등록돼 있던 학부모. 입력한 이름(박순자)과 저장된 이름이 다르다.
const existing: Guardian = {
  id: 20,
  relation: 'GRANDPARENT',
  name: '박다른',
  phone: '010-****-1111',
  linkedToExisting: false,
}

const emptyList = { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }

/** 추가 요청의 응답이 오지 않는 상황. `saved`를 주면 서버에는 그 학부모가 연결됐고, 주지 않으면 추가되지 않았다. */
function loseAddResponse(server: { student: Student }, saved?: Guardian) {
  mockApi({
    [ADD]: () => {
      if (saved) server.student = { ...doyun, guardians: [mother, father, saved] }
      throw new TypeError('Failed to fetch')
    },
  })
}

const NOT_VISIBLE =
  '박순자 학부모는 지금은 보이지 않아요. 추가되지 않았을 수 있어요. 잠시 뒤 다시 확인하거나 다시 추가해 주세요.'
const UNCHECKED =
  '박순자 학부모가 추가됐는지 확인하지 못했어요. 아래 학부모는 이전 내용일 수 있어요.'
const CHECKING = '박순자 학부모가 추가됐는지 확인하고 있어요.'
const LINKED =
  '이미 등록된 학부모(박다른, 010-****-1111)에 연결했어요. 입력한 이름은 쓰이지 않았어요. 다른 사람이라면 연결을 끊고 번호를 확인해 주세요.'

/** 안내 안의 버튼을 누른다. */
function pressInNotice(text: string, name: string) {
  const notice = screen.getByText(text).closest<HTMLElement>('[role="status"]')!
  return userEvent.click(within(notice).getByRole('button', { name }))
}

/** 화면에 떠 있는 안내 전부(추가·수정·연결 끊기의 성공 안내와 확인을 청하는 안내가 모두 여기에 든다). 버튼의 글자는 뺀다. */
function statuses() {
  return screen.queryAllByRole('status').map((notice) => {
    const copy = notice.cloneNode(true) as HTMLElement
    copy.querySelectorAll('button').forEach((button) => button.remove())
    return copy.textContent
  })
}

test('추가: 응답을 기다리다 다른 화면에 갔다 와도 기존 학부모에 연결했다는 안내를 보여준다', async () => {
  mockDetail()
  mockApi({ 'POST /api/v1/students/search': () => jsonResponse(emptyList) })
  const request = deferred(ADD)
  const { router, queryClient } = renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('button', { name: '추가하는 중' })

  // 응답이 오기 전에 떠난다. 추가 창도 함께 사라진다.
  await router.navigate('/desk/students')
  await screen.findByRole('heading', { level: 1, name: '학생' })
  request.respond(
    jsonResponse(
      { ...doyun, guardians: [mother, father, { ...existing, linkedToExisting: true }] },
      201,
    ),
  )
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))

  // 안내는 그 학생의 칸에서 기다린다. 입력한 이름과 서버가 가려 준 번호만 들어 있다.
  expect(queryClient.getQueryData(['students', 'guardian-added-notice', 1])).toEqual({
    studentId: 1,
    typedName: '박순자',
    linked: { id: 20, name: '박다른', phone: '010-****-1111' },
  })
  // 입력한 번호 원문은 캐시 어디에도 없다. 요청 본문이 든 mutation도 남지 않는다.
  const cached = JSON.stringify(
    queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.state.data),
  )
  expect(cached).not.toContain('2222-1111')
  expect(cached).not.toContain('22221111')
  expect(queryClient.getMutationCache().getAll()).toEqual([])
  // 보는 화면이 없는 캐시는 5분 뒤 지워진다. 안내는 돌아올 때까지 지워지지 않게 남긴다.
  expect(
    queryClient.getQueryCache().find({ queryKey: ['students', 'guardian-added-notice', 1] })
      ?.gcTime,
  ).toBe(Infinity)

  await router.navigate(PATH)

  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  expect(await screen.findByRole('status')).toHaveTextContent(
    '이미 등록된 학부모(박다른, 010-****-1111)에 연결했어요. 입력한 이름은 쓰이지 않았어요.',
  )

  // 한 번 보여준 안내는 다시 뜨지 않는다.
  await router.navigate('/desk/students')
  await screen.findByRole('heading', { level: 1, name: '학생' })
  await router.navigate(PATH)
  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  expect(statuses()).toEqual([])
})

test.each([
  ['다른 사람이 로그인했으면', staff],
  // 로그아웃하면 상세 화면이 사라져 안내를 꺼내 갈 화면이 없다. 남겼다면 다음 사람의 세션까지 캐시에 남는다.
  ['로그아웃했으면', null],
])('추가: 응답을 기다리는 사이에 %s 안내를 남기지 않는다', async (_case, nextUser) => {
  mockDetail()
  const request = deferred(ADD)
  const { queryClient } = renderApp(PATH, { me: admin })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('button', { name: '추가하는 중' })

  queryClient.setQueryData(['auth', 'me'], nextUser)
  if (nextUser === null) await screen.findByRole('heading', { level: 1, name: '로그인' })
  request.respond(
    jsonResponse(
      { ...doyun, guardians: [mother, father, { ...existing, linkedToExisting: true }] },
      201,
    ),
  )
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))

  // 학부모 이름과 가린 번호가 든 안내다. 다음 사람의 캐시에 남으면 안 된다.
  expect(queryClient.getQueryData(['students', 'guardian-added-notice', 1])).toBeUndefined()
  expect(statuses()).toEqual([])
})

test('추가: 응답을 받지 못하고 취소했는데 다른 이름의 학부모가 연결돼 있으면, 기존 학부모일 수 있다고 알린다', async () => {
  const server = mockDetail()
  loseAddResponse(server, existing)
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  // 다시 받은 학생에는 이미 그 학부모가 있다. 창이 열려 있는 동안에는 알리지 않는다.
  // 그대로 다시 누르면 정확한 안내를 받기 때문이다.
  await waitFor(() => expect(guardianRows()).toHaveLength(3))
  expect(statuses()).toEqual([])

  await press(dialog, '취소')

  await closed()
  expect(statuses()).toEqual([
    '박다른(010-****-1111) 학부모가 추가돼 있어요. 입력한 이름(박순자)과 달라요. 이미 등록된 학부모에 연결된 것일 수 있으니, 다른 사람이라면 연결을 끊고 번호를 확인해 주세요.',
  ])
})

test.each<[string, () => Response]>([
  [
    '응답을 받지 못하고',
    () => {
      throw new TypeError('Failed to fetch')
    },
  ],
  // 중간 서버가 끊었을 뿐 처리는 끝난 경우다.
  ['서버 오류(502)로 끝나고', () => problemResponse(502, { detail: '서버 오류' })],
])(
  '추가: %s 취소했는데 입력한 이름의 학부모가 추가돼 있으면 가린 번호와 함께 알린다',
  async (_case, fail) => {
    const server = mockDetail()
    mockApi({
      [ADD]: () => {
        server.student = { ...doyun, guardians: [mother, father, grandma] }
        return fail()
      },
    })
    renderApp(PATH, { me: staff })
    const dialog = await open('학부모 추가', '학부모 추가')
    // 앞뒤 공백은 떼고 보낸다. 견줄 때도 뗀 이름으로 견준다(아니면 같은 이름인데 다르다고 알린다).
    await fill(dialog, '이름', ' 박순자 ')
    await fill(dialog, '휴대전화', '010-2222-1111')
    await press(dialog, '추가')
    await within(dialog).findByRole('alert')

    await press(dialog, '취소')

    await closed()
    await waitFor(() =>
      expect(statuses()).toEqual(['박순자(010-****-1111) 학부모가 추가돼 있어요.']),
    )
  },
)

test('추가: 응답을 받지 못하고 취소했고 다시 받은 학생에도 없으면, 지금은 보이지 않는다고 알린다', async () => {
  const server = mockDetail()
  loseAddResponse(server)
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await waitFor(() => expect(count(DETAIL)).toBe(2))
  // 창이 열려 있는 동안에는 알리지 않는다. 창 안의 안내가 다시 누르라고 알린다.
  expect(statuses()).toEqual([])

  await press(dialog, '취소')

  await closed()
  expect(guardianRows()).toHaveLength(2)
  // 침묵하면 추가되지 않은 것으로 알고 넘어간다. 서버가 아직 처리하는 중일 수도 있다.
  await waitFor(() => expect(statuses()).toEqual([NOT_VISIBLE]))
  expect(screen.getByText(NOT_VISIBLE).closest('[role="status"]')).toHaveClass('bg-warn-bg')
})

test('추가: 지금은 보이지 않는다는 안내에서 다시 확인하면 학생을 다시 받고, 그때 보이면 추가돼 있다고 알린다', async () => {
  const server = mockDetail()
  loseAddResponse(server)
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await press(dialog, '취소')
  await closed()
  await waitFor(() => expect(statuses()).toEqual([NOT_VISIBLE]))
  const before = count(DETAIL)

  // 서버의 처리가 늦게 끝났다.
  server.student = { ...doyun, guardians: [mother, father, grandma] }
  await pressInNotice(NOT_VISIBLE, '다시 확인')

  await waitFor(() => expect(statuses()).toEqual(['박순자(010-****-1111) 학부모가 추가돼 있어요.']))
  expect(count(DETAIL)).toBe(before + 1)
})

test('추가: 응답을 놓친 뒤 학생을 아직 다시 받지 못했으면, 받는 동안 확인하고 있다고 알린다', async () => {
  const server = mockDetail()
  let refetch = {} as ReturnType<typeof deferred>
  mockApi({
    [ADD]: () => {
      // 곧바로 나가는 다시 받기가 오래 걸린다.
      refetch = deferred(DETAIL)
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')

  await press(dialog, '취소')

  await closed()
  await waitFor(() => expect(statuses()).toEqual([CHECKING]))
  refetch.respond(jsonResponse(server.student))
  await waitFor(() => expect(statuses()).toEqual([NOT_VISIBLE]))
})

test('추가: 다시 확인을 누르면 받는 동안 버튼이 남아 포커스를 잃지 않고, 문구도 바뀌지 않는다', async () => {
  const server = mockDetail()
  loseAddResponse(server)
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await press(dialog, '취소')
  await closed()
  await waitFor(() => expect(statuses()).toEqual([NOT_VISIBLE]))

  const refetch = deferred(DETAIL)
  await pressInNotice(NOT_VISIBLE, '다시 확인')

  // 버튼을 없애면 누른 버튼의 포커스가 갈 곳을 잃는다. 그대로 두고 눌러도 다시 보내지 않게만 한다.
  const busy = await screen.findByRole('button', { name: '확인하는 중' })
  expect(busy).toHaveFocus()
  expect(busy).toHaveAttribute('aria-disabled', 'true')
  // 한 번 확인한 뒤에는 받는 동안에도 문구가 그대로다(탭을 오갈 때마다 다시 받는다).
  expect(statuses()).toEqual([NOT_VISIBLE])
  const sent = count(DETAIL)
  await userEvent.click(busy)
  expect(count(DETAIL)).toBe(sent)

  refetch.respond(jsonResponse(server.student))
  expect(await screen.findByRole('button', { name: '다시 확인' })).toHaveFocus()
})

test('추가: 확인하지 못했다는 안내도 닫기를 누르면 사라진다', async () => {
  mockDetail()
  mockApi({
    [ADD]: () => {
      mockApi({ [DETAIL]: () => problemResponse(403, { detail: '권한이 없습니다.' }) })
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await press(dialog, '취소')
  await closed()
  await waitFor(() => expect(statuses()).toEqual([UNCHECKED]))

  await pressInNotice(UNCHECKED, '닫기')

  await waitFor(() => expect(statuses()).toEqual([]))
})

test('추가: 응답 없이 끝난 뒤 오래 떠나 받아 둔 학생이 지워졌어도, 돌아와 다시 받으면 확인한 것으로 본다', async () => {
  mockDetail()
  mockApi({ 'POST /api/v1/students/search': () => jsonResponse(emptyList) })
  const request = deferred(ADD)
  const { router, queryClient } = renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('button', { name: '추가하는 중' })
  await router.navigate('/desk/students')
  await screen.findByRole('heading', { level: 1, name: '학생' })
  request.respond(problemResponse(502, { detail: '서버 오류' }))
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))
  await waitFor(() => expect(queryClient.isFetching()).toBe(0))

  // 보는 화면이 없는 학생 자료는 5분 뒤 지워진다. 기록은 남는다.
  queryClient.removeQueries({ queryKey: ['students', 'detail', 1] })
  await router.navigate(PATH)

  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  // 방금 받은 학생이다. "확인하지 못했어요"에 머물면 안 된다.
  await waitFor(() => expect(statuses()).toEqual([NOT_VISIBLE]))
})

test('추가: 추가됐는지 모른다는 안내는 닫기를 누르면 사라지고, 다시 받아도 돌아오지 않는다', async () => {
  const server = mockDetail()
  loseAddResponse(server)
  const { queryClient } = renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await press(dialog, '취소')
  await closed()
  await waitFor(() => expect(statuses()).toEqual([NOT_VISIBLE]))

  await pressInNotice(NOT_VISIBLE, '닫기')

  await waitFor(() => expect(statuses()).toEqual([]))
  server.student = { ...doyun, guardians: [mother, father, grandma] }
  await queryClient.invalidateQueries({ queryKey: ['students', 'detail', 1] })
  await waitFor(() => expect(guardianRows()).toHaveLength(3))
  expect(statuses()).toEqual([])
})

test('추가: 응답을 기다리다 화면을 떠난 뒤에 응답 없이 끝나도, 돌아오면 추가돼 있는 학부모를 알린다', async () => {
  const server = mockDetail()
  mockApi({ 'POST /api/v1/students/search': () => jsonResponse(emptyList) })
  const request = deferred(ADD)
  const { router, queryClient } = renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('button', { name: '추가하는 중' })

  // 저장하는 동안 창은 닫지 못해도, 브라우저의 뒤로 가기로는 떠날 수 있다.
  await router.navigate('/desk/students')
  await screen.findByRole('heading', { level: 1, name: '학생' })
  // 잘못 넣은 번호가 남의 학부모의 것이었다. 서버는 그 학부모를 연결했고, 응답은 중간에서 끊겼다.
  server.student = { ...doyun, guardians: [mother, father, existing] }
  request.respond(problemResponse(502, { detail: '서버 오류' }))
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))

  // 화면이 없어도 요청이 적어 둔다. 입력한 이름과 시도하기 전의 학부모뿐이고, 번호는 없다.
  expect(queryClient.getQueryData(['students', 'guardian-add-unsure', 1])).toMatchObject({
    typedNames: ['박순자'],
    knownIds: [7, 8],
  })
  expect(
    JSON.stringify(queryClient.getQueryData(['students', 'guardian-add-unsure', 1])),
  ).not.toContain('1111')
  // 보는 화면이 없는 캐시는 5분 뒤 지워진다. 돌아올 때까지 지워지지 않게 남긴다.
  expect(
    queryClient.getQueryCache().find({ queryKey: ['students', 'guardian-add-unsure', 1] })?.gcTime,
  ).toBe(Infinity)

  await router.navigate(PATH)

  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  await waitFor(() =>
    expect(statuses()).toEqual([
      '박다른(010-****-1111) 학부모가 추가돼 있어요. 입력한 이름(박순자)과 달라요. 이미 등록된 학부모에 연결된 것일 수 있으니, 다른 사람이라면 연결을 끊고 번호를 확인해 주세요.',
    ]),
  )
  // 읽었다고 지우지 않는다. 다른 화면에 갔다 와도 닫을 때까지 보인다.
  await router.navigate('/desk/students')
  await screen.findByRole('heading', { level: 1, name: '학생' })
  await router.navigate(PATH)
  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  await waitFor(() =>
    expect(statuses()).toEqual([
      '박다른(010-****-1111) 학부모가 추가돼 있어요. 입력한 이름(박순자)과 달라요. 이미 등록된 학부모에 연결된 것일 수 있으니, 다른 사람이라면 연결을 끊고 번호를 확인해 주세요.',
    ]),
  )
})

test.each([
  ['다른 사람이 로그인했으면', staff],
  ['로그아웃했으면', null],
])(
  '추가: 응답을 기다리는 사이에 %s 추가됐는지 모른다는 것을 남기지 않는다',
  async (_case, nextUser) => {
    mockDetail()
    const request = deferred(ADD)
    const { queryClient } = renderApp(PATH, { me: admin })
    const dialog = await open('학부모 추가', '학부모 추가')
    await fillNewGuardian(dialog)
    await press(dialog, '추가')
    await within(dialog).findByRole('button', { name: '추가하는 중' })

    queryClient.setQueryData(['auth', 'me'], nextUser)
    if (nextUser === null) await screen.findByRole('heading', { level: 1, name: '로그인' })
    request.respond(problemResponse(502, { detail: '서버 오류' }))
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))

    // 앞사람이 입력한 학부모 이름이 든 자료다. 다음 사람의 캐시 어디에도 남으면 안 된다.
    expect(queryClient.getQueryData(['students', 'guardian-add-unsure', 1]) ?? null).toBeNull()
    const cached = JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    )
    expect(cached).not.toContain('박순자')
  },
)

test('추가: 서버가 거부한 추가(4xx)는 취소한 뒤 학부모가 늘어 있어도 추가됐다고 알리지 않는다', async () => {
  const server = mockDetail()
  mockApi({
    [ADD]: () => {
      // 다른 직원이 같은 때에 다른 학부모를 붙였다.
      server.student = { ...doyun, guardians: [mother, father, existing] }
      return problemResponse(403, { detail: '권한이 없습니다.', code: 'COMMON_FORBIDDEN' })
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await waitFor(() => expect(guardianRows()).toHaveLength(3))

  await press(dialog, '취소')

  await closed()
  expect(statuses()).toEqual([])
})

test('추가: 응답을 받지 못한 뒤 그대로 다시 눌러 성공하면 그 응답의 안내만 보여준다', async () => {
  let attempts = 0
  const server = mockDetail()
  mockApi({
    [ADD]: () => {
      attempts += 1
      server.student = { ...doyun, guardians: [mother, father, existing] }
      if (attempts === 1) throw new TypeError('Failed to fetch')
      // 같은 키로 다시 보내면 서버는 처음의 응답을 준다.
      return jsonResponse(
        { ...doyun, guardians: [mother, father, { ...existing, linkedToExisting: true }] },
        201,
      )
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')

  await press(dialog, '추가')

  await closed()
  await waitFor(() => expect(statuses()).toHaveLength(1))
  expect(statuses()[0]).toContain('이미 등록된 학부모(박다른, 010-****-1111)에 연결했어요.')
  expect(statuses()[0]).not.toContain('추가돼 있어요')
})

test('추가: 두 번 응답을 받지 못해도 처음 시도하기 전의 학부모를 기준으로 알린다', async () => {
  const server = mockDetail()
  loseAddResponse(server, existing)
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  // 다시 받은 학생에 이미 그 학부모가 있다. 이 상태에서 다시 눌러 또 응답을 받지 못한다.
  await waitFor(() => expect(guardianRows()).toHaveLength(3))
  await press(dialog, '추가')
  await waitFor(() => expect(count(ADD)).toBe(2))
  await within(dialog).findByRole('button', { name: '추가' })

  await press(dialog, '취소')

  await closed()
  await waitFor(() => expect(statuses()).toHaveLength(1))
  expect(statuses()[0]).toContain('박다른(010-****-1111) 학부모가 추가돼 있어요.')
})

test('추가: 놓친 추가를 알린 안내는 수정이나 연결 끊기를 시작해도 남고, 닫기를 누르면 사라진다', async () => {
  const server = mockDetail()
  loseAddResponse(server, existing)
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await press(dialog, '취소')
  await closed()
  await waitFor(() => expect(statuses()).toHaveLength(1))
  const [appeared] = statuses()

  // 안내를 보고 그 학부모의 연결을 끊으려는 순간에 이름과 번호가 사라지면 안 된다.
  const unlinkDialog = await open('박다른 연결 끊기', '학부모 연결을 끊을까요?')
  expect(statuses()).toEqual([appeared])
  await press(unlinkDialog, '닫기')
  await closed()
  const editDialog = await open('이영희 수정', '학부모 수정')
  expect(statuses()).toEqual([appeared])
  await press(editDialog, '취소')
  await closed()

  await pressInNotice(appeared!, '닫기')

  await waitFor(() => expect(statuses()).toEqual([]))
})

test('추가: 놓친 추가를 알린 안내는 추가 창을 열었다 닫아도 남는다', async () => {
  const server = mockDetail()
  loseAddResponse(server, existing)
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await press(dialog, '취소')
  await closed()
  await waitFor(() => expect(statuses()).toHaveLength(1))
  const before = statuses()

  // 창이 열려 있는 동안에만 가린다.
  const again = await open('학부모 추가', '학부모 추가')
  expect(statuses()).toEqual([])
  await press(again, '취소')
  await closed()

  // 남의 학부모에 연결됐을 수 있다는 안내다. 창을 열어 봤다고 사라지면 안 된다.
  expect(statuses()).toEqual(before)
})

test('추가: 지금은 보이지 않는다는 안내대로 다시 추가해 성공하면, 추가했다는 안내만 남는다', async () => {
  const server = mockDetail()
  loseAddResponse(server)
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await press(dialog, '취소')
  await closed()
  await waitFor(() => expect(statuses()).toEqual([NOT_VISIBLE]))

  mockApi({
    [ADD]: () => {
      server.student = { ...doyun, guardians: [mother, father, grandma] }
      return jsonResponse(server.student, 201)
    },
  })
  const again = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(again)
  await press(again, '추가')

  await closed()
  await waitFor(() => expect(statuses()).toEqual(['박순자 학부모를 추가했어요.']))
})

test('추가: 지금은 보이지 않는다는 안내 뒤에 처음 시도가 늦게 반영되면, 추가 창을 열어 봤어도 그 학부모를 알린다', async () => {
  const server = mockDetail()
  loseAddResponse(server)
  const { queryClient } = renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await press(dialog, '취소')
  await closed()
  await waitFor(() => expect(statuses()).toEqual([NOT_VISIBLE]))
  const again = await open('학부모 추가', '학부모 추가')
  await press(again, '취소')
  await closed()

  // 서버의 처리가 늦게 끝났다. 잘못 넣은 번호는 남의 학부모의 것이었다.
  server.student = { ...doyun, guardians: [mother, father, existing] }
  await queryClient.invalidateQueries({ queryKey: ['students', 'detail', 1] })

  await waitFor(() =>
    expect(statuses()).toEqual([
      '박다른(010-****-1111) 학부모가 추가돼 있어요. 입력한 이름(박순자)과 달라요. 이미 등록된 학부모에 연결된 것일 수 있으니, 다른 사람이라면 연결을 끊고 번호를 확인해 주세요.',
    ]),
  )
})

test('추가: 놓친 추가를 알린 안내는 다른 학부모를 고치거나 끊어도 남는다', async () => {
  const server = mockDetail()
  loseAddResponse(server, existing)
  mockApi({
    [PROFILE]: () => {
      server.student = {
        ...doyun,
        guardians: [{ ...mother, name: '이영희 어머님' }, father, existing],
      }
      return jsonResponse({ id: 7, name: '이영희 어머님', phone: '010-****-5678' })
    },
    'DELETE /api/v1/students/1/guardians/8': () => {
      server.student = {
        ...doyun,
        guardians: [{ ...mother, name: '이영희 어머님' }, existing],
      }
      return noContent()
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await press(dialog, '취소')
  await closed()
  await waitFor(() =>
    expect(statuses()).toEqual([
      '박다른(010-****-1111) 학부모가 추가돼 있어요. 입력한 이름(박순자)과 달라요. 이미 등록된 학부모에 연결된 것일 수 있으니, 다른 사람이라면 연결을 끊고 번호를 확인해 주세요.',
    ]),
  )

  const editDialog = await open('이영희 수정', '학부모 수정')
  await fill(editDialog, '이름', '이영희 어머님')
  await press(editDialog, '저장')
  await closed()

  // 남의 학부모에 연결됐을 수 있다는 안내는 그 학부모를 처리할 때까지 남아야 한다.
  await waitFor(() =>
    expect(statuses()).toEqual([
      '학부모 정보를 고쳤어요.',
      '박다른(010-****-1111) 학부모가 추가돼 있어요. 입력한 이름(박순자)과 달라요. 이미 등록된 학부모에 연결된 것일 수 있으니, 다른 사람이라면 연결을 끊고 번호를 확인해 주세요.',
    ]),
  )

  const unlinkDialog = await open('김철수 연결 끊기', '학부모 연결을 끊을까요?')
  await press(unlinkDialog, '연결 끊기')
  await closed()

  await waitFor(() =>
    expect(statuses()).toEqual([
      '박다른(010-****-1111) 학부모가 추가돼 있어요. 입력한 이름(박순자)과 달라요. 이미 등록된 학부모에 연결된 것일 수 있으니, 다른 사람이라면 연결을 끊고 번호를 확인해 주세요.',
      '김철수 학부모의 연결을 끊었어요.',
    ]),
  )
})

test('추가: 놓친 추가로 붙은 학부모를 고치면 그 안내를 지운다', async () => {
  const server = mockDetail()
  loseAddResponse(server, existing)
  mockApi({
    'PUT /api/v1/guardians/20': () => {
      server.student = { ...doyun, guardians: [mother, father, { ...existing, name: '박순자' }] }
      return jsonResponse({ id: 20, name: '박순자', phone: '010-****-1111' })
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await press(dialog, '취소')
  await closed()
  await waitFor(() => expect(statuses()).toHaveLength(1))
  const fetched = count(DETAIL)

  const editDialog = await open('박다른 수정', '학부모 수정')
  await fill(editDialog, '이름', '박순자')
  await press(editDialog, '저장')
  await closed()

  // 이름을 고쳤다고 "박순자 학부모가 추가돼 있어요"로 바뀌어 다시 뜨지 않는다.
  await waitFor(() => expect(statuses()).toEqual(['학부모 정보를 고쳤어요.']))
  await waitFor(() => expect(count(DETAIL)).toBeGreaterThan(fetched))
  await waitFor(() => expect(guardianRows()).toHaveLength(3))
  expect(statuses()).toEqual(['학부모 정보를 고쳤어요.'])
})

test('추가: 놓친 추가로 붙은 학부모가 둘이면, 한 안내를 닫아도 다른 안내는 남는다', async () => {
  const another: Guardian = { ...existing, id: 21, name: '최다른', phone: '010-****-9999' }
  const server = mockDetail()
  mockApi({
    [ADD]: () => {
      server.student = { ...doyun, guardians: [mother, father, existing, another] }
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await press(dialog, '취소')
  await closed()
  await waitFor(() => expect(statuses()).toHaveLength(2))
  const [first, second] = statuses()
  expect(first).toContain('박다른(010-****-1111)')
  expect(second).toContain('최다른(010-****-9999)')

  await pressInNotice(first!, '닫기')

  await waitFor(() => expect(statuses()).toEqual([second]))
  await pressInNotice(second!, '닫기')
  // 마지막 안내까지 닫으면 "보이지 않는다"는 안내로 바뀌지 않고 끝난다.
  await waitFor(() => expect(statuses()).toEqual([]))
})

test('추가: 기존 학부모에 연결했다는 안내는 그 학부모를 고치면 지운다', async () => {
  const server = mockDetail()
  mockApi({
    [ADD]: () => {
      server.student = { ...doyun, guardians: [mother, father, existing] }
      return jsonResponse(
        { ...doyun, guardians: [mother, father, { ...existing, linkedToExisting: true }] },
        201,
      )
    },
    'PUT /api/v1/guardians/20': () => {
      server.student = { ...doyun, guardians: [mother, father, { ...existing, name: '박순자' }] }
      return jsonResponse({ id: 20, name: '박순자', phone: '010-****-1111' })
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await closed()
  await waitFor(() => expect(statuses()).toEqual([LINKED]))

  const editDialog = await open('박다른 수정', '학부모 수정')
  // 수정 창을 여는 것만으로는 지우지 않는다.
  expect(statuses()).toEqual([LINKED])
  await fill(editDialog, '이름', '박순자')
  await press(editDialog, '저장')
  await closed()

  // 안내에 적힌 이름은 고치기 전의 것이다. 남겨 두면 지금 이름과 어긋난다.
  await waitFor(() => expect(statuses()).toEqual(['학부모 정보를 고쳤어요.']))
})

test('추가: 놓친 추가로 붙은 학부모의 연결을 끊으면 그 안내를 지우고, 보이지 않는다고 알리지도 않는다', async () => {
  const server = mockDetail()
  loseAddResponse(server, existing)
  mockApi({
    'DELETE /api/v1/students/1/guardians/20': () => {
      server.student = doyun
      return noContent()
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await press(dialog, '취소')
  await closed()
  await waitFor(() => expect(statuses()).toHaveLength(1))
  const fetched = count(DETAIL)

  const unlinkDialog = await open('박다른 연결 끊기', '학부모 연결을 끊을까요?')
  await press(unlinkDialog, '연결 끊기')

  await closed()
  await waitFor(() => expect(statuses()).toEqual(['박다른 학부모의 연결을 끊었어요.']))
  // 끊은 뒤 학생을 다시 받은 다음에도 그대로다.
  await waitFor(() => expect(count(DETAIL)).toBeGreaterThan(fetched))
  await waitFor(() => expect(guardianRows()).toHaveLength(2))
  expect(statuses()).toEqual(['박다른 학부모의 연결을 끊었어요.'])
})

test('추가: 놓친 추가로 붙은 학부모를 끊었는데 그 응답도 놓치면, 끊었다고만 알리고 보이지 않는다고 알리지 않는다', async () => {
  const server = mockDetail()
  loseAddResponse(server, existing)
  mockApi({
    'DELETE /api/v1/students/1/guardians/20': () => {
      // 서버는 끊었는데 응답을 받지 못했다.
      server.student = doyun
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await press(dialog, '취소')
  await closed()
  await waitFor(() => expect(statuses()).toHaveLength(1))

  const unlinkDialog = await open('박다른 연결 끊기', '학부모 연결을 끊을까요?')
  await press(unlinkDialog, '연결 끊기')

  // 다시 받은 학생에 없으니 끊긴 것이다. 한 번 보였던 학부모라, 추가되지 않았을 수 있다고 알리면 틀린다.
  await waitFor(() => expect(guardianRows()).toHaveLength(2))
  await waitFor(() => expect(statuses()).toEqual(['박다른 학부모의 연결을 끊었어요.']))
})

test('추가: 놓친 추가로 붙은 학부모를 다른 직원이 끊으면, 보이지 않는다고 알리지 않는다', async () => {
  const server = mockDetail()
  loseAddResponse(server, existing)
  const { queryClient } = renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await press(dialog, '취소')
  await closed()
  await waitFor(() => expect(statuses()).toHaveLength(1))

  server.student = doyun
  await queryClient.invalidateQueries({ queryKey: ['students', 'detail', 1] })

  await waitFor(() => expect(guardianRows()).toHaveLength(2))
  expect(statuses()).toEqual([])
})

test('추가: 응답을 받지 못한 뒤 번호만 고쳐 다시 보내 성공하면, 처음 시도로 붙은 같은 이름의 학부모를 계속 알린다', async () => {
  // 처음에 잘못 넣은 번호로 붙은 학부모와, 고친 번호로 새로 만든 학부모. 이름이 같다.
  const first: Guardian = { ...grandma, id: 21, phone: '010-****-9999' }
  const second: Guardian = { ...grandma, id: 22 }
  let attempts = 0
  const server = mockDetail()
  mockApi({
    [ADD]: () => {
      attempts += 1
      if (attempts === 1) {
        server.student = { ...doyun, guardians: [mother, father, first] }
        throw new TypeError('Failed to fetch')
      }
      server.student = { ...doyun, guardians: [mother, father, first, second] }
      return jsonResponse(server.student, 201)
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fill(dialog, '이름', '박순자')
  await fill(dialog, '휴대전화', '010-2222-9999')
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await waitFor(() => expect(guardianRows()).toHaveLength(3))

  await fill(dialog, '휴대전화', '010-2222-1111')
  await press(dialog, '추가')

  await closed()
  // 이 응답이 설명하는 학부모는 이번에 보내기 전에 없던 쪽(뒷자리 1111)이다. 남은 쪽(9999)을 알려야 끊을 수 있다.
  await waitFor(() => expect(statuses()).toHaveLength(2))
  expect(statuses()).toEqual(
    expect.arrayContaining([
      '박순자 학부모를 추가했어요.',
      '박순자(010-****-9999) 학부모가 추가돼 있어요.',
    ]),
  )
})

test('추가: 다시 받기에 실패했으면, 그사이 다른 학부모의 연결을 끊어도 확인한 것으로 보지 않는다', async () => {
  const server = mockDetail()
  loseAddResponse(server)
  mockApi({ 'DELETE /api/v1/students/1/guardians/8': () => noContent() })
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  // 이제부터 학생을 받지 못한다.
  mockApi({ [DETAIL]: () => unreadableResponse() })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await press(dialog, '취소')
  await closed()
  await waitFor(() => expect(statuses()).toEqual([UNCHECKED]))

  const unlinkDialog = await open('김철수 연결 끊기', '학부모 연결을 끊을까요?')
  await press(unlinkDialog, '연결 끊기')

  // 끊은 학부모를 화면이 직접 뺐을 뿐 학생을 다시 받은 것이 아니다. 보이지 않는다고 단정하면 틀릴 수 있다.
  await waitFor(() =>
    expect(statuses()).toEqual(expect.arrayContaining(['김철수 학부모의 연결을 끊었어요.'])),
  )
  expect(statuses()).toContain(UNCHECKED)
  expect(screen.queryByText(NOT_VISIBLE)).not.toBeInTheDocument()
})

test('추가: 기존 학부모에 연결했다는 안내는 다음 일을 시작해도 남고, 닫기를 누르면 사라진다', async () => {
  mockDetail()
  mockApi({
    [ADD]: () =>
      jsonResponse(
        { ...doyun, guardians: [mother, father, { ...existing, linkedToExisting: true }] },
        201,
      ),
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await closed()
  await waitFor(() => expect(statuses()).toEqual([LINKED]))
  // 끝난 일이 아니라 확인할 일이다.
  expect(screen.getByText(LINKED).closest('[role="status"]')).toHaveClass('bg-warn-bg')

  // 안내를 보고 연결을 끊으려는 순간에 이름과 번호가 사라지면 안 된다.
  const unlinkDialog = await open('박다른 연결 끊기', '학부모 연결을 끊을까요?')
  expect(statuses()).toEqual([LINKED])
  await press(unlinkDialog, '닫기')
  await closed()

  await pressInNotice(LINKED, '닫기')

  expect(statuses()).toEqual([])
})

test('추가: 기존 학부모에 연결했다는 안내는 그 학부모의 연결을 끊으면 사라진다', async () => {
  const server = mockDetail()
  mockApi({
    [ADD]: () => {
      server.student = { ...doyun, guardians: [mother, father, existing] }
      return jsonResponse(
        { ...doyun, guardians: [mother, father, { ...existing, linkedToExisting: true }] },
        201,
      )
    },
    'DELETE /api/v1/students/1/guardians/20': () => {
      server.student = doyun
      return noContent()
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await closed()
  await waitFor(() => expect(statuses()).toEqual([LINKED]))

  const unlinkDialog = await open('박다른 연결 끊기', '학부모 연결을 끊을까요?')
  await press(unlinkDialog, '연결 끊기')

  await closed()
  await waitFor(() => expect(statuses()).toEqual(['박다른 학부모의 연결을 끊었어요.']))
})

test('추가: 새로 만든 학부모를 추가했다는 안내에는 닫기가 없고, 다음 일을 시작하면 지운다', async () => {
  mockDetail()
  mockApi({ [ADD]: () => jsonResponse({ ...doyun, guardians: [mother, father, grandma] }, 201) })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await closed()
  await waitFor(() => expect(statuses()).toEqual(['박순자 학부모를 추가했어요.']))
  const notice = screen
    .getByText('박순자 학부모를 추가했어요.')
    .closest<HTMLElement>('[role="status"]')!
  expect(notice).toHaveClass('bg-mint-bg')
  expect(within(notice).queryByRole('button')).toBeNull()

  await open('이영희 수정', '학부모 수정')

  expect(statuses()).toEqual([])
})

test('추가: 응답을 받지 못한 뒤 번호를 고쳐 다시 보내 성공해도, 처음 시도로 붙은 학부모를 알린다', async () => {
  let attempts = 0
  const server = mockDetail()
  mockApi({
    [ADD]: () => {
      attempts += 1
      if (attempts === 1) {
        // 잘못 넣은 번호가 남의 학부모의 것이었다. 서버는 그 학부모를 연결했고 응답은 오지 않았다.
        server.student = { ...doyun, guardians: [mother, father, existing] }
        throw new TypeError('Failed to fetch')
      }
      // 고친 번호로는 새 학부모가 만들어진다. 내용이 달라 새 요청이므로 응답은 이 학부모만 설명한다.
      server.student = { ...doyun, guardians: [mother, father, existing, grandma] }
      return jsonResponse(server.student, 201)
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  const firstKey = requestOf(ADD).headers.get('Idempotency-Key')

  await fill(dialog, '휴대전화', '010-2222-9999')
  await press(dialog, '추가')

  await closed()
  expect(requestOf(ADD).headers.get('Idempotency-Key')).not.toBe(firstKey)
  await waitFor(() => expect(statuses()).toHaveLength(2))
  expect(statuses()).toEqual([
    '박순자 학부모를 추가했어요.',
    '박다른(010-****-1111) 학부모가 추가돼 있어요. 입력한 이름(박순자)과 달라요. 이미 등록된 학부모에 연결된 것일 수 있으니, 다른 사람이라면 연결을 끊고 번호를 확인해 주세요.',
  ])
})

test('추가: 번호를 고쳐 다시 보낸 것이 기존 학부모에 연결돼도, 처음 시도로 붙은 학부모를 따로 알린다', async () => {
  let attempts = 0
  const another: Guardian = { ...existing, id: 21, name: '최다른', phone: '010-****-9999' }
  const server = mockDetail()
  mockApi({
    [ADD]: () => {
      attempts += 1
      if (attempts === 1) {
        server.student = { ...doyun, guardians: [mother, father, existing] }
        throw new TypeError('Failed to fetch')
      }
      server.student = { ...doyun, guardians: [mother, father, existing, another] }
      return jsonResponse(
        { ...doyun, guardians: [mother, father, existing, { ...another, linkedToExisting: true }] },
        201,
      )
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')

  await fill(dialog, '휴대전화', '010-2222-9999')
  await press(dialog, '추가')

  await closed()
  await waitFor(() => expect(statuses()).toHaveLength(2))
  expect(statuses()[0]).toContain('이미 등록된 학부모(최다른, 010-****-9999)에 연결했어요.')
  expect(statuses()[1]).toContain('박다른(010-****-1111) 학부모가 추가돼 있어요.')
})

test('추가: 이름을 고쳐 다시 보내 또 응답을 받지 못해도, 앞서 입력한 이름의 학부모를 다른 이름이라고 하지 않는다', async () => {
  const server = mockDetail()
  loseAddResponse(server, grandma)
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  // 처음 시도(박순자)로 학부모가 추가됐다.
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await waitFor(() => expect(guardianRows()).toHaveLength(3))

  await fill(dialog, '이름', '박순희')
  await press(dialog, '추가')
  await waitFor(() => expect(count(ADD)).toBe(2))
  await within(dialog).findByRole('button', { name: '추가' })
  await press(dialog, '취소')

  await closed()
  await waitFor(() => expect(statuses()).toEqual(['박순자(010-****-1111) 학부모가 추가돼 있어요.']))
})

test('추가: 응답을 받지 못하고 취소한 뒤에 학생을 다시 받아 학부모가 보이면 그때 알린다', async () => {
  const server = mockDetail()
  mockApi({
    [ADD]: () => {
      server.student = { ...doyun, guardians: [mother, father, grandma] }
      // 연결이 끊겨 추가의 응답도, 곧바로 나가는 다시 받기도 실패한다(재시도하지 않는 답으로 흉내 낸다).
      mockApi({ [DETAIL]: () => problemResponse(403, { detail: '권한이 없습니다.' }) })
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await waitFor(() => expect(count(DETAIL)).toBe(2))
  await press(dialog, '취소')
  await closed()
  expect(guardianRows()).toHaveLength(2)
  // 다시 받지 못했다. 지금 보이는 학부모는 시도하기 전의 것이라 "보이지 않는다"고 하지 않는다.
  await waitFor(() => expect(statuses()).toEqual([UNCHECKED]))

  // 연결이 돌아왔다. 안내의 버튼으로 학생을 다시 받는다.
  mockApi({ [DETAIL]: () => jsonResponse(server.student) })
  await pressInNotice(UNCHECKED, '다시 확인')

  await waitFor(() => expect(statuses()).toEqual(['박순자(010-****-1111) 학부모가 추가돼 있어요.']))
})

test('추가 결과 안내는 그 학생의 상세에서만 뜨고, 다른 학생에게 학부모를 추가해도 덮이지 않는다', async () => {
  const seoyeon: Student = { ...doyun, id: 2, name: '김서연', guardians: [] }
  mockDetail()
  mockApi({
    'GET /api/v1/students/2': () => jsonResponse(seoyeon),
    'POST /api/v1/students/2/guardians': () =>
      jsonResponse({ ...seoyeon, guardians: [father] }, 201),
  })
  const request = deferred(ADD)
  const { router, queryClient } = renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('button', { name: '추가하는 중' })

  // 응답이 오기 전에 다른 학생의 상세로 간다. 김도윤의 안내는 여기서 뜨지 않는다.
  await router.navigate('/desk/students/2')
  await screen.findByRole('heading', { level: 1, name: '김서연' })
  request.respond(
    jsonResponse(
      { ...doyun, guardians: [mother, father, { ...existing, linkedToExisting: true }] },
      201,
    ),
  )
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))
  expect(statuses()).toEqual([])

  // 김서연에게 학부모를 추가한다. 김서연의 안내가 뜬다.
  await userEvent.click(screen.getByRole('button', { name: '학부모 추가' }))
  const second = await screen.findByRole('dialog', { name: '학부모 추가' })
  await fill(second, '이름', '김철수')
  await fill(second, '휴대전화', '010-9876-5432')
  await press(second, '추가')
  await closed()
  expect(statuses()).toEqual(['김철수 학부모를 추가했어요.'])

  // 김도윤에게 돌아오면 김도윤의 안내가 그대로 남아 있다.
  await router.navigate(PATH)
  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  expect(await screen.findByRole('status')).toHaveTextContent(
    '이미 등록된 학부모(박다른, 010-****-1111)에 연결했어요.',
  )
})

test('추가: 다시 눌러 새로 만든 학부모의 저장된 이름이 입력과 조금 달라도, 그 한 명을 또 알리지 않는다', async () => {
  let attempts = 0
  // 서버가 이름을 다듬어 저장했다(가운데 공백을 뺐다).
  const created: Guardian = { ...grandma, name: '박순자' }
  const server = mockDetail()
  mockApi({
    [ADD]: () => {
      attempts += 1
      server.student = { ...doyun, guardians: [mother, father, created] }
      if (attempts === 1) throw new TypeError('Failed to fetch')
      return jsonResponse(server.student, 201)
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fill(dialog, '이름', '박 순자')
  await fill(dialog, '휴대전화', '010-2222-1111')
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')

  await press(dialog, '추가')

  await closed()
  // 늘어난 학부모는 한 명이고 성공 안내가 그 학부모를 설명한다.
  await waitFor(() => expect(statuses()).toEqual(['박 순자 학부모를 추가했어요.']))
})

// ── 저장 중에 브라우저가 창을 닫아 버린 경우 ─────────────────────

test('추가하는 동안 브라우저가 창을 닫아 버려도 창이 남고, 실패하면 창 안에서 알린다', async () => {
  mockDetail()
  const request = deferred(ADD)
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('button', { name: '추가하는 중' })

  // closedby를 모르는 브라우저에서 Esc를 거듭 누른 것과 같다. 막을 수 없는 cancel 뒤에 브라우저가 창을 닫는다.
  fireEvent(dialog, new Event('cancel', { cancelable: false }))
  act(() => (dialog as HTMLDialogElement).close())

  // 창이 사라진 채로 남으면 실패 안내를 볼 수 없고, "학부모 추가"를 눌러도 다시 열리지 않는다.
  expect(screen.getByRole('dialog', { name: '학부모 추가' })).toBe(dialog)
  request.respond(phoneChangeLimited())
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('요청이 너무 많아요')
  expect(within(dialog).getByLabelText('이름')).toHaveValue('박순자')
  expect(within(dialog).getByLabelText('휴대전화')).toHaveValue('010-2222-1111')
  expect(count(ADD)).toBe(1)

  // 저장이 끝난 뒤에는 닫을 수 있다.
  await press(dialog, '취소')
  await closed()
})

// ── 저장하는 동안 입력칸을 막는다 ─────────────────────────

test('추가하는 동안에는 입력칸이 막히고, 실패하면 다시 풀린다', async () => {
  mockDetail()
  const request = deferred(ADD)
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)

  await press(dialog, '추가')

  await within(dialog).findByRole('button', { name: '추가하는 중' })
  // 저장 중에 고친 값이 있으면, 같은 내용으로 다시 보내라는 안내(UNSURE_RESEND_AS_IS)를 따라도 새 키로 나간다.
  for (const label of ['관계', '이름', '휴대전화']) {
    expect(within(dialog).getByLabelText(label)).toBeDisabled()
  }

  // 브라우저는 막힌 칸의 포커스를 치운다. 저장이 끝나면 있던 자리(누른 버튼)로 돌아온다.
  loseFocus()
  request.respond(phoneChangeLimited())

  await within(dialog).findByRole('alert')
  for (const label of ['관계', '이름', '휴대전화']) {
    expect(within(dialog).getByLabelText(label)).toBeEnabled()
  }
  expect(within(dialog).getByLabelText('이름')).toHaveValue('박순자')
  expect(within(dialog).getByRole('button', { name: '추가' })).toHaveFocus()
})

test('수정: 저장하는 동안에는 입력칸이 막히고, 실패하면 다시 풀린다', async () => {
  mockDetail()
  const request = deferred(RELATION)
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '기타')

  await press(dialog, '저장')

  await within(dialog).findByRole('button', { name: '저장하는 중' })
  for (const label of ['관계', '이름', '새 휴대전화']) {
    expect(within(dialog).getByLabelText(label)).toBeDisabled()
  }

  loseFocus()
  request.respond(problemResponse(403, { detail: '권한이 없습니다.', code: 'COMMON_FORBIDDEN' }))

  await within(dialog).findByRole('alert')
  for (const label of ['관계', '이름', '새 휴대전화']) {
    expect(within(dialog).getByLabelText(label)).toBeEnabled()
  }
  expect(within(dialog).getByRole('button', { name: '저장' })).toHaveFocus()
})

test('수정: 저장하는 동안 그 학부모의 연결이 끊겨 폼이 사라져도, 요청이 끝나면 다음 수정 창은 잠겨 있지 않다', async () => {
  const server = mockDetail()
  const request = deferred(RELATION)
  const { queryClient } = renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '기타')
  await press(dialog, '저장')
  await within(dialog).findByRole('button', { name: '저장하는 중' })

  // 응답을 기다리는 사이 다른 직원이 연결을 끊었고, 학생을 다시 받았다. 폼만 사라지고 창(saving을 가진 쪽)은 남는다.
  server.student = { ...doyun, guardians: [father] }
  await queryClient.invalidateQueries({ queryKey: ['students', 'detail', 1] })
  await closed()

  request.respond(
    problemResponse(404, {
      detail: '학부모를 찾을 수 없습니다.',
      code: 'MEMBER_GUARDIAN_NOT_FOUND',
    }),
  )
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))

  // 풀리지 않으면 이 창은 입력칸도 버튼도 막힌 채로 뜨고, 닫을 수도 없다.
  const next = await open('김철수 수정', '학부모 수정')
  await waitFor(() => expect(within(next).getByRole('button', { name: '저장' })).toBeEnabled())
  expect(within(next).getByLabelText('이름')).toBeEnabled()
  expect(within(next).getByRole('button', { name: '취소' })).toBeEnabled()
})

// ── 수정: 폼이 사라진 뒤에 온 성공 응답 ──────────────────

const PROFILE_SAVED = { id: 7, name: '이영화', phone: '010-****-5678' }
const GONE_NOTICE = '고치려던 학부모는 이미 연결이 끊겼어요.'
const LATE_NOTICE =
  '이영화 학부모는 그사이 이 학생과 연결이 끊겼어요. 저장한 이름·번호는 반영됐고, 형제에게 연결돼 있으면 거기에서 보여요.'

/**
 * 늦게 온 응답을 화면이 다 처리할 때까지 기다린다. "아무것도 바뀌지 않는다"를 보기 전에 부른다.
 * 요청이 끝난 것(isMutating이 0)만 기다리면 부족하다. 저장을 맡긴 쪽이 화면에 알리는 것은 그 뒤다.
 */
async function lateResponseHandled(queryClient: { isMutating: () => number }) {
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** 이영희의 이름을 고쳐 저장을 누르고, 응답을 기다리는 사이 다른 곳에서 연결이 끊겨 폼이 사라진 상태를 만든다. */
async function saveThenUnlinkedElsewhere() {
  const server = mockDetail()
  const request = deferred(PROFILE)
  const rendered = renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await fill(dialog, '이름', '이영화')
  await press(dialog, '저장')
  await within(dialog).findByRole('button', { name: '저장하는 중' })

  server.student = { ...doyun, guardians: [father] }
  await rendered.queryClient.invalidateQueries({ queryKey: ['students', 'detail', 1] })
  await closed()
  expect(screen.getByRole('alert')).toHaveTextContent(GONE_NOTICE)
  return { ...rendered, request, server }
}

test('수정: 저장하는 사이 연결이 끊겨 폼이 사라진 뒤 성공 응답이 오면, 고쳤다고만 하지 않고 끊긴 것과 반영된 것을 함께 알린다', async () => {
  const { request, queryClient } = await saveThenUnlinkedElsewhere()

  request.respond(jsonResponse(PROFILE_SAVED))
  await lateResponseHandled(queryClient)

  // 이름·번호는 학부모의 것이라 실제로 고쳐졌다. 형제에게 연결돼 있으면 거기에 반영된다.
  expect(await screen.findByRole('status')).toHaveTextContent(LATE_NOTICE)
  // 이 학생에게는 없는 학부모다. "학부모 정보를 고쳤어요"만 보이면 여기서 고쳐진 줄 안다.
  expect(screen.queryByText('학부모 정보를 고쳤어요.')).not.toBeInTheDocument()
  // 같은 일을 두 번 알리지 않는다.
  expect(screen.queryByText(GONE_NOTICE)).not.toBeInTheDocument()
})

test('수정: 폼이 사라진 뒤 다른 학부모의 수정 창을 열어 두면, 늦게 온 성공 응답이 그 창을 닫지 않고 안내도 바꾸지 않는다', async () => {
  const { request, queryClient } = await saveThenUnlinkedElsewhere()
  // 앞의 저장은 아직 끝나지 않았다. 그사이 다른 학부모를 고치기 시작한다.
  const next = await open('김철수 수정', '학부모 수정')
  await fill(next, '이름', '김철수 아버님')

  request.respond(jsonResponse(PROFILE_SAVED))
  await lateResponseHandled(queryClient)

  // 닫히면 입력하던 내용이 사라진다.
  expect(screen.getByRole('dialog', { name: '학부모 수정' })).toBeInTheDocument()
  expect(within(next).getByLabelText('이름')).toHaveValue('김철수 아버님')
  // 다음 일을 시작했으니 지난 일의 안내는 띄우지 않는다. 열어 둔 창 뒤에 떠도 보지 못한다.
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.queryByText(LATE_NOTICE)).not.toBeInTheDocument()
  expect(screen.queryByText('학부모 정보를 고쳤어요.')).not.toBeInTheDocument()
})

test('수정: 앞 학부모의 저장이 아직 끝나지 않았어도, 다음에 연 수정 창은 잠겨 있지 않고 저장할 수 있다', async () => {
  const { request, queryClient } = await saveThenUnlinkedElsewhere()
  mockApi({
    'PUT /api/v1/guardians/8': () =>
      jsonResponse({ id: 8, name: '김철호', phone: '010-****-5432' }),
  })

  // 앞의 요청(이영희)은 아직 응답이 없다.
  const next = await open('김철수 수정', '학부모 수정')
  // 누르지도 않았는데 "저장하는 중"으로 잠겨 있으면 안 된다.
  expect(within(next).getByRole('button', { name: '저장' })).toBeEnabled()
  expect(within(next).getByLabelText('이름')).toBeEnabled()
  await fill(next, '이름', '김철호')
  await press(next, '저장')

  await closed()
  expect(requestOf('PUT /api/v1/guardians/8').body).toEqual({ name: '김철호' })
  expect(screen.getByRole('status')).toHaveTextContent('학부모 정보를 고쳤어요.')

  // 뒤늦게 앞의 응답이 와도 방금의 안내를 바꾸지 않는다.
  request.respond(jsonResponse(PROFILE_SAVED))
  await lateResponseHandled(queryClient)
  expect(screen.getByRole('status')).toHaveTextContent('학부모 정보를 고쳤어요.')
  expect(screen.queryByText(LATE_NOTICE)).not.toBeInTheDocument()
})

test('수정: 폼이 사라진 뒤 다른 일을 시작했다 그만둬도, 늦게 온 성공 응답은 안내를 띄우지 않는다', async () => {
  const { request, queryClient } = await saveThenUnlinkedElsewhere()
  // 다음 일(추가)을 시작했다가 닫는다. 지난 안내는 이때 지워진다.
  const adding = await open('학부모 추가', '학부모 추가')
  await press(adding, '취소')
  await closed()
  expect(screen.queryByText(GONE_NOTICE)).not.toBeInTheDocument()

  request.respond(jsonResponse(PROFILE_SAVED))
  await lateResponseHandled(queryClient)

  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('수정: 폼이 사라진 뒤 실패 응답이 오면 끊겼다는 안내가 그대로 남는다', async () => {
  const { request, queryClient } = await saveThenUnlinkedElsewhere()

  request.respond(
    problemResponse(404, {
      detail: '학부모를 찾을 수 없습니다.',
      code: 'MEMBER_GUARDIAN_NOT_FOUND',
    }),
  )
  await lateResponseHandled(queryClient)

  // 폼과 함께 폼의 오류도 사라졌다. 이름·번호가 저장되지 않았다는 것을 끊겼다는 안내에 덧붙인다.
  expect(screen.getByRole('alert')).toHaveTextContent(
    `${GONE_NOTICE} 이름·번호는 저장되지 않았어요. 학부모를 찾을 수 없습니다.`,
  )
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('수정: 폼이 사라진 뒤 서버 오류로 끝나면, 이름·번호가 저장됐는지 모른다고 요청 번호와 함께 알린다', async () => {
  const { request, queryClient } = await saveThenUnlinkedElsewhere()

  request.respond(problemResponse(500, { detail: '서버 오류', requestId: 'req-gone-profile' }))
  await lateResponseHandled(queryClient)

  const alert = screen.getByRole('alert')
  expect(alert).toHaveTextContent(
    `${GONE_NOTICE} 이름·번호는 저장됐는지 확인하지 못했어요. 형제에게 연결돼 있으면 형제의 상세에서 확인해 주세요.`,
  )
  expect(alert).toHaveTextContent('req-gone-profile')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('수정: 관계를 저장하는 사이 폼이 사라지고 관계가 실패하면, 이름·번호는 보내지 않았다고 알린다', async () => {
  const server = mockDetail()
  const request = deferred(RELATION)
  const { queryClient } = renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '기타')
  await fill(dialog, '이름', '이영화')
  await press(dialog, '저장')
  await within(dialog).findByRole('button', { name: '저장하는 중' })
  server.student = { ...doyun, guardians: [father] }
  await queryClient.invalidateQueries({ queryKey: ['students', 'detail', 1] })
  await closed()

  request.respond(
    problemResponse(404, {
      detail: '학부모를 찾을 수 없습니다.',
      code: 'MEMBER_GUARDIAN_NOT_FOUND',
    }),
  )
  await lateResponseHandled(queryClient)

  expect(screen.getByRole('alert')).toHaveTextContent(
    `${GONE_NOTICE} 이름·번호는 저장하지 않았어요.`,
  )
  expect(count(PROFILE)).toBe(0)
})

test('수정: 거부된 뒤 다시 저장하는 사이 폼이 사라지면, 앞의 실패를 이번 결과처럼 알리지 않는다', async () => {
  const server = mockDetail()
  let attempts = 0
  let respond!: (response: Response) => void
  mockApi({
    [PROFILE]: () => {
      attempts += 1
      if (attempts === 1) return problemResponse(403, { detail: '권한이 없습니다.' })
      return new Promise<Response>((resolve) => (respond = resolve))
    },
  })
  const { queryClient } = renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await fill(dialog, '이름', '이영화')
  await press(dialog, '저장')
  await within(dialog).findByRole('alert')

  await press(dialog, '저장')
  await within(dialog).findByRole('button', { name: '저장하는 중' })
  server.student = { ...doyun, guardians: [father] }
  await queryClient.invalidateQueries({ queryKey: ['students', 'detail', 1] })
  await closed()

  // 이번 저장은 아직 끝나지 않았다. "저장되지 않았어요"는 앞의 시도의 것이다.
  expect(screen.getByRole('alert').textContent).toBe(GONE_NOTICE)

  respond(jsonResponse(PROFILE_SAVED))
  await lateResponseHandled(queryClient)
  expect(await screen.findByRole('status')).toHaveTextContent(LATE_NOTICE)
})

test('수정: 관계만 고치는 사이 폼이 사라진 뒤 성공 응답이 오면, 이름·번호가 반영됐다고 알리지 않는다', async () => {
  const server = mockDetail()
  const request = deferred(RELATION)
  const { queryClient } = renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '기타')
  await press(dialog, '저장')
  await within(dialog).findByRole('button', { name: '저장하는 중' })
  server.student = { ...doyun, guardians: [father] }
  await queryClient.invalidateQueries({ queryKey: ['students', 'detail', 1] })
  await closed()

  request.respond(jsonResponse({ ...doyun, guardians: [{ ...mother, relation: 'OTHER' }, father] }))
  await lateResponseHandled(queryClient)

  // 고친 것은 이 학생과의 관계뿐이고, 그 연결은 끊겼다. 남은 것이 없으니 끊겼다는 안내만 둔다.
  expect(screen.getByRole('alert').textContent).toBe(GONE_NOTICE)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(count(PROFILE)).toBe(0)
})

test('관계: 저장하는 사이 다른 곳에서 연결이 끊긴 것이 보였으면, 늦게 온 성공 응답이 그 학부모를 되살리지 않는다', async () => {
  const server = mockDetail()
  const request = deferred(RELATION)
  const { queryClient } = renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '기타')
  await press(dialog, '저장')
  await within(dialog).findByRole('button', { name: '저장하는 중' })
  // 서버는 관계를 바꾼 뒤 연결을 끊었다(다른 직원). 화면은 학생을 다시 받아 끊긴 것을 봤다.
  server.student = { ...doyun, guardians: [father] }
  await queryClient.invalidateQueries({ queryKey: ['students', 'detail', 1] })
  await closed()
  const fetched = count(DETAIL)

  // 응답은 끊기 전의 학생이다.
  request.respond(jsonResponse({ ...doyun, guardians: [{ ...mother, relation: 'OTHER' }, father] }))
  await lateResponseHandled(queryClient)

  expect(guardianRows()).toHaveLength(1)
  expect(guardianRows()[0]).toContain('김철수')
  // 받아 둔 학생이 낡았을 수 있어 다시 받는다.
  await waitFor(() => expect(count(DETAIL)).toBeGreaterThan(fetched))
  expect(guardianRows()).toHaveLength(1)
})

test('수정: 끊겼던 학부모가 다시 연결돼 그 수정 창을 새로 열어 두면, 앞 창의 늦은 성공 응답이 새 창을 닫지 않는다', async () => {
  const { request, queryClient, server } = await saveThenUnlinkedElsewhere()
  // 다른 곳에서 다시 연결됐고, 학생을 다시 받았다. 같은 학부모의 수정 창을 새로 열어 입력한다.
  server.student = doyun
  await queryClient.invalidateQueries({ queryKey: ['students', 'detail', 1] })
  const next = await open('이영희 수정', '학부모 수정')
  await fill(next, '이름', '이영희 어머님')

  request.respond(jsonResponse(PROFILE_SAVED))
  await lateResponseHandled(queryClient)

  // 고치는 학부모는 같아도, 그 저장을 시작한 창이 아니다. 닫히면 입력하던 내용이 사라진다.
  expect(screen.getByRole('dialog', { name: '학부모 수정' })).toBeInTheDocument()
  expect(within(next).getByLabelText('이름')).toHaveValue('이영희 어머님')
  expect(within(next).getByRole('button', { name: '저장' })).toBeEnabled()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('추가: Enter로 보내 실패하면 치던 칸으로 포커스가 돌아와, 고쳐서 다시 Enter로 보낼 수 있다', async () => {
  let attempts = 0
  let respond!: (response: Response) => void
  mockDetail()
  mockApi({
    [ADD]: () => {
      attempts += 1
      if (attempts > 1) return jsonResponse({ ...doyun, guardians: [mother, father, grandma] }, 201)
      return new Promise<Response>((resolve) => (respond = resolve))
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fill(dialog, '이름', '박순자')
  const phone = within(dialog).getByLabelText('휴대전화')

  await userEvent.type(phone, '010-2222-1111{Enter}')

  await within(dialog).findByRole('button', { name: '추가하는 중' })
  loseFocus()
  respond(phoneChangeLimited())
  await within(dialog).findByRole('alert')
  expect(phone).toHaveFocus()

  await userEvent.keyboard('{Enter}')

  await closed()
  expect(count(ADD)).toBe(2)
})

test('추가: 저장하는 동안 고치려 해도 값이 바뀌지 않아, 응답을 놓친 뒤 다시 누르면 같은 키와 같은 내용으로 나간다', async () => {
  let attempts = 0
  let fail!: (error: Error) => void
  mockDetail()
  mockApi({
    [ADD]: () => {
      attempts += 1
      if (attempts > 1) return jsonResponse({ ...doyun, guardians: [mother, father, grandma] }, 201)
      return new Promise<Response>((_resolve, reject) => (fail = reject))
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('button', { name: '추가하는 중' })
  const first = requestOf(ADD)

  // 응답을 기다리는 동안 이름을 고치려 한다. 막혀 있어 바뀌지 않는다.
  await userEvent.type(within(dialog).getByLabelText('이름'), '수정')
  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '기타').catch(() => {})
  fail(new TypeError('Failed to fetch'))
  await within(dialog).findByRole('alert')
  expect(within(dialog).getByLabelText('이름')).toHaveValue('박순자')

  await press(dialog, '추가')

  await closed()
  // 내용이 달라졌다면 새 키로 나가 학부모가 두 번 붙을 수 있다.
  expect(requestOf(ADD).headers.get('Idempotency-Key')).toBe(first.headers.get('Idempotency-Key'))
  expect(requestOf(ADD).body).toEqual(first.body)
})

test('수정: 관계가 저장된 뒤 이름·번호를 보내는 동안에도 입력칸이 막혀 있고 닫히지 않는다', async () => {
  mockDetail()
  mockApi({
    [RELATION]: () =>
      jsonResponse({ ...doyun, guardians: [{ ...mother, relation: 'OTHER' }, father] }),
  })
  const request = deferred(PROFILE)
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '기타')
  await fill(dialog, '새 휴대전화', '010-2222-1111')

  await press(dialog, '저장')

  await waitFor(() => expect(count(PROFILE)).toBe(1))
  for (const label of ['관계', '이름', '새 휴대전화']) {
    expect(within(dialog).getByLabelText(label)).toBeDisabled()
  }
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('dialog', { name: '학부모 수정' })).toBe(dialog)

  request.respond(
    problemResponse(409, {
      detail: '이미 쓰는 번호입니다.',
      code: 'MEMBER_GUARDIAN_PHONE_DUPLICATED',
    }),
  )

  await waitFor(() => expect(within(dialog).getByLabelText('새 휴대전화')).toBeEnabled())
  expect(within(dialog).getByLabelText('새 휴대전화')).toHaveValue('010-2222-1111')
})
