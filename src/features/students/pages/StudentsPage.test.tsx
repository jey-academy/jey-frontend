import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test } from 'vitest'
import type { AcademyClass, Campus } from '@/shared/campus'
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
import { expectStackLabels } from '@/test/table'
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
// 반과 학교가 없고, 대표 연락처가 학생 본인 번호다. 서버는 없는 값을 null로 준다.
const seoyeon = {
  id: 2,
  campusId: 2,
  classId: null,
  name: '김서연',
  grade: 'HIGH_1',
  school: null,
  status: 'ENROLLED',
  primaryContact: { name: '김서연', phone: '010-****-1234', relation: null },
} as unknown as StudentSummary
// 퇴원했고, 반 목록에 없는 반(꺼진 반)에 속해 있다.
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

const SEARCH = 'POST /api/v1/students/search'

type Respond = (
  conditions: URLSearchParams,
) => StudentPage | Response | Promise<StudentPage | Response>

// 학생 목록 요청들이 본문에 실어 보낸 조건. 테스트마다 비운다.
let sentConditions: URLSearchParams[] = []
beforeEach(() => {
  sentConditions = []
})

/** 본문의 조건을 읽기 쉽게 `이름=값` 꼴로 옮긴다. 서버는 본문에 모르는 필드가 있으면 거부하므로 모두 옮긴다. */
function conditionsOf(body: unknown) {
  return new URLSearchParams(
    Object.entries(body as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
  )
}

/** 지점·반 조회를 흉내 내고, 학생 목록은 본문으로 받은 조건으로 응답을 만든다. */
function mockStudents(respond: Respond) {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/classes': () => jsonResponse(classes),
    [SEARCH]: async ({ body, query }) => {
      // 조건은 본문으로만 간다. 주소에 쿼리 문자열이 붙으면 서버가 거부한다(400).
      if (query.size > 0) {
        return problemResponse(400, {
          detail: '검색 조건은 주소가 아니라 본문으로 보내야 합니다.',
          code: 'COMMON_BAD_REQUEST',
        })
      }
      const conditions = conditionsOf(body)
      sentConditions.push(conditions)
      const result = await respond(conditions)
      return result instanceof Response ? result : jsonResponse(result)
    },
  })
}

/** 학생 목록 요청들이 보낸 조건(`campusId=1&page=0` 꼴). 주소가 아니라 본문에 실린 것이다. */
function studentQueries() {
  return sentConditions.map((conditions) => conditions.toString())
}

const KIM = encodeURIComponent('김')
// 이름과 번호 뒷자리를 함께 받는 입력칸
const TERM = '이름 또는 번호 뒷자리'

function rowCells(row: HTMLElement) {
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent)
}

function bodyRows() {
  const [, ...rows] = screen.getAllByRole('row')
  return rows
}

function bodyRowNames() {
  return bodyRows().map((row) => rowCells(row)[0])
}

function cellsOf(name: string) {
  const row = bodyRows().find((item) => rowCells(item)[0] === name)
  if (!row) throw new Error(`표에 없는 학생: ${name}`)
  return rowCells(row)
}

async function search(name: string, { byEnter = false } = {}) {
  const input = screen.getByLabelText(TERM)
  await userEvent.clear(input)
  if (name) await userEvent.type(input, name)
  if (byEnter) await userEvent.type(input, '{Enter}')
  else await userEvent.click(screen.getByRole('button', { name: '찾기' }))
}

/** 응답을 붙잡아 두었다가 원할 때 보낸다. */
function hold() {
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  return { held, release }
}

// ── 들어가기 ─────────────────────────────────────────────

