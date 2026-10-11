import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import type { AcademyClass, Campus } from '@/shared/campus'
import {
  jsonResponse,
  mockApi,
  problemResponse,
  requests,
  setupMockApi,
  unauthenticated,
} from '@/test/mockApi'
import { admin, partner, renderApp, staff } from '@/test/renderApp'
import type { StudentPage, StudentSummary } from '../api'

setupMockApi()

const PATH = '/desk/students'

const campuses: Campus[] = [
  { id: 1, name: '동탄관' },
  { id: 2, name: '능동관' },
]
const classes: AcademyClass[] = [{ id: 10, campusId: 1, name: '중1 정규' }]

const doyun: StudentSummary = {
  id: 1,
  campusId: 1,
  classId: 10,
  name: '김도윤',
  grade: 'MIDDLE_1',
  school: '동탄중',
  status: 'ENROLLED',
  primaryContact: { name: '이영희', phone: '010-****-5678', relation: 'MOTHER' },
}
// 반과 학교가 없고, 대표 연락처가 학생 본인 번호다.
const seoyeon: StudentSummary = {
  id: 2,
  campusId: 2,
  name: '김서연',
  grade: 'HIGH_1',
  status: 'ENROLLED',
  primaryContact: { name: '김서연', phone: '010-****-1234' },
}
// 퇴원했고, 지금은 꺼진 반에 속해 있다.
const minjun: StudentSummary = {
  id: 3,
  campusId: 1,
  classId: 99,
  name: '박민준',
  grade: 'ELEM_6',
  school: '능동초',
  status: 'WITHDRAWN',
  primaryContact: { name: '박철수', phone: '010-****-9999', relation: 'FATHER' },
}

function pageOf(items: StudentSummary[], overrides: Partial<StudentPage> = {}): StudentPage {
  return { items, page: 0, size: 20, totalElements: items.length, totalPages: 1, ...overrides }
}

/** 지점·반 조회를 흉내 내고, 학생 목록은 받은 쿼리로 응답을 만든다. */
function mockStudents(respond: (query: URLSearchParams) => StudentPage) {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/classes': () => jsonResponse(classes),
    'GET /api/v1/students': ({ query }) => jsonResponse(respond(query)),
  })
}

/** 학생 목록 요청들의 쿼리 문자열 */
function studentQueries() {
  return requests()
    .filter((key) => key.startsWith('GET /api/v1/students'))
    .map((key) => key.split('?')[1] ?? '')
}

function cellsOf(name: string) {
  const row = screen
    .getAllByRole('row')
    .find((item) => within(item).queryAllByRole('cell')[0]?.textContent === name)
  if (!row) throw new Error(`표에 없는 학생: ${name}`)
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent)
}

function bodyRowNames() {
  const [, ...rows] = screen.getAllByRole('row')
  return rows.map((row) => within(row).getAllByRole('cell')[0].textContent)
}

// ── 들어가기 ─────────────────────────────────────────────

