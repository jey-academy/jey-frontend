import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { setupDialog } from '@/test/dialog'
import {
  jsonResponse,
  mockApi,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
  unauthenticated,
} from '@/test/mockApi'
import { admin, partner, renderApp, staff } from '@/test/renderApp'
import type { DiscountType } from '../api'

setupMockApi()
setupDialog()

const PATH = '/admin/settings/discount-types'

const sibling5: DiscountType = {
  id: 1,
  code: 'SIBLING_5',
  name: '형제 할인 5%',
  rate: 0.05,
  active: true,
}
const pass: DiscountType = {
  id: 2,
  code: 'DONGTAN_PASS',
  name: '동탄고 패스',
  rate: 0.1,
  active: true,
}
const retired: DiscountType = {
  id: 3,
  code: 'OPENING_EVENT',
  name: '개원 기념',
  rate: 0.0725,
  active: false,
}

/** 목록 조회를 흉내 낸다. 호출할 때마다 `rows`의 지금 값을 돌려준다. */
function mockList(rows: DiscountType[]) {
  mockApi({ 'GET /api/v1/discount-types': () => jsonResponse(rows) })
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

function cellsOf(name: string) {
  return within(screen.getByRole('row', { name: new RegExp(name) }))
    .getAllByRole('cell')
    .slice(0, 4)
    .map((cell) => cell.textContent)
}

async function openCreateForm() {
  await screen.findByRole('table', { name: '할인 유형' })
  await userEvent.click(screen.getAllByRole('button', { name: '할인 유형 등록' })[0])
  return screen.findByRole('dialog', { name: '할인 유형 등록' })
}

async function openEditForm(name: string) {
  await screen.findByRole('table', { name: '할인 유형' })
  await userEvent.click(screen.getByRole('button', { name: `${name} 수정` }))
  return screen.findByRole('dialog', { name: '할인 유형 수정' })
}

async function fill(dialog: HTMLElement, label: string, value: string) {
  const input = within(dialog).getByLabelText(label)
  await userEvent.clear(input)
  if (value) await userEvent.type(input, value)
}

function save(dialog: HTMLElement) {
  return userEvent.click(within(dialog).getByRole('button', { name: '저장' }))
}

function waitUntilClosed() {
  return waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

// ── 들어가기 ─────────────────────────────────────────────

test('설정 메뉴에서 할인 유형으로 오갈 수 있고, 지금 화면의 항목이 표시된다', async () => {
  mockList([sibling5])
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse([{ id: 1, name: '동탄관' }]),
    'GET /api/v1/class-fees': () => jsonResponse([]),
  })
  const { router } = renderApp('/admin/settings/classes', { me: admin })
  const menu = await screen.findByRole('navigation', { name: '설정 메뉴' })
  expect(within(menu).getByRole('link', { name: '반·수강료표' })).toHaveAttribute(
    'aria-current',
    'page',
  )

  await userEvent.click(within(menu).getByRole('link', { name: '할인 유형' }))

  expect(await screen.findByRole('heading', { level: 1, name: '할인 유형' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe(PATH)
  expect(within(menu).getByRole('link', { name: '할인 유형' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  // 위쪽 메뉴의 설정 탭도 선택된 채로 남는다.
  expect(screen.getByRole('link', { name: '설정' })).toHaveAttribute('aria-current', 'page')
})

test.each([
  ['직원', staff],
  ['연계 학원', partner],
])('%s은 이 화면을 볼 수 없고 목록을 요청하지도 않는다', async (_name, me) => {
  renderApp(PATH, { me })

  expect(
    await screen.findByRole('heading', { name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expect(requests()).toEqual([])
})

// ── 목록 ─────────────────────────────────────────────────

test('할인율을 퍼센트로 보여주고 꺼진 할인도 함께 보여준다', async () => {
  mockList([sibling5, pass, retired])
  renderApp(PATH, { me: admin })
  await screen.findByRole('table', { name: '할인 유형' })

  // 서버 값은 비율이다(0.05, 0.1, 0.0725).
  expect(cellsOf('형제 할인')).toEqual(['형제 할인 5%', 'SIBLING_5', '5%', '사용 중'])
  expect(cellsOf('동탄고 패스')).toEqual(['동탄고 패스', 'DONGTAN_PASS', '10%', '사용 중'])
  expect(cellsOf('개원 기념')).toEqual(['개원 기념', 'OPENING_EVENT', '7.25%', '꺼짐'])
  expect(screen.getByText('사용 중인 할인 2개, 꺼진 할인 1개')).toBeInTheDocument()
})

test('할인 유형이 하나도 없으면 안내와 등록 버튼을 보여준다', async () => {
  mockList([])
  renderApp(PATH, { me: admin })

  expect(
    await screen.findByRole('heading', { name: '등록된 할인 유형이 없어요' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('목록을 불러오지 못하면 서버가 준 안내를 보여주고, 그동안 등록은 막으며, 다시 불러올 수 있다', async () => {
  let fail = true
  mockApi({
    // 실제로는 연결 실패나 5xx다. 재시도 대기를 피하려고 재시도하지 않는 상태 코드를 쓴다.
    'GET /api/v1/discount-types': () =>
      fail ? problemResponse(403, { detail: '권한이 없습니다.' }) : jsonResponse([sibling5]),
  })
  renderApp(PATH, { me: admin })

  expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
  expect(screen.getByRole('button', { name: '할인 유형 등록' })).toBeDisabled()

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
  expect(await screen.findByRole('table', { name: '할인 유형' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

// ── 등록 ─────────────────────────────────────────────────

test('퍼센트로 입력한 할인율을 비율로 바꿔 보내고, 창을 닫고, 목록을 다시 불러온다', async () => {
  const rows = [sibling5]
  mockList(rows)
  mockApi({
    'POST /api/v1/discount-types': ({ body }) => {
      const created: DiscountType = {
        id: 9,
        active: true,
        ...(body as Omit<DiscountType, 'id' | 'active'>),
      }
      rows.push(created)
      return jsonResponse(created, 201)
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()

  // 소문자로 쳐도 대문자로 바뀐다.
  await fill(dialog, '코드', 'sibling_7')
  await fill(dialog, '이름', '형제 할인 7.25%')
  await fill(dialog, '할인율 (%)', '7.25')
  await save(dialog)

  expect(await screen.findByRole('row', { name: /형제 할인 7\.25%/ })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  // 7.25를 100으로 나누면 0.07250000000000001이 될 수 있다. 정확히 0.0725여야 서버가 받는다.
  expect(requestOf('POST /api/v1/discount-types').body).toEqual({
    code: 'SIBLING_7',
    name: '형제 할인 7.25%',
    rate: 0.0725,
  })
  expect(cellsOf('형제 할인 7\\.25%')[2]).toBe('7.25%')
})

test('할인율을 입력하면 읽은 값을 칸 아래에 보여준다', async () => {
  mockList([sibling5])
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()
  const rate = within(dialog).getByLabelText('할인율 (%)')

  expect(rate).toHaveAccessibleDescription('퍼센트로 입력해요. 예: 5')
  await userEvent.type(rate, '5')
  expect(rate).toHaveAccessibleDescription('5% 할인')
  // 비율(0.05)로 잘못 넣으면 저장하기 전에 알아챌 수 있다.
  await userEvent.clear(rate)
  await userEvent.type(rate, '0.05')
  expect(rate).toHaveAccessibleDescription('0.05% 할인')
})

test.each([
  ['', '할인율을 입력해 주세요.'],
  ['오', '퍼센트 숫자로 입력해 주세요. 소수 둘째 자리까지 쓸 수 있어요. 예: 5'],
  ['5.123', '퍼센트 숫자로 입력해 주세요. 소수 둘째 자리까지 쓸 수 있어요. 예: 5'],
])('할인율이 "%s"이면 보내지 않고 그 칸에 안내한다', async (value, message) => {
  mockList([sibling5])
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()

  await fill(dialog, '코드', 'NEW_ONE')
  await fill(dialog, '이름', '새 할인')
  await fill(dialog, '할인율 (%)', value)
  await save(dialog)

  expect(within(dialog).getByLabelText('할인율 (%)')).toHaveAccessibleDescription(message)
  expect(count('POST /api/v1/discount-types')).toBe(0)
})

test('같은 코드가 이미 있으면 코드 칸에 안내한다', async () => {
  mockList([sibling5])
  mockApi({
    'POST /api/v1/discount-types': () =>
      problemResponse(409, {
        detail: '같은 코드의 할인 유형이 이미 있습니다.',
        code: 'CAMPUS_DISCOUNT_CODE_DUPLICATED',
      }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()

  await fill(dialog, '코드', 'SIBLING_5')
  await fill(dialog, '이름', '형제 할인')
  await fill(dialog, '할인율 (%)', '5')
  await save(dialog)

  await waitFor(() =>
    expect(within(dialog).getByLabelText('코드')).toHaveAccessibleDescription(
      '같은 코드의 할인 유형이 이미 있습니다.',
    ),
  )
  expect(within(dialog).getByLabelText('이름')).toHaveValue('형제 할인')
})

test('서버가 입력값을 거부하면 해당 칸 아래에 서버가 준 문구를 보여준다', async () => {
  mockList([sibling5])
  mockApi({
    'POST /api/v1/discount-types': () =>
      problemResponse(400, {
        detail: '입력값이 올바르지 않습니다.',
        code: 'COMMON_VALIDATION_FAILED',
        errors: [
          { field: 'code', message: '대문자로 시작하는 대문자·숫자·밑줄 2~30자여야 합니다' },
          { field: 'rate', message: '1 이하여야 합니다' },
        ],
      }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()

  await fill(dialog, '코드', '5X')
  await fill(dialog, '이름', '이상한 할인')
  // 100%를 넘는 값도 형식은 맞으므로 보낸다. 받을지는 서버가 판단한다.
  await fill(dialog, '할인율 (%)', '150')
  await save(dialog)

  await waitFor(() =>
    expect(within(dialog).getByLabelText('할인율 (%)')).toHaveAccessibleDescription(
      '1 이하여야 합니다',
    ),
  )
  expect(within(dialog).getByLabelText('코드')).toHaveAccessibleDescription(
    '대문자로 시작하는 대문자·숫자·밑줄 2~30자여야 합니다',
  )
  expect(requestOf('POST /api/v1/discount-types').body).toMatchObject({ rate: 1.5 })
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
})

test('응답을 받지 못하면 저장됐을 수 있다고 알리고, 다시 보내지 않으며 목록을 다시 받는다', async () => {
  mockList([sibling5])
  mockApi({
    'POST /api/v1/discount-types': () => {
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()

  await fill(dialog, '코드', 'NEW_ONE')
  await fill(dialog, '이름', '새 할인')
  await fill(dialog, '할인율 (%)', '3')
  await save(dialog)

  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent('저장됐을 수도 있으니')
  expect(count('POST /api/v1/discount-types')).toBe(1)
  await waitFor(() => expect(count('GET /api/v1/discount-types')).toBe(2))
})

// ── 수정 ─────────────────────────────────────────────────

test('수정 창은 지금 값으로 채워져 있고 코드는 바꿀 수 없다', async () => {
  mockList([sibling5, retired])
  renderApp(PATH, { me: admin })

  const dialog = await openEditForm('개원 기념')

  expect(within(dialog).getByLabelText('코드')).toBeDisabled()
  expect(within(dialog).getByLabelText('코드')).toHaveValue('OPENING_EVENT')
  expect(within(dialog).getByLabelText('이름')).toHaveValue('개원 기념')
  // 서버의 0.0725를 퍼센트 숫자로 보여준다.
  expect(within(dialog).getByLabelText('할인율 (%)')).toHaveValue('7.25')
  expect(within(dialog).getByRole('radio', { name: '꺼짐' })).toBeChecked()
})

test('여러 할인 중 하나를 고치면 그 할인의 주소로 코드 없이 통째로 보낸다', async () => {
  mockList([sibling5, pass, retired])
  mockApi({ 'PUT /api/v1/discount-types/2': () => jsonResponse(pass) })
  renderApp(PATH, { me: admin })
  const dialog = await openEditForm('동탄고 패스')

  await fill(dialog, '할인율 (%)', '12.5')
  await save(dialog)

  await waitUntilClosed()
  expect(requests().filter((key) => key.startsWith('PUT '))).toEqual([
    'PUT /api/v1/discount-types/2',
  ])
  expect(requestOf('PUT /api/v1/discount-types/2').body).toEqual({
    name: '동탄고 패스',
    rate: 0.125,
    active: true,
  })
})

test('할인율을 건드리지 않고 저장하면 받은 비율 그대로 보낸다', async () => {
  mockList([retired])
  mockApi({ 'PUT /api/v1/discount-types/3': () => jsonResponse(retired) })
  renderApp(PATH, { me: admin })
  const dialog = await openEditForm('개원 기념')

  await fill(dialog, '이름', '개원 기념 할인')
  await save(dialog)

  await waitUntilClosed()
  // 퍼센트로 바꿨다가 되돌리는 동안 값이 달라지면 안 된다. 꺼진 상태도 그대로다.
  expect(requestOf('PUT /api/v1/discount-types/3').body).toEqual({
    name: '개원 기념 할인',
    rate: 0.0725,
    active: false,
  })
})

test('할인을 끄면 목록에 꺼짐으로 반영한다', async () => {
  const rows = [sibling5]
  mockList(rows)
  mockApi({
    'PUT /api/v1/discount-types/1': ({ body }) => {
      rows[0] = { ...sibling5, ...(body as Partial<DiscountType>) }
      return jsonResponse(rows[0])
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await openEditForm('형제 할인 5%')

  await userEvent.click(within(dialog).getByRole('radio', { name: '꺼짐' }))
  await save(dialog)

  await waitUntilClosed()
  await waitFor(() => expect(cellsOf('형제 할인')[3]).toBe('꺼짐'))
  expect(screen.getByText('사용 중인 할인 0개, 꺼진 할인 1개')).toBeInTheDocument()
})

test('수정이 실패하면 창을 닫지 않고 서버가 준 안내를 보여주며 입력값을 남긴다', async () => {
  mockList([sibling5])
  mockApi({
    'PUT /api/v1/discount-types/1': () =>
      problemResponse(404, {
        detail: '할인 유형을 찾을 수 없습니다.',
        code: 'CAMPUS_DISCOUNT_TYPE_NOT_FOUND',
      }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await openEditForm('형제 할인 5%')

  await fill(dialog, '할인율 (%)', '6')
  await save(dialog)

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '할인 유형을 찾을 수 없습니다.',
  )
  expect(within(dialog).getByLabelText('할인율 (%)')).toHaveValue('6')
  await waitFor(() => expect(count('GET /api/v1/discount-types')).toBe(2))
})

test('저장하는 동안에는 다시 누르거나 창을 닫을 수 없다', async () => {
  let respond!: (response: Response) => void
  mockList([sibling5])
  mockApi({
    'PUT /api/v1/discount-types/1': () => new Promise<Response>((resolve) => (respond = resolve)),
  })
  renderApp(PATH, { me: admin })
  const dialog = await openEditForm('형제 할인 5%')

  await save(dialog)

  const button = await within(dialog).findByRole('button', { name: '저장하는 중' })
  expect(button).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: '취소' })).toBeDisabled()
  // Esc를 눌렀을 때 브라우저가 보내는 이벤트
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('dialog', { name: '할인 유형 수정' })).toBeInTheDocument()
  expect(count('PUT /api/v1/discount-types/1')).toBe(1)

  respond(jsonResponse(sibling5))
  await waitUntilClosed()
})

test('저장하는 동안 세션이 끊기면(401) 로그인 화면으로 보낸다', async () => {
  mockList([sibling5])
  mockApi({ 'PUT /api/v1/discount-types/1': unauthenticated })
  const { router } = renderApp(PATH, { me: admin })

  await save(await openEditForm('형제 할인 5%'))

  expect(await screen.findByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument()
  expect(router.state.location.state).toEqual({ from: PATH })
})
