import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import type { AcademyClass, Campus } from '@/shared/campus'
import { setupDialog } from '@/test/dialog'
import {
  jsonResponse,
  mockApi,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
} from '@/test/mockApi'
import { admin, partner, renderApp, staff } from '@/test/renderApp'
import type { Student, StudentUpdateRequest } from '../api'

setupMockApi()
setupDialog()

afterEach(() => {
  vi.restoreAllMocks()
})

const DETAIL_PATH = '/desk/students/1'
const PATH = '/desk/students/1/edit'
const DETAIL = 'GET /api/v1/students/1'
const UPDATE = 'PUT /api/v1/students/1'

const campuses: Campus[] = [
  { id: 1, name: '동탄관' },
  { id: 2, name: '능동관' },
]
const classes: AcademyClass[] = [
  { id: 10, campusId: 1, name: '중1 정규' },
  { id: 11, campusId: 1, name: '중2 정규' },
  { id: 20, campusId: 2, name: '고1 특강' },
]

// 전화번호는 서버가 가운데를 가려서 준다.
const doyun: Student = {
  id: 1,
  campusId: 1,
  classId: 10,
  name: '김도윤',
  grade: 'MIDDLE_1',
  school: '동탄중',
  phone: '010-****-0000',
  status: 'ENROLLED',
  registeredAt: '2026-09-01',
  guardians: [
    { id: 7, relation: 'MOTHER', name: '이영희', phone: '010-****-5678', linkedToExisting: false },
  ],
  primaryContact: { name: '이영희', relation: 'MOTHER', phone: '010-****-5678' },
  siblings: [],
}

function mockLookups() {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/classes': () => jsonResponse(classes),
  })
}

function mockDetail(student: Student = doyun) {
  mockLookups()
  mockApi({ [DETAIL]: () => jsonResponse(student) })
}

/** 수정 요청에 받은 내용을 반영한 학생으로 답한다. 번호를 보냈으면 가려서 돌려준다. */
function mockUpdate(student: Student = doyun) {
  mockApi({
    [UPDATE]: ({ body }) => {
      const request = body as StudentUpdateRequest
      return jsonResponse({
        ...student,
        campusId: request.campusId,
        classId: request.classId ?? null,
        name: request.name,
        grade: request.grade,
        school: request.school ?? null,
        status: request.status,
        registeredAt: request.registeredAt,
        phone: request.phone ? `010-****-${request.phone.slice(-4)}` : student.phone,
      })
    },
  })
}

function form() {
  return screen.getByRole('group', { name: '학생' })
}

function field(label: string) {
  return within(form()).getByLabelText(label)
}

async function type(label: string, value: string) {
  await userEvent.clear(field(label))
  if (value) await userEvent.type(field(label), value)
}

function select(label: string, option: string) {
  return userEvent.selectOptions(field(label), option)
}

/** 폼이 뜨고 지점·반 선택지까지 채워지기를 기다린다. */
async function ready() {
  await screen.findByRole('heading', { level: 1, name: '학생 정보 수정' })
  await screen.findByRole('option', { name: '능동관' })
  await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled())
}