test.each([
  ['직원', staff],
  ['관리자', admin],
])('%s는 학생 탭으로 목록에 들어올 수 있다', async (_name, me) => {
  mockStudents(() => pageOf([doyun]))
  mockApi({
    'GET /api/v1/class-fees': () => jsonResponse([]),
  })
  const { router } = renderApp('/desk/dongtanpass', { me })

  await userEvent.click(await screen.findByRole('link', { name: '학생' }))

  expect(await screen.findByRole('table', { name: '학생 목록' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe(PATH)
  expect(screen.getByRole('link', { name: '학생' })).toHaveAttribute('aria-current', 'page')
})

test('연계 학원은 이 화면을 볼 수 없고 학생 목록을 요청하지도 않는다', async () => {
  renderApp(PATH, { me: partner })

  expect(
    await screen.findByRole('heading', { name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '학생' })).not.toBeInTheDocument()
  expect(requests()).toEqual([])
})

// ── 목록 ─────────────────────────────────────────────────

test('학생마다 학년, 학교, 지점, 반, 대표 연락처, 상태를 보여준다', async () => {
  mockStudents(() => pageOf([doyun, seoyeon, minjun]))
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  expect(cellsOf('김도윤')).toEqual([
    '김도윤',
    '중1',
    '동탄중',
    '동탄관',
    '중1 정규',
    '어머니 010-****-5678',
    '재원',
  ])
  // 학교와 반이 없으면 비워 두고, 관계가 없는 연락처는 학생 본인의 번호다.
  expect(cellsOf('김서연')).toEqual([
    '김서연',
    '고1',
    '-',
    '능동관',
    '-',
    '본인 010-****-1234',
    '재원',
  ])
  // 반 목록에는 운영 중인 반만 온다. 이름을 못 찾은 반은 꺼진 반이다.
  expect(cellsOf('박민준')).toEqual([
    '박민준',
    '초6',
    '능동초',
    '동탄관',
    '꺼진 반',
    '아버지 010-****-9999',
    '퇴원',
  ])
  expect(screen.getByText('전체 3명')).toBeInTheDocument()
})

test('전화번호는 서버가 가려서 준 값만 보여주고, 요청 주소에 전화번호를 싣지 않는다', async () => {
  mockStudents(() => pageOf([doyun]))
  renderApp(`${PATH}?phoneLast4=5678`, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  expect(screen.getByText('010-****-5678')).toBeInTheDocument()
  // 주소에 뒷자리가 들어와도 서버로 보내지 않는다. 뒷자리 검색은 이 화면에 없다.
  expect(studentQueries()).toEqual(['page=0'])
})

test('학생이 한 명도 없으면 안내를 보여준다', async () => {
  mockStudents(() => pageOf([]))
  renderApp(PATH, { me: staff })

  expect(await screen.findByRole('heading', { name: '등록된 학생이 없어요' })).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('목록을 불러오지 못하면 서버가 준 안내를 보여주고 다시 불러올 수 있다', async () => {
  let fail = true
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/classes': () => jsonResponse(classes),
    // 실제로는 연결 실패나 5xx다. 재시도 대기를 피하려고 재시도하지 않는 상태 코드를 쓴다.
    'GET /api/v1/students': () =>
      fail ? problemResponse(403, { detail: '권한이 없습니다.' }) : jsonResponse(pageOf([doyun])),
  })
  renderApp(PATH, { me: staff })

  expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
  expect(await screen.findByRole('table', { name: '학생 목록' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('지점이나 반 이름을 불러오지 못해도 학생 목록은 보여준다', async () => {
  mockApi({
    'GET /api/v1/campuses': () => problemResponse(403, { detail: '권한이 없습니다.' }),
    'GET /api/v1/classes': () => problemResponse(403, { detail: '권한이 없습니다.' }),
    'GET /api/v1/students': () => jsonResponse(pageOf([doyun])),
  })
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  // 이름을 붙이지 못한 칸은 비워 둔다. 반 목록을 못 받았으면 꺼진 반이라고 단정하지 않는다.
  expect(cellsOf('김도윤').slice(3, 5)).toEqual(['-', '-'])
})

test('목록을 보는 동안 세션이 끊기면(401) 로그인 화면으로 보내고, 보던 조건을 기억한다', async () => {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/classes': () => jsonResponse(classes),
    'GET /api/v1/students': unauthenticated,
  })
  const { router } = renderApp(`${PATH}?campusId=2&name=kim`, { me: staff })

  expect(await screen.findByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument()
  // 다시 로그인하면 보던 지점과 이름 조건으로 돌아온다.
  expect(router.state.location.state).toEqual({ from: `${PATH}?campusId=2&name=kim` })
})

// ── 찾기 ─────────────────────────────────────────────────

test('이름을 넣고 찾으면 그 이름으로 요청하고 주소에 남긴다', async () => {
  mockStudents((query) => pageOf(query.get('name') === '김' ? [doyun, seoyeon] : [doyun, minjun]))
  const { router } = renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  // 앞뒤 공백은 떼고 보낸다.
  await userEvent.type(screen.getByLabelText('이름'), ' 김 ')
  await userEvent.click(screen.getByRole('button', { name: '찾기' }))

  await waitFor(() => expect(bodyRowNames()).toEqual(['김도윤', '김서연']))
  expect(new URLSearchParams(router.state.location.search).get('name')).toBe('김')
  // 글자를 칠 때마다 요청하지 않는다. 처음 한 번과 찾기를 누른 한 번뿐이다.
  expect(studentQueries()).toEqual(['page=0', `name=${encodeURIComponent('김')}&page=0`])
})

test('지점을 고르면 그 지점으로 요청하고, 이름 조건은 유지한다', async () => {
  mockStudents((query) => pageOf(query.get('campusId') === '2' ? [seoyeon] : [doyun, seoyeon]))
  const { router } = renderApp(`${PATH}?name=김`, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })
  expect(screen.getByLabelText('이름')).toHaveValue('김')

  await userEvent.click(await screen.findByRole('radio', { name: '능동관' }))

  await waitFor(() => expect(bodyRowNames()).toEqual(['김서연']))
  const params = new URLSearchParams(router.state.location.search)
  expect(params.get('campusId')).toBe('2')
  expect(params.get('name')).toBe('김')
  expect(screen.getByRole('radio', { name: '능동관' })).toBeChecked()
})

test('찾는 학생이 없으면 조건 때문임을 알리고 이름 찾는 법을 안내한다', async () => {
  mockStudents(() => pageOf([]))
  renderApp(`${PATH}?name=철수`, { me: staff })

  expect(
    await screen.findByRole('heading', { name: '조건에 맞는 학생이 없어요' }),
  ).toBeInTheDocument()
  expect(screen.getByText(/이름은 앞부분부터 입력해야 찾을 수 있어요/)).toBeInTheDocument()
})

test('이름을 지우고 찾으면 전체 목록으로 돌아가고 주소에서 조건을 뺀다', async () => {
  mockStudents((query) => pageOf(query.has('name') ? [doyun] : [doyun, minjun]))
  const { router } = renderApp(`${PATH}?name=김`, { me: staff })
  await waitFor(() => expect(bodyRowNames()).toEqual(['김도윤']))

  await userEvent.clear(screen.getByLabelText('이름'))
  await userEvent.click(screen.getByRole('button', { name: '찾기' }))

  await waitFor(() => expect(bodyRowNames()).toEqual(['김도윤', '박민준']))
  expect(router.state.location.search).toBe('')
})

// ── 페이지 ───────────────────────────────────────────────

test('다음을 누르면 다음 페이지를 요청하고, 받는 동안 이전 페이지를 보여준다', async () => {
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/classes': () => jsonResponse(classes),
    'GET /api/v1/students': async ({ query }) => {
      if (query.get('page') === '1') {
        await held
        return jsonResponse(pageOf([minjun], { page: 1, totalPages: 2, totalElements: 3 }))
      }
      return jsonResponse(pageOf([doyun, seoyeon], { totalPages: 2, totalElements: 3 }))
    },
  })
  const { router } = renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })
  const pages = screen.getByRole('navigation', { name: '페이지' })
  expect(pages).toHaveTextContent('1 / 2')
  expect(within(pages).getByRole('button', { name: '이전' })).toBeDisabled()

  await userEvent.click(within(pages).getByRole('button', { name: '다음' }))

  // 표가 사라졌다 나타나지 않는다. 받는 동안에는 다시 누를 수 없다.
  expect(bodyRowNames()).toEqual(['김도윤', '김서연'])
  await waitFor(() => expect(within(pages).getByRole('button', { name: '다음' })).toBeDisabled())
  expect(router.state.location.search).toBe('?page=1')

  release()
  await waitFor(() => expect(bodyRowNames()).toEqual(['박민준']))
  expect(screen.getByRole('navigation', { name: '페이지' })).toHaveTextContent('2 / 2')
  expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '이전' })).toBeEnabled()
})