test.each([
  ['직원', staff],
  ['관리자', admin],
])('%s는 학생 탭으로 들어와 지점·반 이름이 붙은 목록을 본다', async (_name, me) => {
  mockStudents(() => pageOf([doyun]))
  const { router } = renderApp('/desk/dongtanpass', { me })

  await userEvent.click(await screen.findByRole('link', { name: '학생' }))

  await screen.findByRole('table', { name: '학생 목록' })
  expect(router.state.location.pathname).toBe(PATH)
  expect(screen.getByRole('link', { name: '학생' })).toHaveAttribute('aria-current', 'page')
  await waitFor(() => expect(cellsOf('김도윤').slice(3, 5)).toEqual(['동탄관', '중1 정규']))
  // 좁은 화면에서 머리 줄 대신 보이는 이름표가 열마다 맞다.
  expectStackLabels(screen.getByRole('table', { name: '학생 목록' }))
  // 이 화면이 보내는 요청은 이것뿐이다. 지점·반 조회에 조건을 붙이지 않는다.
  expect(requests().toSorted()).toEqual(['GET /api/v1/campuses', 'GET /api/v1/classes', SEARCH])
  // 조건은 주소가 아니라 본문으로 간다(주소에 쿼리 문자열이 붙으면 서버가 거부한다). 조건이 없어도 본문은 있다.
  const sent = requestOf(SEARCH)
  expect(sent.body).toEqual({ page: 0 })
  // 조회라서 멱등 키를 싣지 않는다.
  expect(sent.headers.has('Idempotency-Key')).toBe(false)
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

  await waitFor(() =>
    expect(cellsOf('김도윤')).toEqual([
      '김도윤',
      '중1',
      '동탄중',
      '동탄관',
      '중1 정규',
      '어머니 010-****-5678',
      '재원',
    ]),
  )
  // 학교와 반이 없으면 비워 두고, 관계가 없는 연락처는 학생 본인의 번호다. 직원도 다른 지점(능동관)의 학생을 본다.
  expect(cellsOf('김서연')).toEqual([
    '김서연',
    '고1',
    '-',
    '능동관',
    '-',
    '본인 010-****-1234',
    '재원',
  ])
  // 반 목록에는 운영 중인 반만 온다. 이름을 못 찾은 반을 반 없음("-")과 같게 보여주지 않는다.
  expect(cellsOf('박민준')).toEqual([
    '박민준',
    '초6',
    '능동초',
    '동탄관',
    '목록에 없는 반',
    '아버지 010-****-9999',
    '퇴원',
  ])
  expect(screen.getByText('전체 3명')).toBeInTheDocument()
})

test('이름이 같은 학생도 따로따로 보여준다', async () => {
  const another: StudentSummary = { ...doyun, id: 7, school: '반송중', status: 'WITHDRAWN' }
  mockStudents(() => pageOf([doyun, another]))
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  const rows = bodyRows().map(rowCells)
  expect(rows.map((cells) => [cells[0], cells[2], cells[6]])).toEqual([
    ['김도윤', '동탄중', '재원'],
    ['김도윤', '반송중', '퇴원'],
  ])
})

test('모르는 상태·학년·관계 값이 와도 다른 뜻의 표시로 바꾸지 않고 받은 값을 보여준다', async () => {
  // 서버가 값을 먼저 추가하고 프론트 타입이 아직 옛것일 때
  const onLeave = {
    ...doyun,
    status: 'ON_LEAVE',
    grade: 'GAP_YEAR',
    primaryContact: { name: '고모', phone: '010-****-0001', relation: 'AUNT' },
  } as unknown as StudentSummary
  mockStudents(() => pageOf([onLeave]))
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  const cells = cellsOf('김도윤')
  expect(cells[1]).toBe('GAP_YEAR')
  expect(cells[5]).toBe('AUNT 010-****-0001')
  // 패스 화면의 문구("사용 완료")나 "퇴원"으로 보이면 안 된다.
  expect(cells[6]).toBe('ON_LEAVE')
  // 퇴원생처럼 흐리게 그리지도 않는다.
  expect(bodyRows()[0]).not.toHaveClass('text-sub')
})

test('대표 연락처가 없는 학생이 있어도 목록을 보여주고, 그 칸에는 연락처가 없다고 적는다', async () => {
  // 학부모도 본인 번호도 없는 학생. 서버는 대표 연락처를 null로 준다.
  const noContact: StudentSummary = { ...minjun, id: 4, name: '최하늘', primaryContact: null }
  mockStudents(() => pageOf([doyun, noContact]))
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  expect(cellsOf('최하늘')[5]).toBe('연락처 없음')
  // 다른 학생의 줄은 그대로다.
  expect(cellsOf('김도윤')[5]).toBe('어머니 010-****-5678')
  // 상세로 가서 연락처를 넣을 수 있다.
  expect(screen.getByRole('link', { name: '최하늘' })).toHaveAttribute('href', `${PATH}/4`)
})

test('주소의 page가 서버의 상한을 넘으면(10001) 첫 페이지를 요청한다', async () => {
  mockStudents(() => pageOf([doyun]))
  renderApp(`${PATH}?campusId=1&page=10001`, { me: staff })

  await screen.findByRole('table', { name: '학생 목록' })
  expect(studentQueries()).toEqual(['campusId=1&page=0'])
})

test('주소의 page가 서버의 상한(10000)이면 그대로 요청한다', async () => {
  mockStudents(() => pageOf([], { page: 10000, totalPages: 1, totalElements: 1 }))
  renderApp(`${PATH}?page=10000`, { me: staff })

  await screen.findByText('이 페이지에는 학생이 없어요')
  expect(studentQueries()).toEqual(['page=10000'])
})

