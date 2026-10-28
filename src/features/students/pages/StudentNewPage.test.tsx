import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import type { AcademyClass, Campus } from '@/shared/campus'
import { todayInSeoul } from '@/shared/lib'
import { setupDialog } from '@/test/dialog'
import { loseFocus } from '@/test/focus'
import {
  jsonResponse,
  mockApi,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
  tooManyRequests,
  unauthenticated,
  unreadableResponse,
} from '@/test/mockApi'
import { admin, partner, renderApp, staff } from '@/test/renderApp'
import type { Student, StudentCreateRequest } from '../api'

setupMockApi()
setupDialog()

afterEach(() => {
  vi.restoreAllMocks()
  // 날짜를 과거로 고정한 테스트가 있다. 화면을 먼저 치워야 진짜 날짜로 돌아가는 순간
  // 로그인 정보가 묵은 것으로 보여 GET /auth/me를 다시 보내지 않는다(#186, src/test/fakeDate.ts).
  cleanup()
  vi.useRealTimers()
})

const PATH = '/desk/students/new'
const LIST = '/desk/students'
const REGISTER = 'POST /api/v1/students'

const campuses: Campus[] = [
  { id: 1, name: '동탄관' },
  { id: 2, name: '능동관' },
]
const classes: AcademyClass[] = [
  { id: 10, campusId: 1, name: '중1 정규' },
  { id: 11, campusId: 1, name: '중2 정규' },
  { id: 20, campusId: 2, name: '고1 특강' },
]

// 화면에 넣는 번호. 가짜 번호다.
const MOTHER_PHONE = '010-1234-5678'
const FATHER_PHONE = '010-9876-5432'
const STUDENT_PHONE = '010-5555-0000'

/** 서버가 돌려주는 등록 결과. 전화번호는 가운데를 가려서 준다. */
function registered(body: StudentCreateRequest, overrides: Partial<Student> = {}): Student {
  const guardians = (body.guardians ?? []).map((guardian, index) => ({
    id: 100 + index,
    name: guardian.name,
    relation: guardian.relation,
    phone: `010-****-${guardian.phone.slice(-4)}`,
    linkedToExisting: false,
  }))
  return {
    id: 1,
    campusId: body.campusId,
    // 없는 값은 빠지지 않고 null로 온다.
    classId: body.classId ?? null,
    name: body.name,
    grade: body.grade,
    school: body.school ?? null,
    phone: body.phone ? `010-****-${body.phone.slice(-4)}` : null,
    status: 'ENROLLED',
    registeredAt: body.registeredAt ?? todayInSeoul(),
    guardians,
    primaryContact: { name: body.name, relation: null, phone: '010-****-0000' },
    siblings: [],
    ...overrides,
  }
}

function emptyPage() {
  return jsonResponse({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 })
}

/** 지점·반 조회와 목록 화면의 조회를 흉내 낸다. */
function mockLookups() {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/classes': () => jsonResponse(classes),
    'POST /api/v1/students/search': emptyPage,
  })
}

/** 등록 요청에 받은 내용 그대로 성공으로 답한다. */
function mockRegister(overrides: (body: StudentCreateRequest) => Partial<Student> = () => ({})) {
  mockApi({
    [REGISTER]: ({ body }) => {
      const request = body as StudentCreateRequest
      return jsonResponse(registered(request, overrides(request)), 201)
    },
  })
}

function student() {
  return screen.getByRole('group', { name: '학생' })
}

function guardian(order: number) {
  return screen.getByRole('group', { name: `학부모 ${order}` })
}

async function type(group: HTMLElement, label: string, value: string) {
  const input = within(group).getByLabelText(label)
  await userEvent.clear(input)
  if (value) await userEvent.type(input, value)
}

function select(group: HTMLElement, label: string, option: string) {
  return userEvent.selectOptions(within(group).getByLabelText(label), option)
}

/** 등록에 꼭 필요한 칸을 채운다: 이름, 학년, 지점, 학부모 1(어머니). */
async function fillRequired() {
  await screen.findByRole('option', { name: '능동관' })
  await type(student(), '이름', '김도윤')
  await select(student(), '학년', '중1')
  await select(student(), '지점', '동탄관')
  await type(guardian(1), '이름', '이영희')
  await type(guardian(1), '휴대전화', MOTHER_PHONE)
}

function submit() {
  return userEvent.click(screen.getByRole('button', { name: '등록' }))
}

/** 등록 결과 안내(상세나 목록 화면). 로딩 문구도 role="status"라 문구로 찾는다. */
async function findNotice() {
  const text = await screen.findByText(/학생을 등록했어요/)
  return text.closest<HTMLElement>('[role="status"]')!
}