test('조건을 바꾸면 첫 페이지부터 다시 본다', async () => {
  mockStudents((query) =>
    pageOf([doyun], { page: Number(query.get('page')), totalPages: 3, totalElements: 45 }),
  )
  const { router } = renderApp(`${PATH}?page=2`, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })
  expect(screen.getByRole('navigation', { name: '페이지' })).toHaveTextContent('3 / 3')

  await userEvent.click(await screen.findByRole('radio', { name: '동탄관' }))

  await waitFor(() => expect(router.state.location.search).toBe('?campusId=1'))
  expect(studentQueries().at(-1)).toBe('campusId=1&page=0')
})

test('페이지가 하나뿐이면 페이지 넘기기를 보여주지 않는다', async () => {
  mockStudents(() => pageOf([doyun]))
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  expect(screen.queryByRole('navigation', { name: '페이지' })).not.toBeInTheDocument()
})

test('없는 페이지로 들어오면 첫 페이지로 갈 수 있다', async () => {
  mockStudents((query) =>
    query.get('page') === '9'
      ? pageOf([], { page: 9, totalPages: 1, totalElements: 1 })
      : pageOf([doyun]),
  )
  const { router } = renderApp(`${PATH}?page=9`, { me: staff })

  await userEvent.click(await screen.findByRole('button', { name: '첫 페이지로' }))

  expect(await screen.findByRole('table', { name: '학생 목록' })).toBeInTheDocument()
  expect(router.state.location.search).toBe('')
})

test.each(['abc', '-1', '1.5', ''])(
  '주소의 page가 "%s"처럼 이상하면 첫 페이지로 본다',
  async (page) => {
    mockStudents(() => pageOf([doyun]))
    renderApp(`${PATH}?page=${page}&campusId=xyz`, { me: staff })
    await screen.findByRole('table', { name: '학생 목록' })

    // 지점 값도 숫자가 아니면 전 지점으로 본다.
    expect(studentQueries()).toEqual(['page=0'])
    expect(screen.getByRole('radio', { name: '전체' })).toBeChecked()
  },
)
