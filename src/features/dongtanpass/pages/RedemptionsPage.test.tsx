import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Campus } from '@/shared/campus'
import {
  expectNoRequests,
  jsonResponse,
  mockApi,
  problemResponse,
  requests,
  setupMockApi,
} from '@/test/mockApi'
import { admin, partner, renderApp, staff } from '@/test/renderApp'
import { expectStackLabels } from '@/test/table'
import type { Redemption, RedemptionPage } from '../api'

setupMockApi()

const PATH = '/desk/dongtanpass/redemptions'
const LIST = 'GET /api/v1/dongtanpass/redemptions'
const CAMPUSES = 'GET /api/v1/campuses'

const campuses: Campus[] = [
  { id: 1, name: '동탄관' },
  { id: 2, name: '능동관' },
]

function item(overrides: Partial<Redemption> = {}): Redemption {
  return {
    redemptionId: 1,
    // 한국 시각 2026-10-18 14:32
    redeemedAt: '2026-10-18T05:32:10Z',
    redeemedOn: '2026-10-18',
    campusId: 1,
    passId: 7,
    passNo: 'DT-EW6DGJ',
    partnerName: '햇살수학',
    studentId: 16,
    studentName: '김하윤',
    staffId: 2,
    ...overrides,
  }
}

const first = item()
const second = item({
  redemptionId: 2,
  redeemedAt: '2026-10-05T01:00:00Z',
  redeemedOn: '2026-10-05',
  campusId: 2,
  passId: 8,
  passNo: 'DT-TAXS4Q',
  partnerName: '바른영어',
  studentId: 17,
  studentName: '이서준',
})

function page(items: Redemption[], overrides: Partial<RedemptionPage> = {}): RedemptionPage {
  return {
    items,
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages: items.length > 0 ? 1 : 0,
    ...overrides,
  }
}

function mockList(body: RedemptionPage = page([first, second])) {
  mockApi({ [LIST]: () => jsonResponse(body), [CAMPUSES]: () => jsonResponse(campuses) })
}

/** 마지막 내역 요청의 쿼리 */
function lastQuery() {
  const key = requests().findLast((request) => request.startsWith(LIST))
  if (!key) throw new Error('내역 요청이 없어요')
  const query: Record<string, string> = {}
  new URLSearchParams(key.split('?')[1] ?? '').forEach((value, name) => {
    query[name] = value
  })
  return query
}

function listCount() {
  return requests().filter((request) => request.startsWith(LIST)).length
}

async function openPage(path = PATH, me = staff) {
  const rendered = renderApp(path, { me })
  await screen.findByRole('table', { name: '패스 사용 내역' })
  return rendered
}

beforeEach(() => {
  // 한국의 오늘은 2026-10-18이다(UTC로는 아직 17일 밤이다).
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-18T08:00:00+09:00') })
})

afterEach(() => {
  vi.useRealTimers()
})

test('처음 열면 이번 달 1일부터 한국의 오늘까지를 요청하고, 직원은 지점을 보내지 않는다', async () => {
  mockList()
  await openPage()

  expect(lastQuery()).toEqual({ from: '2026-10-01', to: '2026-10-18' })
  expect(screen.getByLabelText('사용일 시작')).toHaveValue('2026-10-01')
  expect(screen.getByLabelText('사용일 끝')).toHaveValue('2026-10-18')
  // 직원은 소속 지점만 본다. 지점을 고르는 칩도, 지점 칸도 없다.
  expect(screen.queryByRole('radiogroup', { name: '지점' })).not.toBeInTheDocument()
  expect(screen.queryByRole('columnheader', { name: '지점' })).not.toBeInTheDocument()
})

test('줄마다 학생(상세 링크)·사용 일시(한국 시각)·패스 번호·발급 학원을 보여 준다', async () => {
  mockList()
  await openPage()

  expect(screen.getByText('전체 2건')).toBeInTheDocument()
  const [, row] = screen.getAllByRole('row')
  const cells = within(row).getAllByRole('cell')
  expect(cells.map((cell) => cell.textContent)).toEqual([
    '김하윤',
    '2026.10.18 14:32',
    'DT-EW6DGJ',
    '햇살수학',
  ])
  expect(within(row).getByRole('link', { name: '김하윤' })).toHaveAttribute(
    'href',
    '/desk/students/16',
  )
  // 좁은 화면에서 줄을 쌓을 때 칸 이름표가 머리 글자와 맞는다.
  expectStackLabels(screen.getByRole('table', { name: '패스 사용 내역' }))
})

test('학생 이름이 없는 기록도 학생 번호로 상세에 갈 수 있다', async () => {
  mockList(page([item({ studentName: null })]))
  await openPage()

  expect(screen.getByRole('link', { name: '학생 16' })).toHaveAttribute('href', '/desk/students/16')
})

test('관리자는 처음에 전 지점을 보고 지점 칸이 있다. 지점을 고르면 그 지점만 요청하고 지점 칸을 숨긴다', async () => {
  mockList()
  const { router } = await openPage(PATH, admin)

  expect(lastQuery()).toEqual({ from: '2026-10-01', to: '2026-10-18' })
  const chips = screen.getByRole('radiogroup', { name: '지점' })
  expect(within(chips).getByRole('radio', { name: '전체' })).toBeChecked()
  await waitFor(() =>
    expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toContain('능동관'),
  )
  expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toContain('동탄관')
  expectStackLabels(screen.getByRole('table', { name: '패스 사용 내역' }))

  await userEvent.click(within(chips).getByRole('radio', { name: '동탄관' }))

  await waitFor(() =>
    expect(lastQuery()).toEqual({ from: '2026-10-01', to: '2026-10-18', campusId: '1' }),
  )
  expect(router.state.location.search).toBe('?from=2026-10-01&to=2026-10-18&campusId=1')
  await waitFor(() =>
    expect(screen.queryByRole('columnheader', { name: '지점' })).not.toBeInTheDocument(),
  )
})

