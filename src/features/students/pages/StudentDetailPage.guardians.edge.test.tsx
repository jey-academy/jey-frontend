import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
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
    'GET /api/v1/students': () =>
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
          { field: 'phone', message: '형식이 올바르지 않습니다' },
        ],
      }),
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await fill(dialog, '새 휴대전화', '010-2222-1111')

  await press(dialog, '저장')

  await waitFor(() =>
    expect(within(dialog).getByLabelText('새 휴대전화')).toHaveAccessibleDescription(
      '형식이 올바르지 않습니다',
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

// ── 추가 결과 안내를 놓치지 않는다 (#50) ───────────────────────────────────

// 같은 번호로 이미 등록돼 있던 학부모. 입력한 이름(박순자)과 저장된 이름이 다르다.
const existing: Guardian = {
  id: 20,
  relation: 'GRANDPARENT',
  name: '박다른',
  phone: '010-****-1111',
  linkedToExisting: false,
}

const emptyList = { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }

/** 추가 요청이 서버에는 닿았는데 응답은 오지 않는 상황. `saved`를 주면 서버에는 그 학부모가 연결된다. */
function loseAddResponse(server: { student: Student }, saved?: Guardian) {
  mockApi({
    [ADD]: () => {
      if (saved) server.student = { ...doyun, guardians: [mother, father, saved] }
      throw new TypeError('Failed to fetch')
    },
  })
}

function statuses() {
  return screen.queryAllByRole('status').map((notice) => notice.textContent)
}

test('추가: 응답을 기다리다 다른 화면에 갔다 와도 기존 학부모에 연결했다는 안내를 보여준다', async () => {
  mockDetail()
  mockApi({ 'GET /api/v1/students': () => jsonResponse(emptyList) })
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

test('추가: 응답을 기다리는 사이에 다른 사람이 로그인했으면 안내를 남기지 않는다', async () => {
  mockDetail()
  const request = deferred(ADD)
  const { queryClient } = renderApp(PATH, { me: admin })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('button', { name: '추가하는 중' })

  queryClient.setQueryData(['auth', 'me'], staff)
  request.respond(
    jsonResponse(
      { ...doyun, guardians: [mother, father, { ...existing, linkedToExisting: true }] },
      201,
    ),
  )
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))

  // 학부모 이름과 가린 번호가 든 안내다. 다음 사람의 캐시에 남으면 안 된다.
  expect(queryClient.getQueryData(['students', 'guardian-added-notice'])).toBeUndefined()
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

test('추가: 응답을 받지 못하고 취소했는데 입력한 이름의 학부모가 추가돼 있으면 그렇게 알린다', async () => {
  const server = mockDetail()
  loseAddResponse(server, grandma)
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')

  await press(dialog, '취소')

  await closed()
  await waitFor(() => expect(statuses()).toEqual(['박순자 학부모가 추가돼 있어요.']))
})

test('추가: 응답을 받지 못하고 취소했고 실제로도 추가되지 않았으면 아무것도 알리지 않는다', async () => {
  const server = mockDetail()
  loseAddResponse(server)
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fillNewGuardian(dialog)
  await press(dialog, '추가')
  await within(dialog).findByRole('alert')
  await waitFor(() => expect(count(DETAIL)).toBe(2))

  await press(dialog, '취소')

  await closed()
  expect(guardianRows()).toHaveLength(2)
  expect(statuses()).toEqual([])
})

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

test('추가: 놓친 추가를 알린 안내는 다음 일을 시작하면 지운다', async () => {
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

  await open('이영희 수정', '학부모 수정')

  expect(statuses()).toEqual([])
})