/** 기존 학부모에 연결했다는 안내. 등록했다는 안내와 따로, 확인을 청하는 색으로 뜬다. */
async function findLinkedNotice() {
  const [text] = await screen.findAllByText(/이미 등록된 학부모/)
  return text.closest<HTMLElement>('[role="status"]')!
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

function descriptionOf(group: HTMLElement, label: string) {
  return within(group).getByLabelText(label)
}

// ── 들어가기 ─────────────────────────────────────────────

test('목록의 학생 등록 버튼으로 들어오고, 직원은 자기 지점이 골라져 있다', async () => {
  mockLookups()
  const { router } = renderApp(LIST, { me: staff })

  await userEvent.click(await screen.findByRole('link', { name: '학생 등록' }))

  expect(await screen.findByRole('heading', { level: 1, name: '학생 등록' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe(PATH)
  // 직원(동탄관)은 자기 지점이 골라져 있지만 다른 지점으로 바꿀 수 있다.
  await screen.findByRole('option', { name: '능동관' })
  expect(within(student()).getByLabelText('지점')).toHaveDisplayValue('동탄관')
  expect(within(student()).getByLabelText('지점')).toBeEnabled()
  // 등록일은 오늘, 학부모는 어머니 한 줄이 열려 있다.
  expect(within(student()).getByLabelText('등록일')).toHaveValue(todayInSeoul())
  expect(within(guardian(1)).getByLabelText('관계')).toHaveDisplayValue('어머니')
  // 학생 탭이 선택된 채로 남는다.
  expect(screen.getByRole('link', { name: '학생' })).toHaveAttribute('aria-current', 'page')
})

test('관리자는 지점이 골라져 있지 않아 직접 골라야 한다', async () => {
  mockLookups()
  renderApp(PATH, { me: admin })
  await screen.findByRole('option', { name: '능동관' })

  expect(within(student()).getByLabelText('지점')).toHaveDisplayValue('골라 주세요')
})

test('연계 학원은 이 화면을 볼 수 없다', async () => {
  renderApp(PATH, { me: partner })

  expect(
    await screen.findByRole('heading', { name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expect(requests()).toEqual([])
})

// ── 등록 ─────────────────────────────────────────────────

test('모든 칸을 채워 등록하면 입력한 값을 보내고, 그 학생의 상세로 가서 등록했다고 알린다', async () => {
  mockLookups()
  mockRegister()
  const { router } = renderApp(PATH, { me: admin })
  await fillRequired()
  await select(student(), '반', '중2 정규')
  await type(student(), '학교', '동탄중')
  await type(student(), '등록일', '2026-09-01')
  await type(student(), '학생 휴대전화', STUDENT_PHONE)
  await userEvent.click(screen.getByRole('button', { name: '학부모 추가' }))
  await type(guardian(2), '이름', '김철수')
  await type(guardian(2), '휴대전화', FATHER_PHONE)

  await submit()

  expect(await findNotice()).toHaveTextContent('김도윤 학생을 등록했어요.')
  // 서버가 준 학생 id의 상세다. 응답을 그대로 보여주므로 상세를 다시 묻지 않는다.
  expect(router.state.location.pathname).toBe(`${LIST}/1`)
  expect(screen.getByRole('heading', { level: 1, name: '김도윤' })).toBeInTheDocument()
  expect(requests()).not.toContain(`GET /api/v1/students/1`)
  expect(requestOf(REGISTER).body).toEqual({
    campusId: 1,
    classId: 11,
    name: '김도윤',
    school: '동탄중',
    grade: 'MIDDLE_1',
    registeredAt: '2026-09-01',
    phone: STUDENT_PHONE,
    guardians: [
      { relation: 'MOTHER', name: '이영희', phone: MOTHER_PHONE },
      // 추가한 줄은 아버지로 시작한다.
      { relation: 'FATHER', name: '김철수', phone: FATHER_PHONE },
    ],
  })
  expect(count(REGISTER)).toBe(1)
})

test('비워 둔 반·학교·학생 번호는 빈 값이 아니라 아예 보내지 않는다', async () => {
  mockLookups()
  mockRegister()
  renderApp(PATH, { me: admin })
  await fillRequired()

  await submit()

  await findNotice()
  // 빈 문자열을 보내면 서버가 형식 오류로 거부한다(전화번호).
  expect(requestOf(REGISTER).body).toEqual({
    campusId: 1,
    name: '김도윤',
    grade: 'MIDDLE_1',
    registeredAt: todayInSeoul(),
    guardians: [{ relation: 'MOTHER', name: '이영희', phone: MOTHER_PHONE }],
  })
})

test('학부모 없이 학생 번호만으로도 등록할 수 있다', async () => {
  mockLookups()
  mockRegister()
  renderApp(PATH, { me: admin })
  await fillRequired()
  await type(student(), '학생 휴대전화', STUDENT_PHONE)

  await userEvent.click(screen.getByRole('button', { name: '학부모 1 지우기' }))
  await submit()

  await findNotice()
  expect(requestOf(REGISTER).body).toMatchObject({ phone: STUDENT_PHONE, guardians: [] })
})

test('같은 번호의 학부모가 이미 있어 그 학부모에 연결됐으면, 저장돼 있던 이름과 가린 번호로 알린다', async () => {
  mockLookups()
  // 서버는 새로 만들지 않고 기존 학부모에 연결한다. 이름은 입력한 것이 아니라 저장돼 있던 것이다.
  mockRegister((body) => ({
    guardians: [
      {
        id: 7,
        relation: body.guardians![0].relation,
        name: '박다른',
        phone: '010-****-5678',
        linkedToExisting: true,
      },
    ],
  }))
  renderApp(PATH, { me: admin })
  await fillRequired()

  await submit()

  expect(await findNotice()).toHaveTextContent('김도윤 학생을 등록했어요.')
  // 번호를 잘못 넣어 남의 학부모에 붙였는지 등록 직후에 알아챌 수 있어야 한다.
  // 끝난 일이 아니라 확인할 일이라 등록 안내와 다른 색의 안내로 뜬다.
  const notice = await findLinkedNotice()
  expect(notice).not.toBe(await findNotice())
  expect(notice).toHaveClass('bg-warn-bg')
  expect(notice).toHaveTextContent(
    '어머니는 이미 등록된 학부모(박다른, 010-****-5678)에 연결했어요. 다른 사람이라면 번호를 확인해 주세요.',
  )
  // 입력한 번호 원문은 안내에 나오지 않는다.
  expect(document.body).not.toHaveTextContent('1234')

  // 닫기는 하나이고, 누르면 두 안내가 함께 사라진다.
  expect(screen.getAllByRole('button', { name: '닫기' })).toHaveLength(1)
  await userEvent.click(within(notice).getByRole('button', { name: '닫기' }))
  expect(screen.queryByText(/학생을 등록했어요/)).not.toBeInTheDocument()
  expect(screen.queryByText(/이미 등록된 학부모/)).not.toBeInTheDocument()
})

test('새로 만든 학부모는 연결 안내를 보여주지 않는다', async () => {
  mockLookups()
  mockRegister()
  renderApp(PATH, { me: admin })
  await fillRequired()

  await submit()

  const notice = await findNotice()
  expect(notice).not.toHaveTextContent('이미 등록된 학부모')
  expect(screen.queryByText(/이미 등록된 학부모/)).not.toBeInTheDocument()

  // 연결 안내가 없으면 닫기는 등록 안내에 있다.
  await userEvent.click(within(notice).getByRole('button', { name: '닫기' }))
  expect(screen.queryByText(/학생을 등록했어요/)).not.toBeInTheDocument()
})

test('등록 안내는 한 번만 보여준다', async () => {
  mockLookups()
  mockRegister()
  const { router } = renderApp(PATH, { me: admin })
  await fillRequired()
  await submit()
  await findNotice()

  // 목록에 가도, 상세로 돌아와도 다시 뜨지 않는다.
  await router.navigate(LIST)
  await screen.findByRole('heading', { level: 1, name: '학생' })
  expect(screen.queryByText(/학생을 등록했어요/)).not.toBeInTheDocument()
  await router.navigate(`${LIST}/1`)
  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  expect(screen.queryByText(/학생을 등록했어요/)).not.toBeInTheDocument()
})

test('입력한 전화번호를 주소, 화면 이동 기록, 콘솔, 캐시에 남기지 않는다', async () => {
  const logs = ['log', 'info', 'warn', 'error', 'debug'].map((method) =>
    vi.spyOn(console, method as 'log').mockImplementation(() => {}),
  )
  mockLookups()
  mockRegister()
  const { router, queryClient } = renderApp(PATH, { me: admin })
  await fillRequired()
  await type(student(), '학생 휴대전화', STUDENT_PHONE)

  await submit()
  await findNotice()

  const leaked = (text: string) =>
    ['1234-5678', '12345678', '5555-0000', '55550000'].some((digits) => text.includes(digits))
  expect(leaked(JSON.stringify(router.state.location))).toBe(false)
  // Error는 JSON으로 바꾸면 빈 객체가 된다. 문구까지 풀어서 본다.
  const logged = logs.flatMap((log) => log.mock.calls.flat()).map((arg: unknown) => String(arg))
  expect(leaked(JSON.stringify(logged))).toBe(false)
  expect(leaked(JSON.stringify({ ...localStorage, ...sessionStorage }))).toBe(false)
  // 요청 본문은 mutation 캐시에 들어 있다. 등록에 성공해 화면을 떠나면 남기지 않는다.
  await waitFor(() => expect(queryClient.getMutationCache().getAll()).toEqual([]))
  const cached = JSON.stringify([
    queryClient
      .getQueryCache()
      .getAll()
      .map((query) => [query.queryKey, query.state.data]),
    queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.state.variables),
  ])
  expect(leaked(cached)).toBe(false)
  // 전화번호는 요청 본문으로만 나간다.
  expect(requests().some((key) => leaked(key))).toBe(false)
})

// ── 보내기 전 확인 ───────────────────────────────────────

test('이름, 학년, 지점, 학부모 이름과 번호를 비우면 칸마다 알리고 보내지 않는다', async () => {
  mockLookups()
  renderApp(PATH, { me: admin })
  await screen.findByRole('option', { name: '능동관' })

  await submit()

  expect(descriptionOf(student(), '이름')).toHaveAccessibleDescription('이름을 입력해 주세요.')
  expect(descriptionOf(student(), '학년')).toHaveAccessibleDescription('학년을 골라 주세요.')
  expect(descriptionOf(student(), '지점')).toHaveAccessibleDescription('지점을 골라 주세요.')
  expect(descriptionOf(guardian(1), '이름')).toHaveAccessibleDescription('이름을 입력해 주세요.')
  expect(descriptionOf(guardian(1), '휴대전화')).toHaveAccessibleDescription(
    '휴대전화 번호를 입력해 주세요.',
  )
  expect(count(REGISTER)).toBe(0)
})

test.each(['02-123-4567', '010-1234-567', '010-****-5678', '1588-1234', '전화없음'])(
  '학부모 번호가 휴대전화 형식이 아니면(%s) 그 칸에 알리고 보내지 않는다',
  async (phone) => {
    mockLookups()
    renderApp(PATH, { me: admin })
    await fillRequired()
    await type(guardian(1), '휴대전화', phone)

    await submit()

    // 서버는 형식이 틀린 칸을 한 번에 하나만 알려 준다. 화면이 보내기 전에 모든 칸을 짚는다.
    expect(descriptionOf(guardian(1), '휴대전화')).toHaveAccessibleDescription(
      '휴대전화 번호 형식이 아니에요. 예: 010-1234-5678',
    )
    expect(count(REGISTER)).toBe(0)
  },
)

test('학생 번호가 휴대전화 형식이 아니면 그 칸에 알리고 보내지 않는다', async () => {
  mockLookups()
  renderApp(PATH, { me: admin })
  await fillRequired()
  await type(student(), '학생 휴대전화', '031-123-4567')

  await submit()

  expect(descriptionOf(student(), '학생 휴대전화')).toHaveAccessibleDescription(
    '휴대전화 번호 형식이 아니에요. 예: 010-1234-5678',
  )
  expect(count(REGISTER)).toBe(0)
})

test.each(['010 1234 5678', '01012345678', '+82 10-1234-5678', '010.1234.5678'])(
  '서버가 받는 모양의 번호(%s)는 입력한 그대로 보낸다',
  async (phone) => {
    mockLookups()
    mockRegister()
    renderApp(PATH, { me: admin })
    await fillRequired()
    await type(guardian(1), '휴대전화', phone)

    await submit()

    await findNotice()
    expect((requestOf(REGISTER).body as StudentCreateRequest).guardians![0].phone).toBe(phone)
  },
)

test('두 학부모의 번호가 같으면(쓴 모양이 달라도) 뒤의 칸에 알리고 보내지 않는다', async () => {
  mockLookups()
  renderApp(PATH, { me: admin })
  await fillRequired()
  await userEvent.click(screen.getByRole('button', { name: '학부모 추가' }))
  await type(guardian(2), '이름', '김철수')
  await type(guardian(2), '휴대전화', '01012345678')

  await submit()

  expect(descriptionOf(guardian(2), '휴대전화')).toHaveAccessibleDescription(
    '위 학부모와 같은 번호예요.',
  )
  expect(descriptionOf(guardian(1), '휴대전화')).not.toBeInvalid()
  expect(count(REGISTER)).toBe(0)
})

test('학부모도 학생 번호도 없으면 연락처가 필요하다고 알리고 보내지 않는다', async () => {
  mockLookups()
  renderApp(PATH, { me: admin })
  await fillRequired()

  await userEvent.click(screen.getByRole('button', { name: '학부모 1 지우기' }))
  await submit()

  expect(screen.getByRole('alert')).toHaveTextContent(
    '학부모나 학생 본인의 휴대전화 번호가 하나는 있어야 해요.',
  )
  expect(count(REGISTER)).toBe(0)
})

test('학부모는 4명까지 넣을 수 있고, 가운데 줄을 지워도 나머지 입력은 그대로다', async () => {
  mockLookups()
  mockRegister()
  renderApp(PATH, { me: admin })
  await fillRequired()
  for (const [order, name, phone] of [
    [2, '둘째', '010-2222-2222'],
    [3, '셋째', '010-3333-3333'],
    [4, '넷째', '010-4444-4444'],
  ] as const) {
    await userEvent.click(screen.getByRole('button', { name: '학부모 추가' }))
    await type(guardian(order), '이름', name)
    await type(guardian(order), '휴대전화', phone)
  }
  expect(screen.queryByRole('button', { name: '학부모 추가' })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '학부모 2 지우기' }))

  // 지운 줄의 값이 다른 줄로 넘어가거나 뒤섞이지 않는다.
  expect(within(guardian(2)).getByLabelText('이름')).toHaveValue('셋째')
  expect(within(guardian(3)).getByLabelText('이름')).toHaveValue('넷째')
  expect(screen.getByRole('button', { name: '학부모 추가' })).toBeInTheDocument()

  await submit()
  await findNotice()
  expect(
    (requestOf(REGISTER).body as StudentCreateRequest).guardians!.map((item) => item.name),
  ).toEqual(['이영희', '셋째', '넷째'])
})

test('반 선택지는 고른 지점의 반만 보여주고, 지점을 바꾸면 골라 둔 반을 비운다', async () => {
  mockLookups()
  mockRegister()
  renderApp(PATH, { me: admin })
  await fillRequired()
  const classSelect = within(student()).getByLabelText('반')
  expect(
    within(classSelect)
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual(['정하지 않음', '중1 정규', '중2 정규'])
  await select(student(), '반', '중1 정규')

  await select(student(), '지점', '능동관')

  // 동탄관의 반을 고른 채 능동관으로 등록하면 서버가 거부한다.
  expect(classSelect).toHaveDisplayValue('정하지 않음')
  expect(
    within(classSelect)
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual(['정하지 않음', '고1 특강'])
  await submit()
  await findNotice()
  expect(requestOf(REGISTER).body).not.toHaveProperty('classId')
  expect(requestOf(REGISTER).body).toMatchObject({ campusId: 2 })
})

// ── 서버가 거부할 때 ─────────────────────────────────────

test('서버가 칸을 짚어 거부하면 학생 칸과 학부모 줄의 그 칸에 문구를 보여준다', async () => {
  mockLookups()
  mockApi({
    [REGISTER]: () =>
      problemResponse(400, {
        detail: '입력값이 올바르지 않습니다.',
        code: 'COMMON_VALIDATION_FAILED',
        errors: [
          { field: 'school', message: '크기가 0에서 50 사이여야 합니다' },
          { field: 'guardians[1].name', message: '공백일 수 없습니다' },
        ],
      }),
  })
  renderApp(PATH, { me: admin })
  await fillRequired()
  await userEvent.click(screen.getByRole('button', { name: '학부모 추가' }))
  await type(guardian(2), '이름', '김철수')
  await type(guardian(2), '휴대전화', FATHER_PHONE)

  await submit()

  await waitFor(() =>
    expect(descriptionOf(student(), '학교')).toHaveAccessibleDescription(
      '크기가 0에서 50 사이여야 합니다',
    ),
  )
  // 둘째 학부모의 이름 칸이다. 첫째 학부모의 칸에 붙으면 안 된다.
  expect(descriptionOf(guardian(2), '이름')).toHaveAccessibleDescription('공백일 수 없습니다')
  expect(descriptionOf(guardian(1), '이름')).not.toBeInvalid()
  // 입력한 값은 그대로 남아 고쳐서 다시 보낼 수 있다.
  expect(within(student()).getByLabelText('이름')).toHaveValue('김도윤')
  expect(within(guardian(1)).getByLabelText('휴대전화')).toHaveValue(MOTHER_PHONE)
  expect(screen.getByRole('button', { name: '등록' })).toBeEnabled()
})

test.each([
  [
    'MEMBER_INVALID_CLASS',
    '고를 수 없는 반입니다. 학생의 지점에서 운영 중인 반이어야 합니다.',
    '반',
  ],
  ['MEMBER_INVALID_CAMPUS', '없는 지점입니다.', '지점'],
])('%s는 해당 칸에 서버 문구를 보여준다', async (code, detail, label) => {
  mockLookups()
  mockApi({ [REGISTER]: () => problemResponse(400, { detail, code }) })
  renderApp(PATH, { me: admin })
  await fillRequired()

  await submit()

  await waitFor(() => expect(descriptionOf(student(), label)).toHaveAccessibleDescription(detail))
})

test.each([
  [409, 'MEMBER_STUDENT_DUPLICATED', '같은 연락처에 같은 이름의 학생이 이미 있습니다.'],
  [400, 'MEMBER_GUARDIAN_PHONE_REPEATED', '같은 전화번호의 학부모를 두 번 적었습니다.'],
  [400, 'MEMBER_CONTACT_REQUIRED', '학부모나 학생 본인의 전화번호가 하나는 있어야 합니다.'],
  // 본문을 읽지 못했거나 모양이 통째로 틀린 경우다. 값 하나의 형식 오류는 COMMON_VALIDATION_FAILED로 그 칸에 온다.
  [400, 'COMMON_BAD_REQUEST', '요청 형식이 올바르지 않습니다.'],
])('%i %s는 서버 문구를 알리고 화면에 남는다', async (status, code, detail) => {
  mockLookups()
  mockApi({ [REGISTER]: () => problemResponse(status, { detail, code }) })
  const { router } = renderApp(PATH, { me: admin })
  await fillRequired()

  await submit()

  expect(await screen.findByRole('alert')).toHaveTextContent(detail)
  expect(router.state.location.pathname).toBe(PATH)
  expect(within(student()).getByLabelText('이름')).toHaveValue('김도윤')
})

test('응답을 받지 못하면 등록됐을 수 있다고 알리고, 알아서 다시 보내지 않는다', async () => {
  mockLookups()
  mockApi({
    [REGISTER]: () => {
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: admin })
  await fillRequired()

  await submit()

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('연결 상태를 확인해 주세요.')
  expect(alert).toHaveTextContent(
    '저장됐을 수도 있어요. 내용은 그대로 두고 다시 눌러 주세요. 두 번 저장되지 않아요.',
  )
  expect(alert).not.toHaveTextContent('목록을 먼저 확인')
  // 다시 보내는 것은 직원이 누를 때만 한다.
  expect(count(REGISTER)).toBe(1)
})

test('서버 오류가 떠 있는 채로 번호를 잘못 고쳐 다시 누르면 지난 서버 오류는 지운다', async () => {
  mockLookups()
  mockApi({
    [REGISTER]: () =>
      problemResponse(409, {
        detail: '같은 연락처에 같은 이름의 학생이 이미 있습니다.',
        code: 'MEMBER_STUDENT_DUPLICATED',
      }),
  })
  renderApp(PATH, { me: admin })
  await fillRequired()
  await submit()
  await screen.findByRole('alert')

  await type(guardian(1), '휴대전화', '010-1234')
  await submit()

  // 보내지 않은 입력에 지난번 서버 오류가 남아 있으면 서로 다른 말을 하는 안내가 겹친다.
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(descriptionOf(guardian(1), '휴대전화')).toBeInvalid()
  expect(count(REGISTER)).toBe(1)
})

test('등록하는 동안에는 다시 누르거나 고칠 수 없다', async () => {
  let respond!: (response: Response) => void
  mockLookups()
  mockApi({ [REGISTER]: () => new Promise<Response>((resolve) => (respond = resolve)) })
  renderApp(PATH, { me: admin })
  await fillRequired()

  await submit()

  const button = await screen.findByRole('button', { name: '등록하는 중' })
  expect(button).toBeDisabled()
  expect(screen.getByRole('button', { name: '취소' })).toBeDisabled()
  expect(within(student()).getByLabelText('이름')).toBeDisabled()
  await userEvent.click(button)
  expect(count(REGISTER)).toBe(1)

  // 브라우저는 막힌 칸의 포커스를 치운다. 저장이 끝나면 있던 자리(누른 버튼)로 돌아온다.
  loseFocus()
  respond(problemResponse(400, { detail: '없는 지점입니다.', code: 'MEMBER_INVALID_CAMPUS' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '등록' })).toBeEnabled())
  expect(screen.getByRole('button', { name: '등록' })).toHaveFocus()
})

test('등록하는 동안 세션이 끊기면(401) 로그인 화면으로 보낸다', async () => {
  mockLookups()
  mockApi({ [REGISTER]: unauthenticated })
  const { router } = renderApp(PATH, { me: admin })
  await fillRequired()

  await submit()

  expect(await screen.findByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument()
  // 돌아올 주소에 입력한 내용이 실리지 않는다.
  expect(router.state.location.state).toEqual({ from: PATH })
})

// ── 취소 ─────────────────────────────────────────────────

test('아무것도 넣지 않고 취소하면 바로 목록으로 간다', async () => {
  mockLookups()
  const { router } = renderApp(PATH, { me: staff })
  await screen.findByRole('option', { name: '능동관' })

  await userEvent.click(screen.getByRole('button', { name: '취소' }))

  await waitFor(() => expect(router.state.location.pathname).toBe(LIST))
})

test('입력한 내용이 있으면 취소할 때 한 번 묻고, 계속 입력을 고르면 그대로 남는다', async () => {
  mockLookups()
  const { router } = renderApp(PATH, { me: admin })
  await fillRequired()

  await userEvent.click(screen.getByRole('button', { name: '취소' }))
  const dialog = await screen.findByRole('dialog', { name: '입력한 내용을 지울까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '계속 입력' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(router.state.location.pathname).toBe(PATH)
  expect(within(student()).getByLabelText('이름')).toHaveValue('김도윤')
  expect(within(guardian(1)).getByLabelText('휴대전화')).toHaveValue(MOTHER_PHONE)

  await userEvent.click(screen.getByRole('button', { name: '취소' }))
  await userEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: '지우고 나가기' }),
  )
  await waitFor(() => expect(router.state.location.pathname).toBe(LIST))
  expect(count(REGISTER)).toBe(0)
})

// ── 코드 리뷰에서 나온 경우 ──────────────────────────────

test('오늘 날짜는 기기 시각이 아니라 한국 날짜다', async () => {
  // UTC로는 11일이지만 한국은 12일 00:30이다. 시계만 가짜로 바꾼다(타이머는 그대로).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-11T15:30:00Z'))
  mockLookups()
  renderApp(PATH, { me: admin })
  await screen.findByRole('option', { name: '능동관' })

  expect(within(student()).getByLabelText('등록일')).toHaveValue('2026-10-12')
})

test('등록을 연달아 두 번 눌러도 한 번만 보낸다', async () => {
  mockLookups()
  mockApi({ [REGISTER]: () => new Promise<Response>(() => {}) })
  renderApp(PATH, { me: admin })
  await fillRequired()

  await userEvent.dblClick(screen.getByRole('button', { name: '등록' }))

  await screen.findByRole('button', { name: '등록하는 중' })
  expect(count(REGISTER)).toBe(1)
})

test('번호 끝에 보이지 않는 공백이 붙어 있어도 막지 않고, 뗀 값을 보낸다', async () => {
  mockLookups()
  mockRegister()
  renderApp(PATH, { me: admin })
  await fillRequired()
  // 메신저에서 복사한 번호에 줄바꿈 없는 공백(NBSP)이나 전각 공백이 붙어 오기도 한다.
  await type(guardian(1), '휴대전화', `${MOTHER_PHONE}\u00a0`)
  await type(student(), '학생 휴대전화', `\u3000${STUDENT_PHONE}`)

  await submit()

  await findNotice()
  const body = requestOf(REGISTER).body as StudentCreateRequest
  expect(body.guardians![0].phone).toBe(MOTHER_PHONE)
  expect(body.phone).toBe(STUDENT_PHONE)
})

test('학부모 줄을 지우면 번호로 붙여 둔 오류를 지운다 (다른 학부모의 칸에 붙지 않게)', async () => {
  mockLookups()
  renderApp(PATH, { me: admin })
  await fillRequired()
  await userEvent.click(screen.getByRole('button', { name: '학부모 추가' }))
  await type(guardian(2), '이름', '둘째')
  await type(guardian(2), '휴대전화', '010-2222')
  await userEvent.click(screen.getByRole('button', { name: '학부모 추가' }))
  await type(guardian(3), '이름', '셋째')
  await type(guardian(3), '휴대전화', '010-3333-3333')
  await submit()
  expect(descriptionOf(guardian(2), '휴대전화')).toBeInvalid()

  await userEvent.click(screen.getByRole('button', { name: '학부모 1 지우기' }))

  // 지금 둘째 줄은 원래 셋째였던 학부모다. 그 칸에 오류가 붙으면 안 된다.
  expect(within(guardian(2)).getByLabelText('이름')).toHaveValue('셋째')
  expect(descriptionOf(guardian(1), '휴대전화')).not.toBeInvalid()
  expect(descriptionOf(guardian(2), '휴대전화')).not.toBeInvalid()
})

test('서버가 둘째 학부모의 번호 형식을 짚어 거부하면 그 줄의 번호 칸에 문구를 보여준다', async () => {
  // 형식 오류는 한 번에 하나만 온다. 목록 안의 칸은 guardians[1].phone처럼 온다.
  mockLookups()
  mockApi({
    [REGISTER]: () =>
      problemResponse(400, {
        detail: '입력값이 올바르지 않습니다.',
        code: 'COMMON_VALIDATION_FAILED',
        errors: [{ field: 'guardians[1].phone', message: '휴대전화 번호 형식이 아닙니다.' }],
        requestId: 'req-format',
      }),
  })
  renderApp(PATH, { me: admin })
  await fillRequired()
  await userEvent.click(screen.getByRole('button', { name: '학부모 추가' }))
  await type(guardian(2), '이름', '김철수')
  await type(guardian(2), '휴대전화', FATHER_PHONE)

  await submit()

  await waitFor(() =>
    expect(descriptionOf(guardian(2), '휴대전화')).toHaveAccessibleDescription(
      '휴대전화 번호 형식이 아닙니다.',
    ),
  )
  expect(descriptionOf(guardian(1), '휴대전화')).not.toBeInvalid()
  // 칸 밑의 오류로 충분하다. 폼 아래의 안내와 요청 번호는 없다.
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByText(/req-format/)).not.toBeInTheDocument()
})

test('학부모 줄을 지우면 서버가 짚은 칸의 오류도 지운다', async () => {
  mockLookups()
  mockApi({
    [REGISTER]: () =>
      problemResponse(400, {
        detail: '입력값이 올바르지 않습니다.',
        code: 'COMMON_VALIDATION_FAILED',
        errors: [{ field: 'guardians[1].name', message: '공백일 수 없습니다' }],
      }),
  })
  renderApp(PATH, { me: admin })
  await fillRequired()
  for (const [order, name, phone] of [
    [2, '둘째', '010-2222-2222'],
    [3, '셋째', '010-3333-3333'],
  ] as const) {
    await userEvent.click(screen.getByRole('button', { name: '학부모 추가' }))
    await type(guardian(order), '이름', name)
    await type(guardian(order), '휴대전화', phone)
  }
  await submit()
  await waitFor(() => expect(descriptionOf(guardian(2), '이름')).toBeInvalid())

  await userEvent.click(screen.getByRole('button', { name: '학부모 1 지우기' }))

  expect(descriptionOf(guardian(1), '이름')).not.toBeInvalid()
  expect(descriptionOf(guardian(2), '이름')).not.toBeInvalid()
})

test('연락처가 필요하다는 안내는 학부모를 추가하면 사라진다', async () => {
  mockLookups()
  renderApp(PATH, { me: admin })
  await fillRequired()
  await userEvent.click(screen.getByRole('button', { name: '학부모 1 지우기' }))
  await submit()
  expect(screen.getByRole('alert')).toHaveTextContent('하나는 있어야 해요')

  await userEvent.click(screen.getByRole('button', { name: '학부모 추가' }))

  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('기존 학부모 둘에 연결됐으면 둘 다 알린다 (가린 번호가 같아도)', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  mockLookups()
  // 뒷자리가 같은 두 번호는 가리면 같은 글자가 된다.
  mockRegister(() => ({
    guardians: [
      { id: 7, relation: 'MOTHER', name: '박다른', phone: '010-****-5678', linkedToExisting: true },
      { id: 8, relation: 'FATHER', name: '최다른', phone: '010-****-5678', linkedToExisting: true },
      {
        id: 9,
        relation: 'GRANDPARENT',
        name: '새사람',
        phone: '010-****-0001',
        linkedToExisting: false,
      },
    ],
  }))
  renderApp(PATH, { me: admin })
  await fillRequired()

  await submit()

  const notice = await findLinkedNotice()
  expect(notice).toHaveTextContent(
    '어머니는 이미 등록된 학부모(박다른, 010-****-5678)에 연결했어요.',
  )
  expect(notice).toHaveTextContent(
    '아버지는 이미 등록된 학부모(최다른, 010-****-5678)에 연결했어요.',
  )
  expect(notice).not.toHaveTextContent('새사람')
  // 같은 key가 겹치면 React가 콘솔에 경고한다.
  expect(errors).not.toHaveBeenCalled()
})

test('응답을 기다리다 다른 화면으로 가도, 등록 결과는 목록에 왔을 때 알린다', async () => {
  let respond!: (response: Response) => void
  mockLookups()
  mockApi({
    [REGISTER]: ({ body }) =>
      new Promise<Response>((resolve) => {
        const request = body as StudentCreateRequest
        respond = () =>
          resolve(
            jsonResponse(
              registered(request, {
                guardians: [
                  {
                    id: 7,
                    relation: 'MOTHER',
                    name: '박다른',
                    phone: '010-****-5678',
                    linkedToExisting: true,
                  },
                ],
              }),
              201,
            ),
          )
      }),
  })
  const { router, queryClient } = renderApp(PATH, { me: admin })
  await fillRequired()
  await submit()
  await screen.findByRole('button', { name: '등록하는 중' })

  // 취소 버튼은 막혀 있지만 위쪽 메뉴는 누를 수 있다.
  await router.navigate('/desk/dongtanpass')
  respond(new Response())
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))
  await router.navigate(LIST)

  // 기존 학부모에 연결됐다는 안내를 놓치면 남의 학부모에 붙인 것을 알 길이 없다.
  expect(await findLinkedNotice()).toHaveTextContent('이미 등록된 학부모(박다른, 010-****-5678)')
})

test('응답을 기다리다 목록으로 먼저 가 있어도, 등록이 끝나면 그 자리에서 알린다', async () => {
  let respond!: () => void
  mockLookups()
  mockApi({
    [REGISTER]: ({ body }) =>
      new Promise<Response>((resolve) => {
        respond = () => resolve(jsonResponse(registered(body as StudentCreateRequest), 201))
      }),
  })
  const { router } = renderApp(PATH, { me: admin })
  await fillRequired()
  await submit()
  await screen.findByRole('button', { name: '등록하는 중' })

  await router.navigate(LIST)
  await screen.findByRole('heading', { level: 1, name: '학생' })
  expect(screen.queryByText(/학생을 등록했어요/)).not.toBeInTheDocument()
  respond()

  expect(await findNotice()).toHaveTextContent('김도윤 학생을 등록했어요.')
})

test('서버 오류(5xx)도 등록됐을 수 있다고 알린다', async () => {
  mockLookups()
  mockApi({
    [REGISTER]: () => problemResponse(502, { requestId: '2d6a6e90a9d04a16bb607aa43840f2d7' }),
  })
  renderApp(PATH, { me: admin })
  await fillRequired()

  await submit()

  // 중간 서버가 끊었을 뿐 등록은 끝났을 수 있다.
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '저장됐을 수도 있어요. 내용은 그대로 두고 다시 눌러 주세요.',
  )
  // 서버 로그에서 이 요청을 찾을 번호도 함께 보여준다.
  expect(screen.getByRole('alert')).toHaveTextContent(
    '문의할 때 이 번호를 알려 주세요: 2d6a6e90a9d04a16bb607aa43840f2d7',
  )
  expect(count(REGISTER)).toBe(1)
})

test('지점·반 목록을 받지 못하면 알리고 등록을 막는다. 다시 불러오면 등록할 수 있다', async () => {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    // 다시 시도하지 않는 오류로 답한다.
    'GET /api/v1/classes': () => problemResponse(403, {}),
  })
  renderApp(PATH, { me: staff })

  // 반 선택지가 비어 있으면 반이 없는 지점처럼 보인다. 그대로 등록하게 두지 않는다.
  expect(await screen.findByRole('alert')).toHaveTextContent('지점·반 목록을 불러오지 못했어요.')
  expect(screen.getByRole('button', { name: '등록' })).toBeDisabled()

  mockLookups()
  await userEvent.click(screen.getByRole('button', { name: '지점·반 다시 불러오기' }))

  await waitFor(() => expect(screen.getByRole('button', { name: '등록' })).toBeEnabled())
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('응답을 기다리는 사이에 다른 사람이 로그인했으면 등록 결과를 남기지 않는다', async () => {
  let respond!: () => void
  mockLookups()
  mockApi({
    [REGISTER]: ({ body }) =>
      new Promise<Response>((resolve) => {
        respond = () => resolve(jsonResponse(registered(body as StudentCreateRequest), 201))
      }),
  })
  const { router, queryClient } = renderApp(PATH, { me: admin })
  await fillRequired()
  await submit()
  await screen.findByRole('button', { name: '등록하는 중' })

  // 같은 기기에서 앞사람이 나가고 다음 사람이 들어왔다.
  queryClient.setQueryData(['auth', 'me'], staff)
  await router.navigate(LIST)
  await screen.findByRole('heading', { level: 1, name: '학생' })
  respond()
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))

  // 떠난 화면이 등록한 학생의 상세로 끌고 가지 않는다(useIsShown).
  expect(router.state.location.pathname).toBe(LIST)
  // 앞사람이 등록한 학생 이름이 다음 사람에게 보이면 안 된다.
  expect(screen.queryByText(/학생을 등록했어요/)).not.toBeInTheDocument()
  await router.navigate('/desk/dongtanpass')
  await router.navigate(LIST)
  await screen.findByRole('heading', { level: 1, name: '학생' })
  expect(screen.queryByText(/학생을 등록했어요/)).not.toBeInTheDocument()
})

test('응답을 기다리는 사이에 로그아웃했으면 등록 결과를 남기지 않는다', async () => {
  let respond!: () => void
  mockLookups()
  mockApi({
    [REGISTER]: ({ body }) =>
      new Promise<Response>((resolve) => {
        respond = () => resolve(jsonResponse(registered(body as StudentCreateRequest), 201))
      }),
  })
  const { queryClient } = renderApp(PATH, { me: admin })
  await fillRequired()
  await submit()
  await screen.findByRole('button', { name: '등록하는 중' })

  queryClient.setQueryData(['auth', 'me'], null)
  await screen.findByRole('heading', { level: 1, name: '로그인' })
  respond()
  await waitFor(() => expect(queryClient.isMutating()).toBe(0))

  expect(queryClient.getQueryData(['students', 'registered-notice'])).toBeUndefined()
  // 받은 학생도 상세 캐시에 넣지 않는다.
  expect(queryClient.getQueryData(['students', 'detail', 1])).toBeUndefined()
})

test.each(['0026-10-12', '2100-01-01'])(
  '등록일의 연도가 맞지 않으면(%s) 그 칸에 알리고 보내지 않는다',
  async (date) => {
    mockLookups()
    renderApp(PATH, { me: admin })
    await fillRequired()
    await type(student(), '등록일', date)

    await submit()

    expect(descriptionOf(student(), '등록일')).toHaveAccessibleDescription(
      '등록일의 연도를 확인해 주세요.',
    )
    expect(count(REGISTER)).toBe(0)
  },
)

test('지점·반 목록을 받지 못했을 때의 안내는 등록 화면의 말로 한다', async () => {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/classes': () => problemResponse(403, {}),
  })
  renderApp(PATH, { me: staff })

  expect(await screen.findByRole('alert')).toHaveTextContent('목록을 받아야 등록할 수 있어요.')
})