test('직원은 주소에 지점이 있어도 보내지 않는다(다른 지점은 서버가 막는다)', async () => {
  mockList()
  await openPage(`${PATH}?from=2026-10-01&to=2026-10-18&campusId=2`)

  expect(lastQuery()).toEqual({ from: '2026-10-01', to: '2026-10-18' })
})

test('주소의 기간으로 연다. 날짜 모양이 틀리면 처음 기간으로 본다', async () => {
  mockList()
  await openPage(`${PATH}?from=2026-09-01&to=2026-09-30`)
  expect(lastQuery()).toEqual({ from: '2026-09-01', to: '2026-09-30' })
})

test('주소의 날짜가 틀리면 그 날짜는 처음 기간의 값으로 본다', async () => {
  mockList()
  await openPage(`${PATH}?from=2026-02-30&to=abc`)
  expect(lastQuery()).toEqual({ from: '2026-10-01', to: '2026-10-18' })
})

test('기간을 바꿔 조회하면 첫 페이지부터 새 기간을 요청하고 주소에 남긴다', async () => {
  mockList()
  const { router } = await openPage()

  const from = screen.getByLabelText('사용일 시작')
  await userEvent.clear(from)
  await userEvent.type(from, '2026-09-01')
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  await waitFor(() => expect(lastQuery()).toEqual({ from: '2026-09-01', to: '2026-10-18' }))
  expect(router.state.location.search).toBe('?from=2026-09-01&to=2026-10-18')
  // 처음 기간으로 돌아가는 길이 생긴다.
  expect(screen.getByRole('link', { name: '이번 달로' })).toHaveAttribute('href', PATH)
})

test.each([
  ['비우면', '', '2026-10-18', '사용일 시작', '날짜를 넣어 주세요.'],
  [
    '끝일이 시작일보다 앞이면',
    '2026-10-18',
    '2026-10-01',
    '사용일 끝',
    '끝일이 시작일보다 앞이에요.',
  ],
  ['1년을 넘기면', '2025-10-17', '2026-10-18', '사용일 끝', '기간은 1년까지 볼 수 있어요.'],
])('기간을 %s 칸에 알리고 요청하지 않는다', async (_name, fromValue, toValue, field, message) => {
  mockList()
  await openPage()
  const before = listCount()

  const from = screen.getByLabelText('사용일 시작')
  const to = screen.getByLabelText('사용일 끝')
  await userEvent.clear(from)
  if (fromValue) await userEvent.type(from, fromValue)
  await userEvent.clear(to)
  await userEvent.type(to, toValue)
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  expect(screen.getByLabelText(field)).toHaveAccessibleDescription(message)
  expect(listCount()).toBe(before)
})

test('딱 1년(시작일 + 1년)까지는 조회한다', async () => {
  mockList()
  await openPage()

  const from = screen.getByLabelText('사용일 시작')
  await userEvent.clear(from)
  await userEvent.type(from, '2025-10-18')
  await userEvent.click(screen.getByRole('button', { name: '조회' }))

  await waitFor(() => expect(lastQuery()).toEqual({ from: '2025-10-18', to: '2026-10-18' }))
})

test('다음 페이지를 누르면 같은 조건으로 그 페이지를 요청한다', async () => {
  mockList(page([first], { totalElements: 25, totalPages: 2 }))
  const { router } = await openPage()

  await userEvent.click(screen.getByRole('button', { name: '다음' }))

  await waitFor(() =>
    expect(lastQuery()).toEqual({ from: '2026-10-01', to: '2026-10-18', page: '1' }),
  )
  expect(router.state.location.search).toBe('?from=2026-10-01&to=2026-10-18&page=1')
})

test('이 기간에 사용한 패스가 없으면 그렇게 알린다', async () => {
  mockList(page([]))
  renderApp(PATH, { me: staff })

  expect(await screen.findByText('이 기간에 사용한 패스가 없어요')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('서버가 기간이 너무 길다고 하면(주소를 고친 경우) 기간을 줄이라고 알린다', async () => {
  mockApi({
    [LIST]: () =>
      problemResponse(400, { code: 'DONGTANPASS_PERIOD_TOO_LONG', detail: '기간이 너무 깁니다.' }),
    [CAMPUSES]: () => jsonResponse(campuses),
  })
  renderApp(`${PATH}?from=2024-01-01&to=2026-10-18`, { me: staff })

  expect(
    await screen.findByText('기간은 1년까지 볼 수 있어요. 기간을 줄여 주세요.'),
  ).toBeInTheDocument()
})

test('내역을 받지 못하면 알리고 다시 불러올 수 있다', async () => {
  let calls = 0
  mockApi({
    [LIST]: () => {
      calls += 1
      return calls === 1
        ? problemResponse(403, {
            code: 'AUTH_CAMPUS_NOT_ALLOWED',
            detail: '이 지점은 볼 수 없습니다.',
          })
        : jsonResponse(page([first]))
    },
    [CAMPUSES]: () => jsonResponse(campuses),
  })
  renderApp(PATH, { me: staff })

  expect(await screen.findByText('이 지점은 볼 수 없습니다.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

  expect(await screen.findByRole('table', { name: '패스 사용 내역' })).toBeInTheDocument()
})

test('연계 학원은 이 화면을 볼 수 없고 내역을 요청하지 않는다', async () => {
  renderApp(PATH, { me: partner })

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expectNoRequests()
})