function save() {
  return userEvent.click(screen.getByRole('button', { name: '저장' }))
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

// ── 들어가기 ─────────────────────────────────────────────

test('지금 값이 채워져 있고, 번호 칸은 비어 있다', async () => {
  mockDetail()
  renderApp(PATH, { me: staff })
  await ready()

  expect(field('이름')).toHaveValue('김도윤')
  expect(field('학년')).toHaveDisplayValue('중1')
  expect(field('지점')).toHaveDisplayValue('동탄관')
  expect(field('반')).toHaveDisplayValue('중1 정규')
  expect(field('학교')).toHaveValue('동탄중')
  expect(field('등록일')).toHaveValue('2026-09-01')
  expect(field('상태')).toHaveDisplayValue('재원')
  // 서버가 준 번호는 가려져 있어 다시 보낼 수 없다. 칸은 비워 두고 지금 번호는 도움말로만 알린다.
  expect(field('학생 휴대전화')).toHaveValue('')
  expect(field('학생 휴대전화')).toHaveAccessibleDescription(
    '바꿀 때만 입력하세요. 지금 번호: 010-****-0000',
  )
})

test('상세의 정보 수정으로 들어오면 학생을 새로 받아 그 값으로 채운다', async () => {
  mockDetail()
  const { router } = renderApp(DETAIL_PATH, { me: staff })
  const link = await screen.findByRole('link', { name: '정보 수정' })
  // 상세를 띄워 둔 사이에 다른 직원이 반과 상태를 바꿨다.
  mockApi({ [DETAIL]: () => jsonResponse({ ...doyun, classId: 11, status: 'WITHDRAWN' }) })

  await userEvent.click(link)

  await ready()
  expect(router.state.location.pathname).toBe(PATH)
  // 받아 둔 값으로 채우면, 다른 칸만 고쳐 저장해도 그 직원이 바꾼 것이 되돌아간다.
  expect(field('반')).toHaveDisplayValue('중2 정규')
  expect(field('상태')).toHaveDisplayValue('퇴원')
  expect(count(DETAIL)).toBe(2)
})

test('새로 받지 못하면 받아 둔 값으로 채우되, 이전 내용일 수 있다고 알린다', async () => {
  mockDetail()
  renderApp(DETAIL_PATH, { me: staff })
  const link = await screen.findByRole('link', { name: '정보 수정' })
  // 다시 시도하지 않는 오류로 답한다.
  mockApi({ [DETAIL]: () => problemResponse(403, {}) })

  await userEvent.click(link)

  await ready()
  expect(screen.getByRole('alert')).toHaveTextContent(
    '최신 내용을 확인하지 못했어요. 아래는 이전 내용일 수 있고, 저장하면 이 내용으로 바뀌어요.',
  )
  expect(field('이름')).toHaveValue('김도윤')
})

test('본인 번호가 없는 학생은 번호 칸의 도움말이 다르다', async () => {
  mockDetail({ ...doyun, phone: null })
  renderApp(PATH, { me: staff })
  await ready()

  expect(field('학생 휴대전화')).toHaveAccessibleDescription('없으면 비워 두세요.')
})

test('없는 학생이면 알린다', async () => {
  mockLookups()
  mockApi({
    [DETAIL]: () =>
      problemResponse(404, { detail: '없는 학생입니다.', code: 'MEMBER_STUDENT_NOT_FOUND' }),
  })
  renderApp(PATH, { me: staff })

  expect(await screen.findByRole('heading', { level: 1, name: '없는 학생이에요' })).toBeVisible()
})

test('연계 학원은 이 화면을 볼 수 없다', async () => {
  renderApp(PATH, { me: partner })

  expect(
    await screen.findByRole('heading', { name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expect(requests()).toEqual([])
})

// ── 저장 ─────────────────────────────────────────────────

test('고쳐서 저장하면 전화번호를 뺀 값을 통째로 보내고, 상세로 돌아가 고친 값을 보여준다', async () => {
  mockDetail()
  mockUpdate()
  const { router } = renderApp(PATH, { me: staff })
  await ready()
  await type('이름', '김도현')
  await select('학년', '중2')
  await select('반', '중2 정규')
  await type('학교', '동탄제일중')
  await type('등록일', '2026-08-15')

  await save()

  expect(await screen.findByRole('heading', { level: 1, name: '김도현' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe(DETAIL_PATH)
  expect(requestOf(UPDATE).body).toEqual({
    campusId: 1,
    classId: 11,
    name: '김도현',
    school: '동탄제일중',
    grade: 'MIDDLE_2',
    registeredAt: '2026-08-15',
    status: 'ENROLLED',
  })
  expect(screen.getByText('동탄제일중')).toBeInTheDocument()
  // 응답으로 받은 학생을 그대로 보여준다. 상세를 다시 묻지 않는다.
  expect(count(DETAIL)).toBe(1)
  expect(count(UPDATE)).toBe(1)
})

test('아무것도 고치지 않고 저장해도 지금 값을 그대로 보내고, 가린 번호는 보내지 않는다', async () => {
  mockDetail()
  mockUpdate()
  renderApp(PATH, { me: staff })
  await ready()

  await save()

  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  // 반과 학교는 보내지 않으면 비워진다. 지금 값이 실려야 한다.
  expect(requestOf(UPDATE).body).toEqual({
    campusId: 1,
    classId: 10,
    name: '김도윤',
    school: '동탄중',
    grade: 'MIDDLE_1',
    registeredAt: '2026-09-01',
    status: 'ENROLLED',
  })
  // 가린 번호를 다시 보내면 서버가 거부한다.
  expect(JSON.stringify(requestOf(UPDATE).body)).not.toContain('****')
})

test('번호를 새로 입력하면 그 번호를 보낸다', async () => {
  mockDetail()
  mockUpdate()
  renderApp(PATH, { me: staff })
  await ready()
  await type('학생 휴대전화', ' 010-7777-1234 ')

  await save()

  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  expect(requestOf(UPDATE).body).toMatchObject({ phone: '010-7777-1234' })
  // 상세에는 서버가 가려서 준 번호가 보인다.
  expect(screen.getByText('010-****-1234')).toBeInTheDocument()
  expect(document.body).not.toHaveTextContent('7777')
})

test.each(['031-123-4567', '010-1234', '010-****-0000'])(
  '새 번호가 휴대전화 형식이 아니면(%s) 그 칸에 알리고 보내지 않는다',
  async (phone) => {
    mockDetail()
    renderApp(PATH, { me: staff })
    await ready()
    await type('학생 휴대전화', phone)

    await save()

    expect(field('학생 휴대전화')).toHaveAccessibleDescription(
      '휴대전화 번호 형식이 아니에요. 예: 010-1234-5678',
    )
    expect(count(UPDATE)).toBe(0)
  },
)

test('반과 학교를 비우면 빈 값이 아니라 아예 보내지 않는다', async () => {
  mockDetail()
  mockUpdate()
  renderApp(PATH, { me: staff })
  await ready()
  await select('반', '정하지 않음')
  await type('학교', '')

  await save()

  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  expect(requestOf(UPDATE).body).toEqual({
    campusId: 1,
    name: '김도윤',
    grade: 'MIDDLE_1',
    registeredAt: '2026-09-01',
    status: 'ENROLLED',
  })
})

test('상태를 퇴원으로 바꿔 저장한다', async () => {
  mockDetail()
  mockUpdate()
  renderApp(PATH, { me: staff })
  await ready()
  await select('상태', '퇴원')

  await save()

  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  expect(requestOf(UPDATE).body).toMatchObject({ status: 'WITHDRAWN' })
  expect(screen.getByText('퇴원')).toBeInTheDocument()
})

test('지점을 바꾸면 골라 둔 반을 비우고, 그 지점의 반만 고를 수 있다', async () => {
  mockDetail()
  mockUpdate()
  renderApp(PATH, { me: admin })
  await ready()

  await select('지점', '능동관')

  expect(field('반')).toHaveDisplayValue('정하지 않음')
  expect(
    within(field('반'))
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual(['정하지 않음', '고1 특강'])
  await save()
  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  expect(requestOf(UPDATE).body).toMatchObject({ campusId: 2 })
  expect(requestOf(UPDATE).body).not.toHaveProperty('classId')
})

test('목록에 없는 반에 속한 학생은 지금 반이 선택지로 보이고, 다른 칸만 고치면 그대로 보낸다', async () => {
  // 반 목록에는 운영 중인 반만 온다. 99는 꺼진 반이다.
  mockDetail({ ...doyun, classId: 99 })
  mockUpdate({ ...doyun, classId: 99 })
  renderApp(PATH, { me: staff })
  await ready()

  expect(field('반')).toHaveDisplayValue('지금 반 (목록에 없는 반)')
  await type('학교', '동탄제일중')
  await save()

  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  expect(requestOf(UPDATE).body).toMatchObject({ classId: 99, school: '동탄제일중' })
})

test('이름, 학년을 비우면 칸마다 알리고 보내지 않는다', async () => {
  mockDetail()
  renderApp(PATH, { me: staff })
  await ready()
  await type('이름', ' ')
  await select('학년', '골라 주세요')

  await save()

  expect(field('이름')).toHaveAccessibleDescription('이름을 입력해 주세요.')
  expect(field('학년')).toHaveAccessibleDescription('학년을 골라 주세요.')
  expect(count(UPDATE)).toBe(0)
})

test('저장하는 동안에는 다시 누르거나 고칠 수 없다', async () => {
  mockDetail()
  mockApi({ [UPDATE]: () => new Promise<Response>(() => {}) })
  renderApp(PATH, { me: staff })
  await ready()

  await userEvent.dblClick(screen.getByRole('button', { name: '저장' }))

  expect(await screen.findByRole('button', { name: '저장하는 중' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '취소' })).toBeDisabled()
  expect(field('이름')).toBeDisabled()
  expect(count(UPDATE)).toBe(1)
})

test('새 번호를 주소, 콘솔, 캐시에 남기지 않는다', async () => {
  const logs = ['log', 'info', 'warn', 'error', 'debug'].map((method) =>
    vi.spyOn(console, method as 'log').mockImplementation(() => {}),
  )
  mockDetail()
  mockUpdate()
  const { router, queryClient } = renderApp(PATH, { me: staff })
  await ready()
  await type('학생 휴대전화', '010-7777-1234')

  await save()
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  const leaked = (text: string) => ['7777-1234', '77771234'].some((digits) => text.includes(digits))
  expect(leaked(JSON.stringify(router.state.location))).toBe(false)
  const logged = logs.flatMap((log) => log.mock.calls.flat()).map((arg: unknown) => String(arg))
  expect(leaked(JSON.stringify(logged))).toBe(false)
  expect(leaked(JSON.stringify({ ...localStorage, ...sessionStorage }))).toBe(false)
  // 요청 본문은 mutation 캐시에 들어 있다. 저장하고 화면을 떠나면 남기지 않는다.
  await waitFor(() => expect(queryClient.getMutationCache().getAll()).toEqual([]))
  const cached = JSON.stringify(
    queryClient
      .getQueryCache()
      .getAll()
      .map((query) => [query.queryKey, query.state.data]),
  )
  expect(leaked(cached)).toBe(false)
  expect(requests().some((key) => leaked(key))).toBe(false)
})

// ── 서버가 거부할 때 ─────────────────────────────────────

test.each([
  [
    'MEMBER_INVALID_CLASS',
    '고를 수 없는 반입니다. 학생의 지점에서 운영 중인 반이어야 합니다.',
    '반',
  ],
  ['MEMBER_INVALID_CAMPUS', '없는 지점입니다.', '지점'],
])('%s는 해당 칸에 서버 문구를 보여준다', async (code, detail, label) => {
  mockDetail()
  mockApi({ [UPDATE]: () => problemResponse(400, { detail, code }) })
  const { router } = renderApp(PATH, { me: staff })
  await ready()
  await type('학교', '동탄제일중')

  await save()

  await waitFor(() => expect(field(label)).toHaveAccessibleDescription(detail))
  // 화면에 남아 고친 값을 다시 보낼 수 있다.
  expect(router.state.location.pathname).toBe(PATH)
  expect(field('학교')).toHaveValue('동탄제일중')
  expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
})

test('서버가 칸을 짚어 거부하면 그 칸에 문구를 보여준다', async () => {
  mockDetail()
  mockApi({
    [UPDATE]: () =>
      problemResponse(400, {
        detail: '입력값이 올바르지 않습니다.',
        code: 'COMMON_VALIDATION_FAILED',
        errors: [{ field: 'school', message: '크기가 0에서 50 사이여야 합니다' }],
      }),
  })
  renderApp(PATH, { me: staff })
  await ready()

  await save()

  await waitFor(() =>
    expect(field('학교')).toHaveAccessibleDescription('크기가 0에서 50 사이여야 합니다'),
  )
})

test('응답을 받지 못하면 다시 저장해도 된다고 알리고, 상세를 다시 받되 입력은 그대로 둔다', async () => {
  mockDetail()
  mockApi({
    [UPDATE]: () => {
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: staff })
  await ready()
  await type('학교', '동탄제일중')

  await save()

  // 수정은 같은 값을 다시 보내도 결과가 같다. 등록처럼 목록을 확인하라고 하지 않는다.
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('저장됐는지 확인하지 못했어요. 그대로 다시 저장해도 돼요.')
  expect(alert).not.toHaveTextContent('목록을 먼저 확인')
  // 알아서 다시 보내지 않는다.
  expect(count(UPDATE)).toBe(1)
  // 저장됐을 수 있으니 상세는 다시 받는다. 다시 받은 값이 고치던 입력을 덮지 않는다.
  await waitFor(() => expect(count(DETAIL)).toBe(2))
  expect(field('학교')).toHaveValue('동탄제일중')
})

test('지점·반 목록을 받지 못하면 알리고 저장을 막는다', async () => {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    // 다시 시도하지 않는 오류로 답한다.
    'GET /api/v1/classes': () => problemResponse(403, {}),
    [DETAIL]: () => jsonResponse(doyun),
  })
  renderApp(PATH, { me: staff })

  // 반 선택지가 비어 있는 채로 저장하면 지금 반이 화면에 보이지 않은 채 보내진다.
  expect(await screen.findByRole('alert')).toHaveTextContent('지점·반 목록을 불러오지 못했어요.')
  expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
})

// ── 취소 ─────────────────────────────────────────────────

test('고치지 않고 취소하면 바로 상세로 돌아간다', async () => {
  mockDetail()
  const { router } = renderApp(PATH, { me: staff })
  await ready()

  await userEvent.click(screen.getByRole('button', { name: '취소' }))

  await waitFor(() => expect(router.state.location.pathname).toBe(DETAIL_PATH))
  expect(count(UPDATE)).toBe(0)
})

test('고친 내용이 있으면 취소할 때 한 번 묻는다', async () => {
  mockDetail()
  const { router } = renderApp(PATH, { me: staff })
  await ready()
  await type('학교', '동탄제일중')

  await userEvent.click(screen.getByRole('button', { name: '취소' }))
  const dialog = await screen.findByRole('dialog', { name: '고친 내용을 버릴까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '계속 고치기' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(router.state.location.pathname).toBe(PATH)
  expect(field('학교')).toHaveValue('동탄제일중')

  await userEvent.click(screen.getByRole('button', { name: '취소' }))
  await userEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: '버리고 나가기' }),
  )
  await waitFor(() => expect(router.state.location.pathname).toBe(DETAIL_PATH))
  // 상세에는 고치기 전 값이 그대로다.
  expect(await screen.findByText('동탄중')).toBeInTheDocument()
  expect(count(UPDATE)).toBe(0)
})

// ── 코드 리뷰에서 나온 경우 ──────────────────────────────

test.each(['0026-10-12', '1999-12-31'])(
  '등록일의 연도가 맞지 않으면(%s) 그 칸에 알리고 보내지 않는다',
  async (date) => {
    mockDetail()
    renderApp(PATH, { me: staff })
    await ready()
    // 날짜 칸은 연도를 치다 만 값도 값으로 준다. 서버는 그대로 받고, 상세 화면은 그 날짜를 읽지 못한다.
    await type('등록일', date)

    await save()

    expect(field('등록일')).toHaveAccessibleDescription('등록일의 연도를 확인해 주세요.')
    expect(count(UPDATE)).toBe(0)
  },
)

test('지점을 바꿨다 되돌리면 목록에 없는 지금 반을 다시 고를 수 있다', async () => {
  mockDetail({ ...doyun, classId: 99 })
  renderApp(PATH, { me: staff })
  await ready()
  const options = () =>
    within(field('반'))
      .getAllByRole('option')
      .map((option) => option.textContent)

  // 다른 지점에서는 지금 반을 고를 수 없다(서버가 거부한다).
  await select('지점', '능동관')
  expect(options()).toEqual(['정하지 않음', '고1 특강'])

  await select('지점', '동탄관')
  expect(options()).toEqual(['정하지 않음', '지금 반 (목록에 없는 반)', '중1 정규', '중2 정규'])
  // 지점을 바꾸며 비운 반이 저절로 돌아오지는 않는다. 보이는 값과 보내는 값이 같다.
  expect(field('반')).toHaveDisplayValue('정하지 않음')
})

test('저장하면 목록과 다른 학생의 상세를 다시 받게 한다', async () => {
  mockDetail()
  mockUpdate()
  mockApi({
    'GET /api/v1/students': () =>
      jsonResponse({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
    'GET /api/v1/students/2': () => jsonResponse({ ...doyun, id: 2, name: '김서연' }),
  })
  // 목록과 형제의 상세를 본 뒤에 수정한다. 둘 다 이 학생의 이름과 상태를 보여준다.
  const { router, queryClient } = renderApp('/desk/students', { me: staff })
  await screen.findByRole('heading', { level: 1, name: '학생' })
  await router.navigate('/desk/students/2')
  await screen.findByRole('heading', { level: 1, name: '김서연' })
  await router.navigate(PATH)
  await ready()
  await type('이름', '김도현')

  await save()

  await screen.findByRole('heading', { level: 1, name: '김도현' })
  const invalidated = (key: unknown[]) =>
    queryClient
      .getQueryCache()
      .findAll({ queryKey: key })
      .map((query) => query.state.isInvalidated)
  await waitFor(() => expect(invalidated(['students', 'list'])).toEqual([true]))
  expect(invalidated(['students', 'detail', 2])).toEqual([true])
  // 이 학생의 상세는 응답으로 받은 값이라 다시 받지 않는다.
  expect(invalidated(['students', 'detail', 1])).toEqual([false])
})

test.each([
  ['다른 사람이 로그인했으면', staff],
  ['로그아웃했으면', null],
])('응답을 기다리는 사이에 %s 받은 학생을 캐시에 넣지 않는다', async (_case, nextUser) => {
  let respond!: () => void
  mockDetail()
  mockApi({
    [UPDATE]: () =>
      new Promise<Response>((resolve) => {
        respond = () => resolve(jsonResponse({ ...doyun, name: '김도현' }))
      }),
  })
  // 고친 뒤의 상세 조회도 고친 값으로 답한다.
  const { queryClient } = renderApp(PATH, { me: admin })
  await ready()
  await type('이름', '김도현')
  await save()
  await screen.findByRole('button', { name: '저장하는 중' })

  // 같은 기기에서 앞사람이 나가고 다음 사람이 들어왔다.
  queryClient.setQueryData(['auth', 'me'], nextUser)
  respond()
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))

  // 앞사람이 고친 학생 자료가 다음 사람의 캐시에 새로 들어가면 안 된다.
  expect(queryClient.getQueryData<Student>(['students', 'detail', 1])?.name).not.toBe('김도현')
})

// ── 요청 번호 ─────────────────────────────────────────────

test('저장 중 서버 오류가 나면 폼의 안내 아래에 문의할 때 쓸 요청 번호를 보여준다', async () => {
  mockDetail()
  mockApi({
    [UPDATE]: () =>
      problemResponse(500, { detail: '서버 오류', requestId: '2d6a6e90a9d04a16bb607aa43840f2d7' }),
  })
  renderApp(PATH, { me: staff })
  await ready()
  await type('학교', '동탄제일중')

  await save()

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('그대로 다시 저장해도 돼요.')
  expect(alert).toHaveTextContent(
    '문의할 때 이 번호를 알려 주세요: 2d6a6e90a9d04a16bb607aa43840f2d7',
  )
})