// ── 멱등 키 ──────────────────────────────────────────────

const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function lastKey() {
  return requestOf(REGISTER).headers.get('Idempotency-Key')
}

test('응답을 받지 못한 뒤 그대로 다시 등록하면 같은 Idempotency-Key로 보내고, 처음의 응답으로 알린다', async () => {
  let attempts = 0
  mockLookups()
  mockApi({
    [REGISTER]: ({ body }) => {
      attempts += 1
      // 처음에는 서버가 등록했는데 응답이 끊겼다.
      if (attempts === 1) throw new TypeError('Failed to fetch')
      // 같은 키로 다시 오면 서버는 다시 등록하지 않고 처음의 응답을 돌려준다.
      const request = body as StudentCreateRequest
      return jsonResponse(
        registered(request, {
          guardians: [
            {
              id: 7,
              relation: 'MOTHER',
              name: '박다른',
              phone: '010-****-5678',
              linkedToExisting: true,
            },
          ],
        }),
        201,
      )
    },
  })
  renderApp(PATH, { me: admin })
  await fillRequired()

  await submit()
  await screen.findByRole('alert')
  const firstKey = lastKey()
  expect(firstKey).toMatch(KEY)
  await submit()

  // 처음 응답에만 있던 "기존 학부모에 연결" 안내를 놓치지 않는다.
  expect(await findLinkedNotice()).toHaveTextContent('이미 등록된 학부모(박다른, 010-****-5678)')
  expect(lastKey()).toBe(firstKey)
  expect(count(REGISTER)).toBe(2)
})