test('학생이 한 명도 없으면 안내를 보여준다', async () => {
  mockStudents(() => pageOf([]))
  renderApp(PATH, { me: staff })

  expect(await screen.findByRole('heading', { name: '등록된 학생이 없어요' })).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('목록을 불러오지 못하면 서버가 준 안내를 보여주고 다시 불러올 수 있다', async () => {
  let fail = true
  // 실제로는 연결 실패나 5xx다. 재시도 대기를 피하려고 재시도하지 않는 상태 코드를 쓴다.
  mockStudents(() =>
    fail ? problemResponse(403, { detail: '권한이 없습니다.' }) : pageOf([doyun]),
  )
  renderApp(PATH, { me: staff })

  expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  // 실패를 "학생이 없다"로 보여주면 안 된다.
  expect(screen.queryByRole('heading', { name: /학생이 없어요/ })).not.toBeInTheDocument()

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
  expect(await screen.findByRole('table', { name: '학생 목록' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('목록을 본 뒤 다시 불러오기에 실패하면 이전 내용일 수 있다고 알리고 표는 남긴다', async () => {
  let fail = false
  mockStudents(() =>
    fail ? problemResponse(403, { detail: '권한이 없습니다.' }) : pageOf([doyun]),
  )
  const { queryClient } = renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  fail = true
  await queryClient.invalidateQueries({ queryKey: ['students'] })

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '최신 내용을 불러오지 못했어요. 아래 표는 이전 내용일 수 있어요.',
  )
  expect(bodyRowNames()).toEqual(['김도윤'])
})

test('지점이나 반 이름을 불러오지 못하면 알리고, 학생 목록은 보여주며, 다시 불러올 수 있다', async () => {
  let fail = true
  mockApi({
    'GET /api/v1/campuses': () =>
      fail ? problemResponse(403, { detail: '권한이 없습니다.' }) : jsonResponse(campuses),
    'GET /api/v1/classes': () =>
      fail ? problemResponse(403, { detail: '권한이 없습니다.' }) : jsonResponse(classes),
    [SEARCH]: () => jsonResponse(pageOf([doyun])),
  })
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  expect(await screen.findByRole('alert')).toHaveTextContent('지점·반 이름을 불러오지 못했어요.')
  // 반 목록을 못 받았으면 "목록에 없는 반"이라고 단정하지 않는다.
  expect(cellsOf('김도윤').slice(3, 5)).toEqual(['-', '-'])

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '지점·반 다시 불러오기' }))
  await waitFor(() => expect(cellsOf('김도윤').slice(3, 5)).toEqual(['동탄관', '중1 정규']))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('주소의 지점이 지점 목록에 없어도 그 지점으로 걸러진 목록임을 보여준다', async () => {
  mockApi({
    'GET /api/v1/campuses': () => problemResponse(403, { detail: '권한이 없습니다.' }),
    'GET /api/v1/classes': () => jsonResponse(classes),
    [SEARCH]: () => jsonResponse(pageOf([seoyeon])),
  })
  renderApp(`${PATH}?campusId=2`, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  // 아무 지점도 고르지 않은 것처럼 보이면, 걸러진 목록을 전체 목록으로 착각한다.
  expect(screen.getByRole('radio', { name: '지점 2' })).toBeChecked()
  expect(requestOf(SEARCH).body).toEqual({ campusId: 2, page: 0 })
})

test('목록을 보는 동안 세션이 끊기면(401) 로그인 화면으로 보내고, 보던 지점과 페이지를 기억한다', async () => {
  mockStudents(unauthenticated)
  const { router } = renderApp(`${PATH}?campusId=2&page=1`, { me: staff })

  expect(await screen.findByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument()
  expect(router.state.location.state).toEqual({ from: `${PATH}?campusId=2&page=1` })
})

test('로그아웃하면 받아 둔 학생 목록을 지운다', async () => {
  mockStudents(() => pageOf([doyun]))
  mockApi({
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/logout': noContent,
  })
  const { queryClient } = renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  await userEvent.click(screen.getByRole('button', { name: '로그아웃' }))

  expect(await screen.findByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument()
  // 같은 기기를 다음 사람이 쓸 수 있다.
  expect(queryClient.getQueriesData({ queryKey: ['students'] })).toEqual([])
  expect(queryClient.getQueriesData({ queryKey: ['campus'] })).toEqual([])
  expect(screen.queryByText('김도윤')).not.toBeInTheDocument()
})

// ── 개인정보 ─────────────────────────────────────────────

test('전화번호는 서버가 가려서 준 값만 보여주고, 주소에 뒷자리가 있어도 요청에 싣지 않는다', async () => {
  mockStudents(() => pageOf([doyun], { totalPages: 2, totalElements: 21 }))
  const { router } = renderApp(`${PATH}?phoneLast4=5678`, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  expect(screen.getByText('010-****-5678')).toBeInTheDocument()
  expect(studentQueries()).toEqual(['page=0'])

  // 페이지를 넘겨도 요청에 실리지 않고, 주소에서도 사라진다.
  await userEvent.click(screen.getByRole('button', { name: '다음' }))
  await waitFor(() => expect(studentQueries()).toEqual(['page=0', 'page=1']))
  expect(router.state.location.search).toBe('?page=1')
})

test('찾은 이름은 주소에 남기지 않는다', async () => {
  mockStudents(() => pageOf([doyun]))
  const { router } = renderApp(`${PATH}?campusId=1`, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  await search('김도윤')

  await waitFor(() => expect(studentQueries().at(-1)).toContain('name='))
  // 학생 이름이 브라우저 기록과 접근 로그에 남지 않게 한다.
  expect(router.state.location.search).toBe('?campusId=1')
  expect(JSON.stringify(router.state.location)).not.toContain('김도윤')
  expect(JSON.stringify(router.state.location)).not.toContain(encodeURIComponent('김도윤'))
})

test.each([
  '01012345678',
  '010-1234-5678',
  '010 1234 5678',
  '12345',
  // 숫자로만 된 이름은 없다. 뒷자리를 덜 친 것이다.
  '567',
  '1',
  '김 5678',
  // 구분 기호나 글자를 끼워 넣어도, 전각 숫자로 써도 막는다.
  '010.1234.5678',
  '(010)1234',
  '5.6.7.8',
  '56김78',
  '０１０１２３４５６７８',
  // NFKC가 0~9로 바꾸지 않는 다른 문자 체계의 숫자도 숫자로 센다.
  '٠١٠١٢٣٤٥٦٧٨',
  '٥٦٧٨',
  '٠١٠.١٢٣٤.٥٦٧٨',
])('뒷자리 4자리가 아닌 번호(%s)를 넣으면 보내지 않고 안내한다', async (value) => {
  mockStudents(() => pageOf([doyun]))
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  await search(value)

  expect(screen.getByLabelText(TERM)).toHaveAccessibleDescription(
    '번호는 뒷자리 4자리만 넣어 주세요.',
  )
  // 번호로 보이는 값은 보내지 않는다. 처음 목록을 받은 요청뿐이다.
  expect(studentQueries()).toEqual(['page=0'])
})

test.each(['5678', ' 5678 ', '56 78', '56-78', '５６７８'])(
  '숫자 4자리(%s)를 넣으면 전화번호 뒷자리로 찾는다',
  async (value) => {
    mockStudents(() => pageOf([doyun]))
    const { router } = renderApp(`${PATH}?campusId=1`, { me: staff })
    await screen.findByRole('table', { name: '학생 목록' })

    await search(value)

    await waitFor(() => expect(studentQueries()).toHaveLength(2))
    // 이름으로는 보내지 않는다. 공백과 -는 빼고, 전각 숫자는 보통 숫자로 바꿔 보낸다.
    expect(requestOf(SEARCH).body).toEqual({ campusId: 1, phoneLast4: '5678', page: 0 })
    expect(screen.getByLabelText(TERM)).not.toBeInvalid()
    // 뒷자리는 화면 주소에 남기지 않는다.
    expect(router.state.location.search).toBe('?campusId=1')
    expect(JSON.stringify(router.state.location)).not.toContain('5678')
  },
)

test('거부된 값 다음에 뒷자리로 찾으면 안내를 지우고 찾는다', async () => {
  mockStudents(() => pageOf([doyun]))
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })
  await search('010-1234-5678')
  expect(screen.getByLabelText(TERM)).toBeInvalid()

  await search('5678')

  await waitFor(() => expect(studentQueries()).toHaveLength(2))
  expect(requestOf(SEARCH).body).toEqual({ phoneLast4: '5678', page: 0 })
  // 안내가 남으면 방금 넣은 값이 거부된 것처럼 보인다.
  expect(screen.getByLabelText(TERM)).not.toBeInvalid()
  expect(screen.getByLabelText(TERM)).not.toHaveAccessibleDescription(
    '번호는 뒷자리 4자리만 넣어 주세요.',
  )
})

test('뒷자리로 찾다가 입력칸을 비우고 찾으면 조건 없는 전체 목록으로 돌아간다', async () => {
  mockStudents((conditions) => pageOf(conditions.has('phoneLast4') ? [doyun] : []))
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { name: '등록된 학생이 없어요' })
  await search('5678')
  await screen.findByText(/번호 뒷자리가 같은 학생이 모두 나와요/)

  await search('')

  // 처음 화면과 같은 조건이라 받아 둔 목록을 다시 쓴다(새 요청이 없을 수 있다).
  // 조건이 없으니 "조건에 맞는 학생이 없어요"가 아니다.
  expect(await screen.findByRole('heading', { name: '등록된 학생이 없어요' })).toBeInTheDocument()
  expect(screen.queryByText(/번호 뒷자리가 같은 학생이 모두 나와요/)).not.toBeInTheDocument()
})

test('뒷자리로 찾으면 후보 목록이라고 알리고, 이름으로 찾으면 알리지 않는다', async () => {
  mockStudents(() => pageOf([doyun, seoyeon]))
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })
  const CANDIDATES = /번호 뒷자리가 같은 학생이 모두 나와요/

  await search('5678')

  await waitFor(() => expect(studentQueries()).toHaveLength(2))
  // 맞은 번호가 대표 연락처가 아닐 수 있다(김서연의 대표 연락처는 1234). 표의 번호만 보고 고르면 틀린다.
  expect(await screen.findByText(CANDIDATES)).toHaveTextContent(
    '표의 대표 연락처와 다를 수 있어요. 이름으로 확인해 주세요.',
  )
  expect(screen.getByText('전체 2명')).toBeInTheDocument()

  await search('김')

  await waitFor(() => expect(studentQueries().at(-1)).toBe(`name=${KIM}&page=0`))
  await waitFor(() => expect(screen.queryByText(CANDIDATES)).not.toBeInTheDocument())
})

test('뒷자리로 찾다가 이름으로 찾으면 뒷자리 조건을 빼고, 지점을 바꿔도 뒷자리는 유지한다', async () => {
  mockStudents(() => pageOf([doyun]))
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  await search('5678')
  await waitFor(() => expect(studentQueries().at(-1)).toBe('phoneLast4=5678&page=0'))
  await userEvent.click(screen.getByRole('radio', { name: '동탄관' }))
  await waitFor(() => expect(studentQueries().at(-1)).toBe('campusId=1&phoneLast4=5678&page=0'))

  await search('김')

  await waitFor(() => expect(studentQueries().at(-1)).toBe(`campusId=1&name=${KIM}&page=0`))
})

test('뒷자리로 찾으면, 결과를 받는 동안 이전 목록을 후보처럼 보여주지 않는다', async () => {
  const { held, release } = hold()
  mockStudents(async (conditions) => {
    if (!conditions.has('phoneLast4')) return pageOf([doyun, minjun], { totalElements: 45 })
    await held
    return pageOf([seoyeon])
  })
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  await search('1234')

  // 전체 목록이 뒷자리 안내 아래에 남아 있으면 그 학생들을 후보로 착각한다.
  await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument())
  expect(screen.getByRole('status')).toHaveTextContent('불러오고 있어요')

  release()
  await waitFor(() => expect(bodyRowNames()).toEqual(['김서연']))
})

test('뒷자리로 찾은 학생이 없으면 뒷자리를 확인하라고 안내한다', async () => {
  mockStudents((conditions) => pageOf(conditions.has('phoneLast4') ? [] : [doyun]))
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  await search('0000')

  expect(
    await screen.findByRole('heading', { name: '조건에 맞는 학생이 없어요' }),
  ).toBeInTheDocument()
  expect(
    screen.getByText(
      '학부모와 학생 본인 번호의 뒷자리에서 찾았어요. 뒷자리가 맞는지 확인해 주세요.',
    ),
  ).toBeInTheDocument()
  expect(screen.queryByText(/이름은 앞부분부터/)).not.toBeInTheDocument()
})

test.each(['김1', '3반 김', '김 2세', 'A12'])(
  '숫자가 조금 섞인 이름(%s)은 그대로 찾는다',
  async (value) => {
    mockStudents(() => pageOf([doyun]))
    renderApp(PATH, { me: staff })
    await screen.findByRole('table', { name: '학생 목록' })

    await search(value)

    await waitFor(() => expect(studentQueries()).toHaveLength(2))
    expect(new URLSearchParams(studentQueries().at(-1)).get('name')).toBe(value)
    expect(screen.getByLabelText(TERM)).not.toBeInvalid()
  },
)

// ── 찾기 ─────────────────────────────────────────────────

test('이름을 넣고 찾으면 그 이름으로 요청하고, 치는 동안에는 요청하지 않는다', async () => {
  mockStudents((conditions) =>
    pageOf(conditions.get('name') === '김' ? [doyun, seoyeon] : [doyun, minjun]),
  )
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  // 앞뒤 공백은 떼고 보낸다.
  await search(' 김 ', { byEnter: true })

  await waitFor(() => expect(bodyRowNames()).toEqual(['김도윤', '김서연']))
  expect(studentQueries()).toEqual(['page=0', `name=${KIM}&page=0`])
  // 찾은 뒤에도 입력칸과 포커스가 그대로라 이어서 고칠 수 있다.
  expect(screen.getByLabelText(TERM)).toHaveValue(' 김 ')
  expect(screen.getByLabelText(TERM)).toHaveFocus()
})

test('페이지를 넘긴 상태에서 찾으면 첫 페이지부터 본다', async () => {
  mockStudents((conditions) =>
    pageOf([doyun], { page: Number(conditions.get('page')), totalPages: 3, totalElements: 45 }),
  )
  const { router } = renderApp(`${PATH}?campusId=1&page=2`, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  await search('김')

  await waitFor(() => expect(studentQueries().at(-1)).toBe(`campusId=1&name=${KIM}&page=0`))
  expect(router.state.location.search).toBe('?campusId=1')
})

test('지점을 고르면 그 지점으로 요청하고, 찾던 이름은 유지한다', async () => {
  mockStudents((conditions) =>
    pageOf(conditions.get('campusId') === '2' ? [seoyeon] : [doyun, seoyeon]),
  )
  const { router } = renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })
  await search('김')
  await waitFor(() => expect(studentQueries()).toHaveLength(2))

  await userEvent.click(screen.getByRole('radio', { name: '능동관' }))

  await waitFor(() => expect(bodyRowNames()).toEqual(['김서연']))
  expect(studentQueries().at(-1)).toBe(`campusId=2&name=${KIM}&page=0`)
  expect(router.state.location.search).toBe('?campusId=2')
  expect(screen.getByRole('radio', { name: '능동관' })).toBeChecked()

  // 전체로 되돌리면 지점 조건이 주소에서 빠지고, 이름만 건 목록으로 돌아간다(조금 전에 받은 것을 그대로 쓴다).
  await userEvent.click(screen.getByRole('radio', { name: '전체' }))
  await waitFor(() => expect(bodyRowNames()).toEqual(['김도윤', '김서연']))
  expect(router.state.location.search).toBe('')
  expect(studentQueries()).toEqual([
    'page=0',
    `name=${KIM}&page=0`,
    `campusId=2&name=${KIM}&page=0`,
  ])
})

test('이름을 치다 말고 지점을 고르면 입력칸에 보이는 이름도 함께 적용한다', async () => {
  mockStudents(() => pageOf([doyun]))
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  await userEvent.type(screen.getByLabelText(TERM), '김')
  await userEvent.click(screen.getByRole('radio', { name: '동탄관' }))

  // 입력칸에는 "김"이 보이는데 목록은 이름 조건 없이 나오면, 화면의 조건과 목록이 어긋난다.
  await waitFor(() => expect(studentQueries().at(-1)).toBe(`campusId=1&name=${KIM}&page=0`))
})

test('이름에 &, #, ?, 공백이 있어도 한 조건으로, 주소가 아니라 본문으로 보낸다', async () => {
  mockStudents(() => pageOf([]))
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { name: '등록된 학생이 없어요' })

  await search('a&b#c d?e=1')

  await waitFor(() => expect(studentQueries()).toHaveLength(2))
  expect(requestOf(SEARCH).body).toEqual({ name: 'a&b#c d?e=1', page: 0 })
  // 이름이 요청 주소에 실리지 않는다. 주소는 조건과 무관하게 같다.
  expect(requests().filter((key) => key.includes('/students'))).toEqual([SEARCH, SEARCH])
})

test('찾는 학생이 없으면 조건 때문임을 알리고 이름 찾는 법을 안내한다', async () => {
  mockStudents((conditions) => pageOf(conditions.has('name') ? [] : [doyun]))
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  await search('철수')

  expect(
    await screen.findByRole('heading', { name: '조건에 맞는 학생이 없어요' }),
  ).toBeInTheDocument()
  expect(screen.getByText(/이름은 앞부분부터 입력해야 찾을 수 있어요/)).toBeInTheDocument()
})

// ── 조건을 바꾸는 동안 ───────────────────────────────────

test('빈 결과를 보다가 조건을 바꾸면, 새 결과를 받는 동안 학생이 없다고 하지 않는다', async () => {
  const { held, release } = hold()
  mockStudents(async (conditions) => {
    if (conditions.has('campusId')) return pageOf([])
    // 지점 조건을 지운 요청은 붙잡아 둔다.
    await held
    return pageOf([doyun])
  })
  renderApp(`${PATH}?campusId=2`, { me: staff })
  await screen.findByRole('heading', { name: '조건에 맞는 학생이 없어요' })

  await userEvent.click(screen.getByRole('radio', { name: '전체' }))

  // 이전 조건의 "없어요"가 새 조건의 답처럼 남아 있으면, 없는 줄 알고 중복 등록한다.
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('불러오고 있어요'))
  expect(screen.queryByRole('heading', { name: /학생이 없어요/ })).not.toBeInTheDocument()

  release()
  await waitFor(() => expect(bodyRowNames()).toEqual(['김도윤']))
})

test('지점이나 이름을 바꾸면, 새 결과를 받는 동안 이전 조건의 학생을 보여주지 않는다', async () => {
  const { held, release } = hold()
  mockStudents(async (conditions) => {
    if (conditions.get('campusId') === '2') {
      await held
      return pageOf([seoyeon])
    }
    return pageOf([doyun, minjun], { totalElements: 45, totalPages: 3 })
  })
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  await userEvent.click(screen.getByRole('radio', { name: '능동관' }))

  // 능동관이 선택돼 있는데 다른 지점 학생이 보이면 그 지점 학생으로 착각한다.
  await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument())
  expect(screen.queryByText('전체 45명')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('불러오고 있어요')

  release()
  await waitFor(() => expect(bodyRowNames()).toEqual(['김서연']))
  expect(screen.getByText('전체 1명')).toBeInTheDocument()
})

test('조건을 바꾼 뒤 새 요청이 실패하면 이전 조건의 목록을 남기지 않고, 다시 불러와도 되살리지 않는다', async () => {
  const second = hold()
  let campus2Requests = 0
  mockStudents(async (conditions) => {
    if (conditions.get('campusId') !== '2') return pageOf([doyun])
    campus2Requests += 1
    // 다시 불러오기로 보낸 요청은 붙잡아 둔다.
    if (campus2Requests > 1) await second.held
    return problemResponse(403, { detail: '권한이 없습니다.' })
  })
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  await userEvent.click(screen.getByRole('radio', { name: '능동관' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
  await waitFor(() => expect(campus2Requests).toBe(2))
  // 다시 받는 동안 전체 지점의 옛 목록이 능동관 필터 아래에 나타나면 안 된다.
  expect(screen.queryByText('김도윤')).not.toBeInTheDocument()

  second.release()
  expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
})

test('먼저 보낸 요청이 늦게 끝나도 나중 조건의 결과를 덮지 않는다', async () => {
  const slow = hold()
  mockStudents(async (conditions) => {
    if (conditions.get('campusId') === '1') {
      await slow.held
      return pageOf([doyun])
    }
    if (conditions.get('campusId') === '2') return pageOf([seoyeon])
    return pageOf([minjun])
  })
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  await userEvent.click(screen.getByRole('radio', { name: '동탄관' }))
  await userEvent.click(screen.getByRole('radio', { name: '능동관' }))
  await waitFor(() => expect(bodyRowNames()).toEqual(['김서연']))

  slow.release()
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(bodyRowNames()).toEqual(['김서연'])
  expect(screen.getByRole('radio', { name: '능동관' })).toBeChecked()
})

// ── 페이지 ───────────────────────────────────────────────

test('다음을 누르면 다음 페이지를 요청하고, 받는 동안 이전 페이지를 흐리게 보여준다', async () => {
  const { held, release } = hold()
  mockStudents(async (conditions) => {
    if (conditions.get('page') === '1') {
      await held
      return pageOf([minjun], { page: 1, totalPages: 2, totalElements: 3 })
    }
    return pageOf([doyun, seoyeon], { totalPages: 2, totalElements: 3 })
  })
  const { router } = renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })
  const pages = screen.getByRole('navigation', { name: '페이지' })
  expect(pages).toHaveTextContent('1 / 2')
  expect(within(pages).getByRole('button', { name: '이전' })).toBeDisabled()

  await userEvent.click(within(pages).getByRole('button', { name: '다음' }))

  // 같은 조건의 다음 페이지라 표가 사라졌다 나타나지 않는다. 숫자까지 함께 흐리게 해서 아직 이전 페이지임을 알린다.
  await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).toBeDisabled())
  expect(bodyRowNames()).toEqual(['김도윤', '김서연'])
  const busy = screen.getByRole('table').closest('[aria-busy="true"]') as HTMLElement
  expect(busy).toHaveClass('opacity-60')
  expect(within(busy).getByText('전체 3명')).toBeInTheDocument()
  expect(router.state.location.search).toBe('?page=1')

  release()
  await waitFor(() => expect(bodyRowNames()).toEqual(['박민준']))
  expect(screen.getByRole('navigation', { name: '페이지' })).toHaveTextContent('2 / 2')
  expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '이전' })).toBeEnabled()
  expect(screen.getByRole('table').closest('[aria-busy="true"]')).toBeNull()

  // 이전으로 돌아오면 받아 둔 페이지를 다시 요청하지 않고 보여준다.
  await userEvent.click(screen.getByRole('button', { name: '이전' }))
  await waitFor(() => expect(bodyRowNames()).toEqual(['김도윤', '김서연']))
  expect(studentQueries()).toEqual(['page=0', 'page=1'])
})

