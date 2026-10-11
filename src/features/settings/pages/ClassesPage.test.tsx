import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
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
} from '@/test/mockApi'
import { admin, partner, renderApp, staff } from '@/test/renderApp'
import type { ClassFee } from '../api'

setupMockApi()
setupDialog()

const PATH = '/admin/settings/classes'

const campuses: Campus[] = [
  { id: 1, name: '동탄관' },
  { id: 2, name: '능동관' },
]

const middle1: ClassFee = {
  id: 10,
  campusId: 1,
  name: '중1 정규',
  baseFee8: 280000,
  bookFee: 15000,
  active: true,
}
const high1: ClassFee = {
  id: 11,
  campusId: 2,
  name: '고1 특강',
  baseFee8: 350000,
  bookFee: 0,
  active: true,
}
const closed: ClassFee = {
  id: 12,
  campusId: 1,
  name: '초6 예비',
  baseFee8: 240000,
  bookFee: 12000,
  active: false,
}

/** 지점과 수강료표 조회를 흉내 낸다. 목록은 호출할 때마다 `rows`의 지금 값을 돌려준다. */
function mockLists(rows: ClassFee[]) {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/class-fees': () => jsonResponse(rows),
  })
}

function rowOf(name: string) {
  return screen.getByRole('row', { name: new RegExp(name) })
}

function bodyRowNames() {
  const [, ...bodyRows] = screen.getAllByRole('row')
  return bodyRows.map((row) => within(row).getAllByRole('cell')[0].textContent)
}

async function openCreateForm() {
  await screen.findByRole('table', { name: '반·수강료표' })
  await userEvent.click(screen.getAllByRole('button', { name: '반 등록' })[0])
  return screen.findByRole('dialog', { name: '반 등록' })
}

async function fill(dialog: HTMLElement, label: string, value: string) {
  const input = within(dialog).getByLabelText(label)
  await userEvent.clear(input)
  if (value) await userEvent.type(input, value)
}

function save(dialog: HTMLElement) {
  return userEvent.click(within(dialog).getByRole('button', { name: '저장' }))
}

// ── 들어가기 ─────────────────────────────────────────────