test('서버가 거부한 뒤 값을 고쳐 다시 등록하면 새 Idempotency-Key로 보낸다', async () => {
  let attempts = 0
  mockLookups()
  mockApi({
    [REGISTER]: ({ body }) => {
      attempts += 1
      if (attempts === 1) {
        return problemResponse(409, {
          detail: '같은 연락처에 같은 이름의 학생이 이미 있습니다.',
          code: 'MEMBER_STUDENT_DUPLICATED',
        })
      }
      return jsonResponse(registered(body as StudentCreateRequest), 201)
    },
  })
  renderApp(PATH, { me: admin })
  await fillRequired()

  await submit()
  await screen.findByRole('alert')
  const firstKey = lastKey()
  await type(student(), '이름', '김도현')
  await submit()

  // 같은 키로 보내면 서버가 처음의 거부를 그대로 돌려주거나(같은 내용), 거부한다(다른 내용).
  await findNotice()
  expect(lastKey()).toMatch(KEY)
  expect(lastKey()).not.toBe(firstKey)
})

test('앞서 보낸 요청을 서버가 아직 처리 중이면 잠시 뒤 다시 누르라고 알린다', async () => {
  mockLookups()
  mockApi({
    [REGISTER]: () =>
      problemResponse(409, {
        detail: '같은 요청을 처리하고 있습니다.',
        code: 'COMMON_IDEMPOTENCY_IN_PROGRESS',
      }),
  })
  renderApp(PATH, { me: admin })
  await fillRequired()

  await submit()

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '앞서 보낸 요청을 아직 처리하고 있어요. 내용은 고치지 말고 잠시 뒤 다시 눌러 주세요.',
  )
  // 입력은 그대로 남아 다시 누를 수 있다.
  expect(within(student()).getByLabelText('이름')).toHaveValue('김도윤')
  expect(screen.getByRole('button', { name: '등록' })).toBeEnabled()
})

