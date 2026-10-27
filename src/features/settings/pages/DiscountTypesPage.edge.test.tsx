import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { setupDialog } from '@/test/dialog'
import {
  jsonResponse,
  mockApi,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
} from '@/test/mockApi'
import { admin, renderApp } from '@/test/renderApp'
import type { DiscountType } from '../api'

// 저장 결과가 틀리게 보이거나, 앞에 쓰던 값이 다른 할인에 섞여 들어갈 수 있는 상황을 모았다.
// 기본 흐름은 DiscountTypesPage.test.tsx에 있다.

setupMockApi()
setupDialog()

const PATH = '/admin/settings/discount-types'

const sibling5: DiscountType = {
  id: 1,
  code: 'SIBLING_5',
  name: '형제 할인',
  rate: 0.05,
  active: true,
}
const pass: DiscountType = {
  id: 2,
  code: 'DONGTAN_PASS',
  name: '제이G패스',
  rate: 0.125,
  active: true,
}
const retired: DiscountType = {
  id: 3,
  code: 'OPENING_EVENT',
  name: '개원 기념',
  rate: 0.0725,
  active: false,
}

function mockList(rows: DiscountType[]) {
  mockApi({ 'GET /api/v1/discount-types': () => jsonResponse(rows) })
}

function count(key: string) {
  return requests().filter((request) => request === key).length
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

function cancel(dialog: HTMLElement) {
  return userEvent.click(within(dialog).getByRole('button', { name: '취소' }))
}

function waitUntilClosed() {
  return waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

// ── 창을 다시 열 때 ──────────────────────────────────────

test('취소하고 다시 열면 입력하던 값과 에러가 남아 있지 않다', async () => {
  mockList([sibling5])
  renderApp(PATH, { me: admin })
  let dialog = await openCreateForm()
  await fill(dialog, '코드', 'HALF')
  await fill(dialog, '이름', '쓰다 만 할인')
  await fill(dialog, '할인율 (%)', '오십')
  await save(dialog)
  expect(within(dialog).getByLabelText('할인율 (%)')).toBeInvalid()

  await cancel(dialog)
  dialog = await openCreateForm()

  expect(within(dialog).getByLabelText('코드')).toHaveValue('')
  expect(within(dialog).getByLabelText('이름')).toHaveValue('')
  expect(within(dialog).getByLabelText('할인율 (%)')).toHaveValue('')
  expect(within(dialog).getByLabelText('할인율 (%)')).not.toBeInvalid()
})

test('한 할인의 수정 창에 쓰던 값이 다른 할인의 수정 창이나 등록 창에 남지 않는다', async () => {
  mockList([sibling5, pass])
  renderApp(PATH, { me: admin })

  let dialog = await openEditForm('형제 할인')
  await fill(dialog, '할인율 (%)', '99')
  await cancel(dialog)

  // 앞의 할인에 쓰던 99가 남아 있으면 그대로 저장될 수 있다.
  dialog = await openEditForm('제이G패스')
  expect(within(dialog).getByLabelText('코드')).toHaveValue('DONGTAN_PASS')
  expect(within(dialog).getByLabelText('할인율 (%)')).toHaveValue('12.5')
  await cancel(dialog)

  dialog = await openCreateForm()
  expect(within(dialog).getByLabelText('코드')).toBeEnabled()
  expect(within(dialog).getByLabelText('코드')).toHaveValue('')
  expect(within(dialog).getByLabelText('할인율 (%)')).toHaveValue('')
})

test.each([
  [0.05, '5'],
  [0.07, '7'],
  [0.125, '12.5'],
  [0.0725, '7.25'],
  [0.0001, '0.01'],
  [1, '100'],
])(
  '받은 비율 %s를 수정 창에 %s로 보여주고, 건드리지 않고 저장하면 그대로 보낸다',
  async (rate, text) => {
    mockList([{ ...sibling5, rate }])
    mockApi({ 'PUT /api/v1/discount-types/1': () => jsonResponse({ ...sibling5, rate }) })
    renderApp(PATH, { me: admin })
    const dialog = await openEditForm('형제 할인')

    expect(within(dialog).getByLabelText('할인율 (%)')).toHaveValue(text)
    await save(dialog)

    await waitUntilClosed()
    expect(requestOf('PUT /api/v1/discount-types/1').body).toMatchObject({ rate })
  },
)

test('꺼진 할인을 다시 켤 수 있다', async () => {
  mockList([retired])
  mockApi({ 'PUT /api/v1/discount-types/3': () => jsonResponse(retired) })
  renderApp(PATH, { me: admin })
  const dialog = await openEditForm('개원 기념')

  await userEvent.click(within(dialog).getByRole('radio', { name: '사용 중' }))
  await save(dialog)

  await waitUntilClosed()
  expect(requestOf('PUT /api/v1/discount-types/3').body).toEqual({
    name: '개원 기념',
    rate: 0.0725,
    active: true,
  })
})

// ── 저장 실패 ────────────────────────────────────────────

test('서버 오류가 떠 있는 채로 할인율을 잘못 고쳐 저장하면 지난 서버 오류는 지운다', async () => {
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
  await waitFor(() => expect(within(dialog).getByLabelText('코드')).toBeInvalid())

  await fill(dialog, '코드', 'SIBLING_6')
  await fill(dialog, '할인율 (%)', '5.123')
  await save(dialog)

  // 코드는 이미 고쳤다. 보내지 않은 입력에 지난번 서버 오류가 붙어 있으면 안 된다.
  expect(within(dialog).getByLabelText('코드')).not.toBeInvalid()
  expect(within(dialog).getByLabelText('할인율 (%)')).toBeInvalid()
  expect(count('POST /api/v1/discount-types')).toBe(1)
})

test('이 폼에 없는 칸의 오류나 칸을 짚지 않은 오류도 버리지 않고 폼 아래에 보여준다', async () => {
  mockList([sibling5])
  mockApi({
    'PUT /api/v1/discount-types/1': () =>
      problemResponse(400, {
        detail: '입력값이 올바르지 않습니다.',
        code: 'COMMON_VALIDATION_FAILED',
        errors: [
          { field: 'active', message: '널이어서는 안됩니다' },
          { field: null, message: '함께 확인해 주세요.' },
        ],
      }),
  })
  renderApp(PATH, { me: admin })
  const dialog = await openEditForm('형제 할인')

  await save(dialog)

  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent('널이어서는 안됩니다')
  expect(alert).toHaveTextContent('함께 확인해 주세요.')
})

test('저장은 됐는데 목록을 다시 받지 못하면 창을 닫고, 표에는 저장한 값을 보여주며 최신이 아닐 수 있다고 알린다', async () => {
  let failList = false
  mockApi({
    'GET /api/v1/discount-types': () =>
      // 재시도 대기를 피하려고 재시도하지 않는 상태 코드를 쓴다.
      failList ? problemResponse(403, { detail: '권한이 없습니다.' }) : jsonResponse([sibling5]),
    'PUT /api/v1/discount-types/1': () => {
      failList = true
      return jsonResponse({ ...sibling5, rate: 0.1 })
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await openEditForm('형제 할인')

  await fill(dialog, '할인율 (%)', '10')
  await save(dialog)

  await waitUntilClosed()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '최신 내용을 불러오지 못했어요. 아래 표는 이전 내용일 수 있어요.',
  )
  // 저장한 줄은 응답으로 바로 바꿔 둔다. 옛 할인율이 보이면 저장이 안 된 줄 알고 다시 저장하게 된다.
  // 다른 줄은 이전 내용일 수 있어 안내는 그대로 둔다.
  expect(screen.getByRole('row', { name: /형제 할인/ })).toHaveTextContent('10%')
})

test('저장한 뒤 새 목록을 받을 때까지 창이 잠긴 채 남아 있고, 닫힐 때는 고친 값이 이미 보인다', async () => {
  let saved = false
  let respondList!: (response: Response) => void
  const refreshed = new Promise<Response>((resolve) => (respondList = resolve))
  mockApi({
    'GET /api/v1/discount-types': () =>
      saved ? refreshed.then((response) => response.clone()) : jsonResponse([sibling5]),
    'PUT /api/v1/discount-types/1': () => {
      saved = true
      return jsonResponse({ ...sibling5, rate: 0.1 })
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await openEditForm('형제 할인')
  await fill(dialog, '할인율 (%)', '10')
  await save(dialog)

  // 저장은 끝났고 목록을 기다리는 중이다.
  await waitFor(() => expect(count('GET /api/v1/discount-types')).toBe(2))
  expect(within(dialog).getByRole('button', { name: '저장하는 중' })).toBeDisabled()

  respondList(jsonResponse([{ ...sibling5, rate: 0.1 }]))
  await waitUntilClosed()
  // 기다리지 않고 본다. 창이 먼저 닫히면 표가 잠깐 옛 값이라 저장이 안 된 줄 알고 다시 저장하게 된다.
  expect(screen.getByRole('row', { name: /형제 할인/ })).toHaveTextContent('10%')
})

test('저장한 뒤 새 목록이 3초 넘게 오지 않으면 기다리지 않고 창을 닫는다. 표에는 저장한 값이 이미 있고, 다시 고쳐도 그 값으로 시작한다', async () => {
  // 시간을 가짜로 돌린다. 실제 시간도 흐르게 두어 화면의 기다림(waitFor)은 그대로 동작한다.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    let saved = false
    let respondList!: (response: Response) => void
    const refreshed = new Promise<Response>((resolve) => (respondList = resolve))
    mockApi({
      'GET /api/v1/discount-types': () =>
        saved ? refreshed.then((response) => response.clone()) : jsonResponse([sibling5]),
      'PUT /api/v1/discount-types/1': () => {
        saved = true
        return jsonResponse({ ...sibling5, rate: 0.1 })
      },
    })
    renderApp(PATH, { me: admin })
    const dialog = await openEditForm('형제 할인')
    await fill(dialog, '할인율 (%)', '10')
    await save(dialog)
    await waitFor(() => expect(count('GET /api/v1/discount-types')).toBe(2))

    // 상한 전에는 기다린다. (정확한 경계는 waitForRefresh.test.ts가 본다. 여기서는 여유를 넉넉히 둔다.)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(within(dialog).getByRole('button', { name: '저장하는 중' })).toBeDisabled()

    // 저장은 이미 끝났다. 목록이 늦는다고 창을 잠가 두지 않는다.
    await vi.advanceTimersByTimeAsync(1_500)
    await waitUntilClosed()
    // 목록은 아직 받는 중이다(흐리게 + aria-busy). 그래도 저장한 줄은 응답으로 이미 바뀌어 있다.
    const scroller = screen.getByRole('table', { name: '할인 유형' }).parentElement
    expect(scroller).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('row', { name: /형제 할인/ })).toHaveTextContent('10%')

    // 바로 다시 고친다. 폼이 옛 값(5)으로 채워지면, 이름만 고쳐도 방금 저장한 할인율을 되돌린다.
    const again = await openEditForm('형제 할인')
    expect(within(again).getByLabelText('할인율 (%)')).toHaveValue('10')
    await cancel(again)

    respondList(jsonResponse([{ ...sibling5, rate: 0.1 }]))

    await waitFor(() => expect(scroller).not.toHaveAttribute('aria-busy'))
    expect(screen.getByRole('row', { name: /형제 할인/ })).toHaveTextContent('10%')
    // 목록 요청을 다시 보내지 않았다. 뒤에서 받던 그 요청의 응답이다.
    expect(count('GET /api/v1/discount-types')).toBe(2)
  } finally {
    vi.useRealTimers()
  }
})

test('빈 목록에서 등록한 뒤 새 목록이 늦어도, 창이 닫히면 등록한 줄이 보인다', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    let saved = false
    let respondList!: (response: Response) => void
    const refreshed = new Promise<Response>((resolve) => (respondList = resolve))
    const created = { ...sibling5, id: 9, code: 'STAFF', name: '교직원 자녀', rate: 0.1 }
    mockApi({
      'GET /api/v1/discount-types': () =>
        saved ? refreshed.then((response) => response.clone()) : jsonResponse([]),
      'POST /api/v1/discount-types': () => {
        saved = true
        return jsonResponse(created, 201)
      },
    })
    renderApp(PATH, { me: admin })
    await screen.findByRole('heading', { name: '등록된 할인 유형이 없어요' })
    await userEvent.click(screen.getAllByRole('button', { name: '할인 유형 등록' })[0])
    const dialog = await screen.findByRole('dialog', { name: '할인 유형 등록' })
    await fill(dialog, '코드', 'STAFF')
    await fill(dialog, '이름', '교직원 자녀')
    await fill(dialog, '할인율 (%)', '10')
    await save(dialog)
    await waitFor(() => expect(count('GET /api/v1/discount-types')).toBe(2))

    await vi.advanceTimersByTimeAsync(3_500)
    await waitUntilClosed()

    // "등록된 할인 유형이 없어요"가 그대로 보이면 저장이 안 된 줄 알고 다시 등록한다.
    expect(
      screen.queryByRole('heading', { name: '등록된 할인 유형이 없어요' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('row', { name: /교직원 자녀/ })).toHaveTextContent('10%')
    expect(count('POST /api/v1/discount-types')).toBe(1)

    respondList(jsonResponse([created]))
    await waitFor(() =>
      expect(screen.getByRole('table', { name: '할인 유형' }).parentElement).not.toHaveAttribute(
        'aria-busy',
      ),
    )
    // 다시 받은 목록에도 그 줄이 하나뿐이다(덧붙인 줄이 겹치지 않는다).
    expect(screen.getAllByRole('row', { name: /교직원 자녀/ })).toHaveLength(1)
  } finally {
    vi.useRealTimers()
  }
})

test('저장 응답이 약속한 모양이 아니면(id가 없으면) 목록에 넣지 않고, 다시 받은 목록을 보여준다', async () => {
  let saved = false
  let respondList!: (response: Response) => void
  const refreshed = new Promise<Response>((resolve) => (respondList = resolve))
  mockApi({
    'GET /api/v1/discount-types': () =>
      saved ? refreshed.then((response) => response.clone()) : jsonResponse([sibling5]),
    'PUT /api/v1/discount-types/1': () => {
      saved = true
      return jsonResponse({ ok: true })
    },
  })
  renderApp(PATH, { me: admin })
  const dialog = await openEditForm('형제 할인')
  await fill(dialog, '할인율 (%)', '10')
  await save(dialog)
  await waitFor(() => expect(count('GET /api/v1/discount-types')).toBe(2))

  // 새 목록을 기다리는 동안이다. 모양이 틀린 줄을 표에 끼우면 할인율을 그리다 화면이 통째로 깨진다.
  expect(
    screen.queryByRole('heading', { name: '화면을 불러오지 못했어요' }),
  ).not.toBeInTheDocument()
  expect(screen.getAllByRole('row', { hidden: true })).toHaveLength(2)

  respondList(jsonResponse([{ ...sibling5, rate: 0.1 }]))
  await waitUntilClosed()
  expect(screen.getAllByRole('row')).toHaveLength(2)
  expect(screen.getByRole('row', { name: /형제 할인/ })).toHaveTextContent('10%')
})

// ── 서버가 약속과 다른 값을 줄 때 ────────────────────────

test.each([
  ['소수 넷째 자리를 넘는 값', 0.05001],
  ['음수', -0.05],
  ['null', null],
])(
  '할인율이 약속과 다르면(%s) 틀린 값을 보여주지 않고 에러 화면을 보여준다',
  async (_name, rate) => {
    // React가 화면 에러를 콘솔에 남긴다. 테스트 출력이 지저분해지지 않게 막는다.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockList([pass, { ...sibling5, rate: rate as number }])
    renderApp(PATH, { me: admin })

    expect(
      await screen.findByRole('heading', { name: '화면을 불러오지 못했어요' }),
    ).toBeInTheDocument()
    // 반올림한 그럴듯한 값이 보이면 안 된다.
    expect(screen.queryByText('5%')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '직원 메뉴' })).toBeInTheDocument()
    vi.restoreAllMocks()
  },
)