test('주소의 지점과 페이지를 그대로 요청에 싣는다', async () => {
  mockStudents((conditions) =>
    pageOf([seoyeon], { page: Number(conditions.get('page')), totalPages: 3, totalElements: 45 }),
  )
  renderApp(`${PATH}?campusId=2&page=1`, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  expect(studentQueries()).toEqual(['campusId=2&page=1'])
  expect(screen.getByRole('navigation', { name: '페이지' })).toHaveTextContent('2 / 3')
})

test('지점을 바꾸면 첫 페이지부터 다시 본다', async () => {
  mockStudents((conditions) =>
    pageOf([doyun], { page: Number(conditions.get('page')), totalPages: 3, totalElements: 45 }),
  )
  const { router } = renderApp(`${PATH}?page=2`, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })
  expect(screen.getByRole('navigation', { name: '페이지' })).toHaveTextContent('3 / 3')

  await userEvent.click(await screen.findByRole('radio', { name: '동탄관' }))

  await waitFor(() => expect(studentQueries().at(-1)).toBe('campusId=1&page=0'))
  expect(router.state.location.search).toBe('?campusId=1')
})

test('페이지가 하나뿐이면 페이지 넘기기를 보여주지 않는다', async () => {
  mockStudents(() => pageOf([doyun]))
  renderApp(PATH, { me: staff })
  await screen.findByRole('table', { name: '학생 목록' })

  expect(screen.queryByRole('navigation', { name: '페이지' })).not.toBeInTheDocument()
})