test('전화번호가 실린 요청의 한도(429)에 걸리면 칸이 아니라 폼 아래에 남은 시간을 알리고 입력은 그대로 둔다', async () => {
  mockLookups()
  mockApi({
    [REGISTER]: () =>
      tooManyRequests(
        {
          detail: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
          code: 'MEMBER_PHONE_CHANGE_LIMITED',
        },
        '900',
      ),
  })
  const { router } = renderApp(PATH, { me: admin })
  await fillRequired()

  await submit()

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '요청이 너무 많아요. 약 15분 뒤에 다시 시도해 주세요.',
  )
  // 맞는 값을 넣어도 풀릴 때까지 같은 답이다. 알아서 다시 보내지 않는다.
  expect(count(REGISTER)).toBe(1)
  expect(router.state.location.pathname).toBe(PATH)
  expect(within(student()).getByLabelText('이름')).toHaveValue('김도윤')
  expect(within(student()).getByLabelText('이름')).not.toHaveAccessibleDescription()
  expect(screen.getByRole('button', { name: '등록' })).toBeEnabled()
})

// ── 요청 번호 ─────────────────────────────────────────────

test('지점·반 목록을 읽지 못해 등록이 막히면 안내 아래에 요청 번호를 보여준다', async () => {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/classes': () => unreadableResponse('2d6a6e90a9d04a16bb607aa43840f2d7'),
  })
  renderApp(PATH, { me: admin })

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('지점·반 목록을 불러오지 못했어요.')
  expect(alert).toHaveTextContent(
    '문의할 때 이 번호를 알려 주세요: 2d6a6e90a9d04a16bb607aa43840f2d7',
  )
})