test('관리자는 로그인하면 이 화면으로 오고 설정 탭이 선택된다', async () => {
  mockLists([middle1])
  mockApi({
    'GET /api/v1/auth/me': unauthenticated,
    'GET /api/v1/auth/csrf': noContent,
    'POST /api/v1/auth/login': () => jsonResponse(admin),
  })
  const { router } = renderApp('/login')

  await userEvent.type(await screen.findByLabelText('아이디'), 'admin')
  await userEvent.type(screen.getByLabelText('비밀번호'), 'correct-password')
  await userEvent.click(screen.getByRole('button', { name: '로그인' }))

  expect(await screen.findByRole('heading', { level: 1, name: '반·수강료표' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe(PATH)
  expect(screen.getByRole('link', { name: '설정' })).toHaveAttribute('aria-current', 'page')
})

test('/admin/settings로 오면 반·수강료표로 보낸다', async () => {
  mockLists([])
  const { router } = renderApp('/admin/settings', { me: admin })

  // 옮겨 간 화면이 목록을 다 받을 때까지 기다린다. 주소만 보고 끝내면 요청이 테스트가 끝난 뒤에 나간다.
  expect(await screen.findByRole('heading', { name: '등록된 반이 없어요' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe(PATH)
})

test.each([
  ['직원', staff],
  ['연계 학원', partner],
])('%s은 이 화면을 볼 수 없고 수강료표를 요청하지도 않는다', async (_name, me) => {
  renderApp(PATH, { me })

  expect(
    await screen.findByRole('heading', { name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expect(requests()).toEqual([])
})

// ── 목록 ─────────────────────────────────────────────────

test('반마다 지점, 수강료, 교재비, 상태를 보여주고 꺼진 반도 함께 보여준다', async () => {
  mockLists([middle1, high1, closed])
  renderApp(PATH, { me: admin })

  await screen.findByRole('table', { name: '반·수강료표' })
  const cells = (name: string) =>
    within(rowOf(name))
      .getAllByRole('cell')
      .slice(0, 5)
      .map((cell) => cell.textContent)

  expect(cells('중1 정규')).toEqual(['중1 정규', '동탄관', '280,000원', '15,000원', '운영 중'])
  expect(cells('고1 특강')).toEqual(['고1 특강', '능동관', '350,000원', '0원', '운영 중'])
  expect(cells('초6 예비')).toEqual(['초6 예비', '동탄관', '240,000원', '12,000원', '꺼짐'])
  expect(screen.getByText('운영 중인 반 2개, 꺼진 반 1개')).toBeInTheDocument()
})

test('지점을 고르면 그 지점의 반만 보여준다', async () => {
  mockLists([middle1, high1, closed])
  renderApp(PATH, { me: admin })
  await screen.findByRole('table', { name: '반·수강료표' })

  await userEvent.click(screen.getByRole('radio', { name: '능동관' }))
  expect(bodyRowNames()).toEqual(['고1 특강'])
  expect(screen.getByText('운영 중인 반 1개')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('radio', { name: '전체' }))
  expect(bodyRowNames()).toEqual(['중1 정규', '고1 특강', '초6 예비'])
  // 지점을 바꿀 때마다 서버에 다시 묻지 않는다.
  expect(requests().filter((key) => key === 'GET /api/v1/class-fees')).toHaveLength(1)
})

test('반이 하나도 없으면 안내와 등록 버튼을 보여준다', async () => {
  mockLists([])
  renderApp(PATH, { me: admin })

  expect(await screen.findByRole('heading', { name: '등록된 반이 없어요' })).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('수강료표를 불러오지 못하면 서버가 준 안내를 보여주고 다시 불러올 수 있다', async () => {
  let fail = true
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    // 실제로는 연결 실패나 5xx다. 재시도 대기를 피하려고 재시도하지 않는 상태 코드를 쓴다.
    'GET /api/v1/class-fees': () =>
      fail ? problemResponse(403, { detail: '권한이 없습니다.' }) : jsonResponse([middle1]),
  })
  renderApp(PATH, { me: admin })

  expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
  expect(await screen.findByRole('table', { name: '반·수강료표' })).toBeInTheDocument()
})

// ── 등록 ─────────────────────────────────────────────────

test('반을 등록하면 입력한 값을 보내고, 창을 닫고, 목록을 다시 불러온다', async () => {
  const rows = [middle1]
  mockLists(rows)
  mockApi({
    'POST /api/v1/classes': ({ body }) => {
      const created: ClassFee = {
        id: 20,
        active: true,
        ...(body as Omit<ClassFee, 'id' | 'active'>),
      }
      rows.push(created)
      return jsonResponse(created, 201)
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()

  await userEvent.selectOptions(within(dialog).getByLabelText('지점'), '능동관')
  await fill(dialog, '반 이름', '중3 심화')
  // 쉼표를 넣어 입력해도 숫자로 보낸다.
  await fill(dialog, '수강료 (8회 기준)', '320,000')
  await save(dialog)

  expect(await screen.findByRole('row', { name: /중3 심화/ })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(requestOf('POST /api/v1/classes').body).toEqual({
    campusId: 2,
    name: '중3 심화',
    baseFee8: 320000,
    bookFee: 0,
  })
  expect(requests().filter((key) => key === 'GET /api/v1/class-fees')).toHaveLength(2)
})

test('지점을 골라 둔 채로 등록을 열면 그 지점이 골라져 있다', async () => {
  mockLists([middle1, high1])
  renderApp(PATH, { me: admin })
  await screen.findByRole('table', { name: '반·수강료표' })
  await userEvent.click(screen.getByRole('radio', { name: '능동관' }))

  const dialog = await openCreateForm()

  expect(within(dialog).getByLabelText('지점')).toHaveDisplayValue('능동관')
})

test('금액에 숫자가 아닌 값을 넣으면 보내지 않고 그 칸에 안내한다', async () => {
  mockLists([middle1])
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()

  await fill(dialog, '반 이름', '중3 심화')
  await fill(dialog, '수강료 (8회 기준)', '삼십만원')
  await fill(dialog, '교재비', '')
  await save(dialog)

  expect(within(dialog).getByLabelText('수강료 (8회 기준)')).toHaveAccessibleDescription(
    '숫자로 입력해 주세요. 쉼표는 세 자리마다 찍어요. 예: 280,000',
  )
  expect(within(dialog).getByLabelText('교재비')).toHaveAccessibleDescription(
    '금액을 입력해 주세요.',
  )
  expect(requests()).not.toContain('POST /api/v1/classes')
})

test('서버가 입력값을 거부하면 해당 칸 아래에 서버가 준 문구를 보여주고 창을 닫지 않는다', async () => {
  mockLists([middle1])
  mockApi({
    'POST /api/v1/classes': () =>
      problemResponse(400, {
        detail: '입력값이 올바르지 않습니다.',
        code: 'COMMON_VALIDATION_FAILED',
        errors: [
          { field: 'name', message: '공백일 수 없습니다' },
          { field: 'baseFee8', message: '형식이 올바르지 않습니다.' },
        ],
      }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()

  await fill(dialog, '수강료 (8회 기준)', '1')
  await save(dialog)

  await waitFor(() =>
    expect(within(dialog).getByLabelText('반 이름')).toHaveAccessibleDescription(
      '공백일 수 없습니다',
    ),
  )
  expect(within(dialog).getByLabelText('수강료 (8회 기준)')).toHaveAccessibleDescription(
    '형식이 올바르지 않습니다.',
  )
  // 칸을 짚었으면 전체 문구는 되풀이하지 않는다.
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: '저장' })).toBeEnabled()
})

test('같은 이름의 반이 있으면 이름 칸에 안내한다', async () => {
  mockLists([middle1])
  mockApi({
    'POST /api/v1/classes': () =>
      problemResponse(409, {
        detail: '같은 지점에 같은 이름의 반이 이미 있습니다.',
        code: 'CAMPUS_CLASS_NAME_DUPLICATED',
      }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()

  await fill(dialog, '반 이름', '중1 정규')
  await fill(dialog, '수강료 (8회 기준)', '280000')
  await save(dialog)

  await waitFor(() =>
    expect(within(dialog).getByLabelText('반 이름')).toHaveAccessibleDescription(
      '같은 지점에 같은 이름의 반이 이미 있습니다.',
    ),
  )
})

test('어느 칸의 문제인지 알 수 없는 에러는 폼 아래에 보여준다', async () => {
  mockLists([middle1])
  mockApi({
    'POST /api/v1/classes': () =>
      problemResponse(400, {
        detail: '수강료는 0원보다 커야 하고, 수강료와 교재비는 1원 단위여야 합니다.',
        code: 'CAMPUS_INVALID_FEE',
      }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()

  await fill(dialog, '반 이름', '중3 심화')
  await fill(dialog, '수강료 (8회 기준)', '0')
  await save(dialog)

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('수강료는 0원보다 커야 하고')
})

test('취소하고 다시 열면 입력하던 값과 에러가 남아 있지 않다', async () => {
  mockLists([middle1])
  renderApp(PATH, { me: admin })
  let dialog = await openCreateForm()
  await fill(dialog, '반 이름', '쓰다 만 이름')
  await fill(dialog, '수강료 (8회 기준)', '숫자아님')
  await save(dialog)

  await userEvent.click(within(dialog).getByRole('button', { name: '취소' }))
  dialog = await openCreateForm()

  expect(within(dialog).getByLabelText('반 이름')).toHaveValue('')
  expect(within(dialog).getByLabelText('수강료 (8회 기준)')).toHaveValue('')
  expect(within(dialog).getByLabelText('수강료 (8회 기준)')).not.toBeInvalid()
})

// ── 수정 ─────────────────────────────────────────────────

test('수정 창은 지금 값으로 채워져 있고 지점은 바꿀 수 없다', async () => {
  mockLists([middle1])
  renderApp(PATH, { me: admin })
  await screen.findByRole('table', { name: '반·수강료표' })

  await userEvent.click(screen.getByRole('button', { name: '중1 정규 수정' }))
  const dialog = await screen.findByRole('dialog', { name: '반 수정' })

  expect(within(dialog).getByLabelText('지점')).toBeDisabled()
  expect(within(dialog).getByLabelText('지점')).toHaveDisplayValue('동탄관')
  expect(within(dialog).getByLabelText('반 이름')).toHaveValue('중1 정규')
  expect(within(dialog).getByLabelText('수강료 (8회 기준)')).toHaveValue('280000')
  expect(within(dialog).getByLabelText('교재비')).toHaveValue('15000')
  expect(within(dialog).getByRole('radio', { name: '운영 중' })).toBeChecked()
})

test('반을 고치면 바꾸지 않은 값까지 통째로 보내고 목록에 반영한다', async () => {
  const rows = [middle1]
  mockLists(rows)
  mockApi({
    'PUT /api/v1/classes/10': ({ body }) => {
      rows[0] = { ...middle1, ...(body as Partial<ClassFee>) }
      return jsonResponse(rows[0])
    },
  })
  renderApp(PATH, { me: admin })
  await screen.findByRole('table', { name: '반·수강료표' })
  await userEvent.click(screen.getByRole('button', { name: '중1 정규 수정' }))
  const dialog = await screen.findByRole('dialog', { name: '반 수정' })

  await fill(dialog, '수강료 (8회 기준)', '300000')
  await userEvent.click(within(dialog).getByRole('radio', { name: '꺼짐' }))
  await save(dialog)

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(requestOf('PUT /api/v1/classes/10').body).toEqual({
    name: '중1 정규',
    baseFee8: 300000,
    bookFee: 15000,
    active: false,
  })
  const cells = within(await screen.findByRole('row', { name: /300,000원/ })).getAllByRole('cell')
  expect(cells[4]).toHaveTextContent('꺼짐')
})

test('저장하는 동안에는 다시 누를 수 없다', async () => {
  let respond!: (response: Response) => void
  mockLists([middle1])
  mockApi({
    'PUT /api/v1/classes/10': () => new Promise<Response>((resolve) => (respond = resolve)),
  })
  renderApp(PATH, { me: admin })
  await screen.findByRole('table', { name: '반·수강료표' })
  await userEvent.click(screen.getByRole('button', { name: '중1 정규 수정' }))
  const dialog = await screen.findByRole('dialog', { name: '반 수정' })

  await save(dialog)

  const button = await within(dialog).findByRole('button', { name: '저장하는 중' })
  expect(button).toBeDisabled()
  await userEvent.click(button)
  expect(requests().filter((key) => key === 'PUT /api/v1/classes/10')).toHaveLength(1)

  respond(jsonResponse(middle1))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