test('없는 페이지로 들어오면 학생이 없다고 하지 않고 첫 페이지로 안내한다', async () => {
  // 범위를 벗어난 페이지에 서버는 빈 목록과 실제 학생 수를 준다.
  mockStudents((conditions) =>
    conditions.get('page') === '9'
      ? pageOf([], { page: 9, totalPages: 3, totalElements: 45 })
      : pageOf([doyun], { totalPages: 3, totalElements: 45 }),
  )
  const { router } = renderApp(`${PATH}?campusId=1&page=9`, { me: staff })

  expect(
    await screen.findByRole('heading', { name: '이 페이지에는 학생이 없어요' }),
  ).toBeInTheDocument()
  expect(screen.getByText('조건에 맞는 학생은 모두 45명이에요.')).toBeInTheDocument()
  // 45명이 있는데 없다고 하면, 없는 줄 알고 중복 등록한다.
  expect(
    screen.queryByRole('heading', { name: /등록된 학생이 없어요|조건에 맞는 학생이 없어요/ }),
  ).toBeNull()

  await userEvent.click(screen.getByRole('button', { name: '첫 페이지로' }))

  expect(await screen.findByRole('table', { name: '학생 목록' })).toBeInTheDocument()
  // 보던 지점은 유지한다.
  expect(router.state.location.search).toBe('?campusId=1')
})

