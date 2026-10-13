import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { Campus } from '@/shared/campus'
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
import { admin, renderApp } from '@/test/renderApp'
import type { ClassFee } from '../api'

// 저장이 실패하거나 응답이 끊기는 경우, 여러 반·꺼진 반을 고치는 경우처럼
// 금액이 틀리게 저장되거나 저장 결과가 틀리게 보일 수 있는 상황을 모았다. 기본 흐름은 ClassesPage.test.tsx에 있다.

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

function mockLists(rows: ClassFee[]) {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/class-fees': () => jsonResponse(rows),
  })
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

async function openCreateForm() {
  await screen.findByRole('table', { name: '반·수강료표' })
  await userEvent.click(screen.getAllByRole('button', { name: '반 등록' })[0])
  return screen.findByRole('dialog', { name: '반 등록' })
}

async function openEditForm(name: string) {
  await screen.findByRole('table', { name: '반·수강료표' })
  await userEvent.click(screen.getByRole('button', { name: `${name} 수정` }))
  return screen.findByRole('dialog', { name: '반 수정' })
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

// ── 금액 입력 ────────────────────────────────────────────

test('쉼표 위치가 틀린 금액(280,00)은 짐작해서 보내지 않는다', async () => {
  mockLists([middle1])
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()

  await fill(dialog, '반 이름', '중3 심화')
  await fill(dialog, '수강료 (8회 기준)', '280,00')
  await save(dialog)

  expect(within(dialog).getByLabelText('수강료 (8회 기준)')).toBeInvalid()
  expect(count('POST /api/v1/classes')).toBe(0)
})

test('금액을 입력하면 읽은 금액을 칸 아래에 보여준다', async () => {
  mockLists([middle1])
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()
  const fee = within(dialog).getByLabelText('수강료 (8회 기준)')

  expect(fee).toHaveAccessibleDescription('예: 280,000')
  await userEvent.type(fee, '28000')
  // 0을 하나 빠뜨린 것을 저장하기 전에 눈으로 알아챌 수 있다.
  expect(fee).toHaveAccessibleDescription('28,000원')
  await userEvent.type(fee, '0')
  expect(fee).toHaveAccessibleDescription('280,000원')
})

// ── 어느 반을 고치는가 ───────────────────────────────────

test('여러 반 중 하나를 고치면 그 반의 주소로 그 반의 값을 보낸다', async () => {
  mockLists([high1, middle1, closed])
  mockApi({ 'PUT /api/v1/classes/10': () => jsonResponse(middle1) })
  renderApp(PATH, { me: admin })
  await screen.findByRole('table', { name: '반·수강료표' })
  // 지점을 골라 줄 순서가 달라진 상태에서도 누른 반이 대상이어야 한다.
  await userEvent.click(screen.getByRole('radio', { name: '동탄관' }))

  const dialog = await openEditForm('중1 정규')
  expect(within(dialog).getByLabelText('수강료 (8회 기준)')).toHaveValue('280000')
  await save(dialog)

  await waitUntilClosed()
  expect(requests().filter((key) => key.startsWith('PUT '))).toEqual(['PUT /api/v1/classes/10'])
  expect(requestOf('PUT /api/v1/classes/10').body).toEqual({
    name: '중1 정규',
    baseFee8: 280000,
    bookFee: 15000,
    active: true,
  })
})

test('꺼진 반의 금액만 고치면 꺼진 상태 그대로 보내고, 다시 켤 수도 있다', async () => {
  mockLists([closed])
  mockApi({ 'PUT /api/v1/classes/12': () => jsonResponse(closed) })
  renderApp(PATH, { me: admin })

  let dialog = await openEditForm('초6 예비')
  expect(within(dialog).getByRole('radio', { name: '꺼짐' })).toBeChecked()
  await fill(dialog, '교재비', '0')
  await save(dialog)

  await waitUntilClosed()
  expect(requestOf('PUT /api/v1/classes/12').body).toEqual({
    name: '초6 예비',
    baseFee8: 240000,
    bookFee: 0,
    active: false,
  })

  dialog = await openEditForm('초6 예비')
  await userEvent.click(within(dialog).getByRole('radio', { name: '운영 중' }))
  await save(dialog)

  await waitUntilClosed()
  expect(requestOf('PUT /api/v1/classes/12').body).toMatchObject({ active: true })
})

// ── 저장 실패 ────────────────────────────────────────────

test('수정이 실패하면 창을 닫지 않고 서버가 준 안내를 보여주며, 입력값을 남기고 목록을 다시 받는다', async () => {
  mockLists([middle1])
  mockApi({
    'PUT /api/v1/classes/10': () =>
      problemResponse(404, { detail: '반을 찾을 수 없습니다.', code: 'CAMPUS_CLASS_NOT_FOUND' }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await openEditForm('중1 정규')

  await fill(dialog, '수강료 (8회 기준)', '300000')
  await save(dialog)

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('반을 찾을 수 없습니다.')
  expect(within(dialog).getByLabelText('수강료 (8회 기준)')).toHaveValue('300000')
  expect(within(dialog).getByRole('button', { name: '저장' })).toBeEnabled()
  // 그 사이 반이 없어졌거나 바뀌었을 수 있으므로 목록은 다시 받는다.
  await waitFor(() => expect(count('GET /api/v1/class-fees')).toBe(2))
})

test('응답을 받지 못하면 저장됐을 수 있다고 알리고, 다시 보내지 않으며 목록을 다시 받는다', async () => {
  mockLists([middle1])
  mockApi({
    'POST /api/v1/classes': () => {
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()

  await fill(dialog, '반 이름', '중3 심화')
  await fill(dialog, '수강료 (8회 기준)', '320000')
  await save(dialog)

  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent('연결 상태를 확인해 주세요.')
  expect(alert).toHaveTextContent(
    '저장됐을 수도 있어요. 내용은 그대로 두고 다시 눌러 주세요. 두 번 저장되지 않아요.',
  )
  expect(alert).not.toHaveTextContent('목록을 먼저 확인')
  expect(within(dialog).getByLabelText('반 이름')).toHaveValue('중3 심화')
  // 다시 보내는 것은 직원이 누를 때만 한다.
  expect(count('POST /api/v1/classes')).toBe(1)
  await waitFor(() => expect(count('GET /api/v1/class-fees')).toBe(2))
})

test('수정은 멱등 키를 싣지 않으므로, 응답을 받지 못하면 목록을 먼저 확인하라고 알린다', async () => {
  mockLists([middle1])
  mockApi({
    'PUT /api/v1/classes/10': () => {
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await openEditForm('중1 정규')

  await save(dialog)

  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent('다시 저장하기 전에 목록을 먼저 확인해 주세요.')
  expect(alert).not.toHaveTextContent('두 번 저장되지 않아요')
  expect(requestOf('PUT /api/v1/classes/10').headers.get('Idempotency-Key')).toBeNull()
  await waitFor(() => expect(count('GET /api/v1/class-fees')).toBe(2))
})

test('응답을 받지 못한 뒤 그대로 다시 저장하면 같은 Idempotency-Key로 보낸다', async () => {
  let attempts = 0
  mockLists([middle1])
  mockApi({
    'POST /api/v1/classes': ({ body }) => {
      attempts += 1
      if (attempts === 1) throw new TypeError('Failed to fetch')
      return jsonResponse({ id: 20, active: true, ...(body as object) }, 201)
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()

  await fill(dialog, '반 이름', '중3 심화')
  await fill(dialog, '수강료 (8회 기준)', '320000')
  await save(dialog)
  await within(dialog).findByRole('alert')
  const firstKey = requestOf('POST /api/v1/classes').headers.get('Idempotency-Key')
  await save(dialog)

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(count('POST /api/v1/classes')).toBe(2)
  expect(firstKey).toMatch(/^[0-9a-f-]{36}$/)
  expect(requestOf('POST /api/v1/classes').headers.get('Idempotency-Key')).toBe(firstKey)
})

test('저장하는 동안 세션이 끊기면(401) 로그인 화면으로 보낸다', async () => {
  mockLists([middle1])
  mockApi({ 'PUT /api/v1/classes/10': unauthenticated })
  const { router } = renderApp(PATH, { me: admin })

  await save(await openEditForm('중1 정규'))

  expect(await screen.findByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
  expect(router.state.location.state).toEqual({ from: PATH })
})

test('이 폼에 없는 칸의 오류나 칸을 짚지 않은 오류도 버리지 않고 폼 아래에 보여준다', async () => {
  mockLists([middle1])
  mockApi({
    'POST /api/v1/classes': () =>
      problemResponse(400, {
        detail: '입력값이 올바르지 않습니다.',
        code: 'COMMON_VALIDATION_FAILED',
        errors: [
          { field: 'name', message: '공백일 수 없습니다' },
          { field: null, message: '수강료와 교재비를 함께 확인해 주세요.' },
          { field: 'active', message: '널이어서는 안됩니다' },
        ],
      }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()

  await fill(dialog, '수강료 (8회 기준)', '280000')
  await save(dialog)

  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent('수강료와 교재비를 함께 확인해 주세요.')
  expect(alert).toHaveTextContent('널이어서는 안됩니다')
  expect(within(dialog).getByLabelText('반 이름')).toHaveAccessibleDescription('공백일 수 없습니다')
})

test('서버 오류가 떠 있는 채로 금액을 잘못 고쳐 저장하면 지난 서버 오류는 지운다', async () => {
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
  await waitFor(() => expect(within(dialog).getByLabelText('반 이름')).toBeInvalid())

  await fill(dialog, '반 이름', '중1 심화')
  await fill(dialog, '수강료 (8회 기준)', '28만')
  await save(dialog)

  // 이름은 이미 고쳤다. 보내지 않은 입력에 지난번 서버 오류가 붙어 있으면 안 된다.
  expect(within(dialog).getByLabelText('반 이름')).not.toBeInvalid()
  expect(within(dialog).getByLabelText('수강료 (8회 기준)')).toBeInvalid()
  expect(count('POST /api/v1/classes')).toBe(1)
})

test('저장은 됐는데 목록을 다시 받지 못하면 창을 닫고, 표에는 저장한 값을 보여주며 최신이 아닐 수 있다고 알린다', async () => {
  let failList = false
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/class-fees': () =>
      // 재시도 대기를 피하려고 재시도하지 않는 상태 코드를 쓴다.
      failList ? problemResponse(403, { detail: '권한이 없습니다.' }) : jsonResponse([middle1]),
    'PUT /api/v1/classes/10': () => {
      failList = true
      return jsonResponse({ ...middle1, baseFee8: 300000 })
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await openEditForm('중1 정규')

  await fill(dialog, '수강료 (8회 기준)', '300000')
  await save(dialog)

  await waitUntilClosed()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '최신 내용을 불러오지 못했어요. 아래 표는 이전 내용일 수 있어요.',
  )
  // 저장한 줄은 응답으로 바로 바꿔 둔다. 옛 금액이 보이면 저장이 안 된 줄 알고 다시 저장하게 된다.
  // 다른 줄은 이전 내용일 수 있어 안내는 그대로 둔다.
  expect(screen.getByRole('row', { name: /300,000원/ })).toBeInTheDocument()
  expect(screen.queryByRole('row', { name: /280,000원/ })).not.toBeInTheDocument()
})

test('저장한 뒤 새 목록을 받을 때까지 창이 잠긴 채 남아 있고, 닫힐 때는 고친 값이 이미 보인다', async () => {
  let saved = false
  let respondList!: (response: Response) => void
  const refreshed = new Promise<Response>((resolve) => (respondList = resolve))
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/class-fees': () =>
      saved ? refreshed.then((response) => response.clone()) : jsonResponse([middle1]),
    'PUT /api/v1/classes/10': () => {
      saved = true
      return jsonResponse({ ...middle1, baseFee8: 300000 })
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await openEditForm('중1 정규')
  await fill(dialog, '수강료 (8회 기준)', '300000')
  await save(dialog)

  // 저장은 끝났고 목록을 기다리는 중이다.
  await waitFor(() => expect(count('GET /api/v1/class-fees')).toBe(2))
  expect(within(dialog).getByRole('button', { name: '저장하는 중' })).toBeDisabled()

  respondList(jsonResponse([{ ...middle1, baseFee8: 300000 }]))
  await waitUntilClosed()
  // 기다리지 않고 본다. 창이 먼저 닫히면 표가 잠깐 옛 값이라 저장이 안 된 줄 알고 다시 저장하게 된다.
  expect(screen.getByRole('row', { name: /300,000원/ })).toBeInTheDocument()
})

test('저장한 뒤 새 목록이 3초 넘게 오지 않으면 기다리지 않고 창을 닫는다. 표에는 저장한 값이 이미 있고, 다시 고쳐도 그 값으로 시작한다', async () => {
  // 시간을 가짜로 돌린다. 실제 시간도 흐르게 두어 화면의 기다림(waitFor)은 그대로 동작한다.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    let saved = false
    let respondList!: (response: Response) => void
    const refreshed = new Promise<Response>((resolve) => (respondList = resolve))
    mockApi({
      'GET /api/v1/campuses': () => jsonResponse(campuses),
      'GET /api/v1/class-fees': () =>
        saved ? refreshed.then((response) => response.clone()) : jsonResponse([middle1]),
      'PUT /api/v1/classes/10': () => {
        saved = true
        return jsonResponse({ ...middle1, baseFee8: 300000 })
      },
    })
    renderApp(PATH, { me: admin })
    const dialog = await openEditForm('중1 정규')
    await fill(dialog, '수강료 (8회 기준)', '300000')
    await save(dialog)
    await waitFor(() => expect(count('GET /api/v1/class-fees')).toBe(2))

    // 상한 전에는 기다린다. (정확한 경계는 waitForRefresh.test.ts가 본다. 여기서는 여유를 넉넉히 둔다.)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(within(dialog).getByRole('button', { name: '저장하는 중' })).toBeDisabled()

    // 저장은 이미 끝났다. 목록이 늦는다고 창을 잠가 두지 않는다.
    await vi.advanceTimersByTimeAsync(1_500)
    await waitUntilClosed()
    // 목록은 아직 받는 중이다(흐리게 + aria-busy). 그래도 저장한 줄은 응답으로 이미 바뀌어 있다.
    const scroller = screen.getByRole('table', { name: '반·수강료표' }).parentElement
    expect(scroller).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('row', { name: /300,000원/ })).toBeInTheDocument()

    // 바로 다시 고친다. 폼이 옛 값(280,000)으로 채워지면, 이름만 고쳐도 방금 저장한 수강료를 되돌린다.
    const again = await openEditForm('중1 정규')
    expect(within(again).getByLabelText('수강료 (8회 기준)')).toHaveValue('300000')
    await userEvent.click(within(again).getByRole('button', { name: '취소' }))

    respondList(jsonResponse([{ ...middle1, baseFee8: 300000 }]))

    await waitFor(() => expect(scroller).not.toHaveAttribute('aria-busy'))
    expect(screen.getByRole('row', { name: /300,000원/ })).toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})

// ── 창 닫기 ──────────────────────────────────────────────

test('저장하는 동안에는 취소나 Esc로 창을 닫을 수 없고, 실패하면 안내를 볼 수 있다', async () => {
  let respond!: (response: Response) => void
  mockLists([middle1])
  mockApi({
    'POST /api/v1/classes': () => new Promise<Response>((resolve) => (respond = resolve)),
  })
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()
  await fill(dialog, '반 이름', '중3 심화')
  await fill(dialog, '수강료 (8회 기준)', '320000')
  await save(dialog)

  const cancel = within(dialog).getByRole('button', { name: '취소' })
  await waitFor(() => expect(cancel).toBeDisabled())
  // Esc를 눌렀을 때 브라우저가 보내는 이벤트
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('dialog', { name: '반 등록' })).toBeInTheDocument()

  respond(problemResponse(400, { detail: '없는 지점입니다.', code: 'CAMPUS_INVALID_CAMPUS' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('없는 지점입니다.')
  expect(cancel).toBeEnabled()
})

test('배경을 눌러도 입력하던 내용이 사라지지 않는다', async () => {
  mockLists([middle1])
  renderApp(PATH, { me: admin })
  const dialog = await openCreateForm()
  await fill(dialog, '반 이름', '쓰던 이름')

  await userEvent.click(dialog)

  expect(screen.getByRole('dialog', { name: '반 등록' })).toBeInTheDocument()
  expect(within(dialog).getByLabelText('반 이름')).toHaveValue('쓰던 이름')
})

// ── 목록 ─────────────────────────────────────────────────

test('다른 지점을 보던 중에 등록하면 등록한 지점으로 옮겨 새 반을 보여준다', async () => {
  const rows = [middle1]
  mockLists(rows)
  mockApi({
    'POST /api/v1/classes': ({ body }) => {
      const created: ClassFee = {
        id: 21,
        active: true,
        ...(body as Omit<ClassFee, 'id' | 'active'>),
      }
      rows.push(created)
      return jsonResponse(created, 201)
    },
  })
  renderApp(PATH, { me: admin })
  await screen.findByRole('table', { name: '반·수강료표' })
  await userEvent.click(screen.getByRole('radio', { name: '동탄관' }))
  const dialog = await openCreateForm()

  await userEvent.selectOptions(within(dialog).getByLabelText('지점'), '능동관')
  await fill(dialog, '반 이름', '고2 정규')
  await fill(dialog, '수강료 (8회 기준)', '360000')
  await save(dialog)

  expect(await screen.findByRole('row', { name: /고2 정규/ })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: '능동관' })).toBeChecked()
})

test('고른 지점에 반이 없으면 전체가 빈 것과 다른 문구로 알린다', async () => {
  mockLists([middle1])
  renderApp(PATH, { me: admin })
  await screen.findByRole('table', { name: '반·수강료표' })

  await userEvent.click(screen.getByRole('radio', { name: '능동관' }))

  expect(
    screen.getByRole('heading', { name: '이 지점에는 등록된 반이 없어요' }),
  ).toBeInTheDocument()
})

test('지점 목록만 불러오지 못해도 안내와 다시 불러오기를 보여주고, 그동안 등록은 막는다', async () => {
  let fail = true
  mockApi({
    'GET /api/v1/campuses': () =>
      fail ? problemResponse(403, { detail: '권한이 없습니다.' }) : jsonResponse(campuses),
    'GET /api/v1/class-fees': () => jsonResponse([middle1]),
  })
  renderApp(PATH, { me: admin })

  expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '반 등록' })).toBeDisabled()

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
  expect(await screen.findByRole('table', { name: '반·수강료표' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('수강료표를 받기 전에는 등록 버튼을 누를 수 없다', async () => {
  let respond!: (response: Response) => void
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/class-fees': () => new Promise<Response>((resolve) => (respond = resolve)),
  })
  renderApp(PATH, { me: admin })

  expect(await screen.findByRole('status')).toHaveTextContent('수강료표를 불러오고 있어요.')
  await waitFor(() => expect(count('GET /api/v1/campuses')).toBe(1))
  expect(screen.getByRole('button', { name: '반 등록' })).toBeDisabled()

  respond(jsonResponse([middle1]))
  await screen.findByRole('table', { name: '반·수강료표' })
  expect(screen.getAllByRole('button', { name: '반 등록' })[0]).toBeEnabled()
})

test('반을 고치면 다른 화면이 쓰는 반 목록도 다시 받게 표시한다', async () => {
  mockLists([middle1])
  mockApi({ 'PUT /api/v1/classes/10': () => jsonResponse(middle1) })
  const { queryClient } = renderApp(PATH, { me: admin })
  // 학생 화면이 반 이름을 붙이려고 받아 둔 반 목록
  queryClient.setQueryData(['campus', 'classes'], [{ id: 10, campusId: 1, name: '중1 정규' }])
  const dialog = await openEditForm('중1 정규')

  await fill(dialog, '반 이름', '중1 심화')
  await save(dialog)

  await waitUntilClosed()
  // 그대로 두면 학생 화면에 최대 10분 동안 옛 반 이름이 보인다.
  expect(queryClient.getQueryState(['campus', 'classes'])?.isInvalidated).toBe(true)
})