test.each(['abc', '-1', '1.5', '', '1e3', '0x10', ' 2 ', '99999999999'])(
  '주소의 page가 "%s"처럼 숫자만으로 된 값이 아니면 첫 페이지로 본다',
  async (page) => {
    mockStudents(() => pageOf([doyun]))
    renderApp(`${PATH}?page=${encodeURIComponent(page)}`, { me: staff })
    await screen.findByRole('table', { name: '학생 목록' })

    expect(studentQueries()).toEqual(['page=0'])
  },
)

test.each(['xyz', '0', '-2', '1e3', '2.0'])(
  '주소의 campusId가 "%s"처럼 지점 번호가 아니면 전 지점으로 본다',
  async (campusId) => {
    mockStudents(() => pageOf([doyun]))
    renderApp(`${PATH}?campusId=${campusId}`, { me: staff })
    await screen.findByRole('table', { name: '학생 목록' })

    expect(studentQueries()).toEqual(['page=0'])
    expect(screen.getByRole('radio', { name: '전체' })).toBeChecked()
  },
)

// ── 요청 번호 ─────────────────────────────────────────────

test('목록을 읽지 못하면 안내 아래에 요청 번호를 보여준다. 권한이 없다는 답에는 붙이지 않는다', async () => {
  let forbidden = false
  mockStudents(() =>
    forbidden
      ? problemResponse(403, {
          detail: '권한이 없습니다.',
          code: 'COMMON_FORBIDDEN',
          requestId: '2d6a6e90a9d04a16bb607aa43840f2d7',
        })
      : unreadableResponse('2d6a6e90a9d04a16bb607aa43840f2d7'),
  )
  renderApp(PATH, { me: staff })

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '문의할 때 이 번호를 알려 주세요: 2d6a6e90a9d04a16bb607aa43840f2d7',
  )

  forbidden = true
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('권한이 없습니다.'))
  expect(screen.getByRole('alert')).not.toHaveTextContent('문의할 때')
})

test.each([
  ['반만 읽지 못하면 반 쪽의', 'ok', '9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a49'],
  [
    '둘 다 읽지 못하면 지점 쪽의',
    '4b1d6c0e2f3a4b5c6d7e8f9012345678',
    '4b1d6c0e2f3a4b5c6d7e8f9012345678',
  ],
])('지점·반 이름을 %s 요청 번호를 보여준다', async (_case, campusId, shown) => {
  mockApi({
    'GET /api/v1/campuses': () =>
      campusId === 'ok' ? jsonResponse(campuses) : unreadableResponse(campusId),
    'GET /api/v1/classes': () => unreadableResponse('9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a49'),
    [SEARCH]: () => jsonResponse(pageOf([doyun])),
  })
  renderApp(PATH, { me: staff })

  const notice = await screen.findByText(/지점·반 이름을 불러오지 못했어요/)
  expect(notice.closest('[role="alert"]')).toHaveTextContent(
    `문의할 때 이 번호를 알려 주세요: ${shown}`,
  )
})
