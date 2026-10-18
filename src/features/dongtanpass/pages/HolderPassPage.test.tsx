import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { focusManager, onlineManager } from '@tanstack/react-query'
import { afterEach, expect, test, vi } from 'vitest'
import {
  jsonResponse,
  mockApi,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
  unreadableResponse,
} from '@/test/mockApi'
import { renderApp } from '@/test/renderApp'
import type { HolderPass } from '../api'

setupMockApi()

afterEach(() => {
  vi.useRealTimers()
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
})

const TOKEN = 'k7Qm2xVa9LpR4tWz'
const PATH = `/p/${TOKEN}`
const VIEW = 'POST /api/v1/dongtanpass/holder/view'
const QR = 'POST /api/v1/dongtanpass/holder/qr'

function passOf(overrides: Partial<HolderPass> = {}): HolderPass {
  return {
    passNo: 'DT-7KQ4MX',
    partnerName: '햇살수학',
    studentName: '김*윤',
    campusName: '동탄관',
    issuedOn: '2026-10-16',
    expiresOn: '2026-11-16',
    // 전체 32일(10.16~11.16) 중 16일. 막대가 절반이다.
    daysLeft: 16,
    discountRate: 0.05,
    redeemedOn: null,
    state: 'ISSUED',
    noticeVersion: '2026-10-01',
    noticeText: '수집하는 정보: 학생 이름, 학부모 휴대전화\n보관 기간: 사용 기한 뒤 1년',
    ...overrides,
  }
}

/** 부를 때마다 새 QR을 준다(실제 서버처럼). 몇 번 불렸는지 센다. */
function mockQr() {
  const issued = { count: 0 }
  mockApi({
    [QR]: () => {
      issued.count += 1
      return jsonResponse({
        qrToken: `qr-token-${issued.count}`,
        expiresAt: '2026-10-17T03:00:59Z',
      })
    },
  })
  return issued
}

function card() {
  return screen.getByRole('article', { name: '동탄고패스 카드' })
}

function qrSheet() {
  return screen.getByRole('region', { name: '패스 QR' })
}

// QR 그림의 점 모양. 값이 바뀌면 다른 모양이 된다.
function qrShape() {
  return within(qrSheet())
    .getByRole('img', { name: '패스 QR' })
    .querySelector('path')
    ?.getAttribute('d')
}

async function openUsablePass() {
  mockApi({ [VIEW]: () => jsonResponse(passOf()) })
  const issued = mockQr()
  renderApp(PATH)
  await within(await screen.findByRole('region', { name: '패스 QR' })).findByRole('img', {
    name: '패스 QR',
  })
  return issued
}

// ── 보여 주기 ─────────────────────────────────────────────

test('쓸 수 있는 패스는 카드, QR, 사용 안내, 발급 정보, 개인정보 안내를 보여 준다', async () => {
  await openUsablePass()

  expect(screen.getByRole('heading', { level: 1, name: '동탄고 패스' })).toBeInTheDocument()
  // 이름은 서버가 가린 그대로, 할인율은 퍼센트로, 날짜는 점으로 잇는다.
  expect(card()).toHaveTextContent('JEY 어학원 동탄관 첫 달 수강료')
  expect(card()).toHaveTextContent('5%할인')
  expect(card()).toHaveTextContent('김*윤')
  expect(card()).toHaveTextContent('DT-7KQ4MX')
  expect(card()).toHaveTextContent('2026.11.16')
  expect(card()).toHaveTextContent('사용 가능')
  // QR이 안 되면 데스크가 번호로 찾는다. 번호는 QR 옆에도 있다.
  expect(qrSheet()).toHaveTextContent('데스크에 이 QR을 보여 주세요')
  expect(qrSheet()).toHaveTextContent('DT-7KQ4MX')

  const howTo = screen.getByRole('region', { name: '이렇게 사용해요' })
  expect(within(howTo).getAllByRole('listitem')[0]).toHaveTextContent(
    'JEY 어학원 동탄관 데스크에 방문해요',
  )
  const info = screen.getByRole('region', { name: '발급 정보' })
  expect(info).toHaveTextContent('발급 학원햇살수학발급일2026.10.16할인 받는 곳JEY 어학원 동탄관')
  const notice = screen.getByRole('region', { name: '개인정보 안내' })
  expect(notice).toHaveTextContent('수집하는 정보: 학생 이름, 학부모 휴대전화')
  expect(notice).toHaveTextContent('안내문 버전 2026-10-01')
  // 링크 다시 받기에서 넘어온 것이 아니면 저장 안내와 링크 칸이 없다.
  expect(screen.queryByText(/새 링크를 받았어요/)).not.toBeInTheDocument()
  expect(screen.queryByLabelText('학부모 링크')).not.toBeInTheDocument()
})

// 남은 기간 막대. 남은 일수 글자의 부모의 다음 형제가 막대 바탕이다.
function timeLeftBar() {
  return screen.getByText('남은 기간').parentElement?.nextElementSibling?.querySelector('i')
}

test('쓸 수 있는 패스는 QR 아래에 서버가 센 남은 일수와 막대를 보여 준다', async () => {
  // 휴대폰 날짜가 틀려도(사용 기한 뒤) 서버의 남은 일수를 그대로 쓴다.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-01-01T00:00:00+09:00') })
  await openUsablePass()

  const label = screen.getByText('남은 기간')
  expect(qrSheet().compareDocumentPosition(label)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  expect(label.parentElement).toHaveTextContent('남은 기간16일')
  // 전체 길이 = 사용 기한 − 발급일 + 1 = 32일
  expect(timeLeftBar()).toHaveStyle({ width: '50%' })
})

test.each([
  // 발급일 당일: 꽉 찬다.
  [32, '100%'],
  // 사용 기한 당일: 서버가 1일로 준다(1/32).
  [1, '3%'],
])('남은 일수가 %i일이면 막대가 %s', async (daysLeft, width) => {
  mockApi({ [VIEW]: () => jsonResponse(passOf({ daysLeft })) })
  mockQr()
  renderApp(PATH)

  expect((await screen.findByText('남은 기간')).parentElement).toHaveTextContent(
    `남은 기간${daysLeft}일`,
  )
  expect(timeLeftBar()).toHaveStyle({ width })
})

test('토큰은 주소의 쿼리가 아니라 본문으로 보내고, 멱등 키는 싣지 않는다', async () => {
  await openUsablePass()

  for (const key of [VIEW, QR]) {
    const sent = requestOf(key)
    expect(sent.body).toEqual({ token: TOKEN })
    expect(sent.headers.has('Idempotency-Key')).toBe(false)
  }
  // 요청 주소에 쿼리 문자열이 없다(keyOf는 쿼리까지 적는다).
  expect(requests().every((key) => !key.includes('?'))).toBe(true)
})

test.each([
  ['REDEEMED', '사용 완료'],
  ['EXPIRED', '기간 만료'],
  ['CANCELED', '발급 취소'],
] as const)(
  '%s 패스는 도장 찍힌 카드를 보여 주고 QR과 사용 안내는 숨긴다',
  async (state, label) => {
    mockApi({ [VIEW]: () => jsonResponse(passOf({ state, daysLeft: 0 })) })
    renderApp(PATH)

    expect(await screen.findByRole('article', { name: '동탄고패스 카드' })).toHaveTextContent(label)
    expect(screen.queryByRole('region', { name: '패스 QR' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '이렇게 사용해요' })).not.toBeInTheDocument()
    // 남은 기간은 쓸 수 있는 패스에만. 0일이라고 "만료"로 쓰지 않고 카드의 상태 도장만 둔다.
    expect(screen.queryByText('남은 기간')).not.toBeInTheDocument()
    expect(screen.queryByText('0일')).not.toBeInTheDocument()
    // 발급 정보(발급일 포함)와 개인정보 안내는 어느 상태에서나 보인다.
    expect(screen.getByRole('region', { name: '발급 정보' })).toHaveTextContent('발급일2026.10.16')
    expect(screen.getByRole('region', { name: '개인정보 안내' })).toBeInTheDocument()
    // 쓸 수 없는 패스의 QR은 받지 않는다(서버도 409로 거부한다).
    expect(requests()).toEqual([VIEW])
  },
)

test('사용 완료 패스는 발급 정보의 발급일 아래에 사용일을 보여 준다', async () => {
  mockApi({
    [VIEW]: () =>
      jsonResponse(passOf({ state: 'REDEEMED', daysLeft: 0, redeemedOn: '2026-10-18' })),
  })
  renderApp(PATH)

  const info = await screen.findByRole('region', { name: '발급 정보' })
  expect(info).toHaveTextContent(
    '발급 학원햇살수학발급일2026.10.16사용일2026.10.18할인 받는 곳JEY 어학원 동탄관',
  )
})

test.each(['ISSUED', 'EXPIRED', 'CANCELED'] as const)(
  '%s 패스에는 사용일 행이 없다',
  async (state) => {
    // 서버는 사용 완료가 아니면 null을 준다. 값이 잘못 와도 사용 완료가 아니면 쓰지 않는다.
    mockApi({ [VIEW]: () => jsonResponse(passOf({ state, redeemedOn: '2026-10-18' })) })
    if (state === 'ISSUED') mockQr()
    renderApp(PATH)

    const info = await screen.findByRole('region', { name: '발급 정보' })
    expect(info).not.toHaveTextContent('사용일')
  },
)

test('사용 완료여도 사용일이 없으면 행을 두지 않는다', async () => {
  mockApi({ [VIEW]: () => jsonResponse(passOf({ state: 'REDEEMED', daysLeft: 0 })) })
  renderApp(PATH)

  const info = await screen.findByRole('region', { name: '발급 정보' })
  expect(info).toHaveTextContent('발급일2026.10.16할인 받는 곳')
})

test('서버가 모르는 상태를 주면 QR을 보여 주지 않고 학원에 문의하라고 알린다', async () => {
  mockApi({ [VIEW]: () => jsonResponse(passOf({ state: 'PAUSED' as HolderPass['state'] })) })
  renderApp(PATH)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '지금은 패스를 보여 줄 수 없어요. 패스를 발급한 학원에 문의해 주세요.',
  )
  expect(requests()).toEqual([VIEW])
})

// ── 열 수 없는 링크와 오류 ─────────────────────────────────

test.each([
  [404, 'DONGTANPASS_PASS_NOT_FOUND'],
  // 토큰 모양이 틀린 링크. 다시 불러와도 같으니 연결 문제로 안내하지 않는다.
  [400, 'COMMON_VALIDATION_FAILED'],
])(
  '열 수 없는 링크(%i %s)는 링크가 바뀌었을 수 있다고 알리고, 링크 다시 받기로 보낸다',
  async (status, code) => {
    mockApi({
      [VIEW]: () => problemResponse(status, { code, detail: '패스를 찾을 수 없습니다.' }),
    })
    renderApp(PATH)

    expect(
      await screen.findByRole('heading', { level: 1, name: '링크가 맞지 않거나 새로 바뀌었어요' }),
    ).toBeInTheDocument()
    // 가족이 다시 받으면 예전 링크가 막힌다는 것을 알린다.
    expect(
      screen.getByText(/가족이 링크를 다시 받았다면 예전 링크는 열리지 않아요/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '링크 다시 받기' })).toHaveAttribute('href', '/find')
    expect(requests()).toEqual([VIEW])
  },
)

test('패스를 받지 못하면 요청 번호와 함께 알리고, 다시 불러올 수 있다', async () => {
  let views = 0
  mockApi({
    [VIEW]: () => {
      views += 1
      return views === 1
        ? unreadableResponse('req-holder-1')
        : jsonResponse(passOf({ state: 'CANCELED' }))
    },
  })
  renderApp(PATH)

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('패스를 불러오지 못했어요.')
  expect(alert).toHaveTextContent('req-holder-1')

  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

  expect(await screen.findByRole('article', { name: '동탄고패스 카드' })).toHaveTextContent(
    '발급 취소',
  )
})

// ── QR 갱신 ───────────────────────────────────────────────

test('QR은 45초마다 새로 받고, 받는 동안에도 지금 QR을 그대로 보여 준다', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const issued = await openUsablePass()
  const first = qrShape()
  expect(issued.count).toBe(1)

  await vi.advanceTimersByTimeAsync(44_000)
  expect(issued.count).toBe(1)

  await vi.advanceTimersByTimeAsync(1_500)
  await waitFor(() => expect(issued.count).toBe(2))
  await waitFor(() => expect(qrShape()).not.toBe(first))
  expect(qrSheet()).toHaveTextContent('데스크에 이 QR을 보여 주세요')
})

test('화면이 다시 보이면 받은 지 얼마 안 된 QR이어도 바로 새로 받는다', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const issued = await openUsablePass()

  focusManager.setFocused(false)
  await vi.advanceTimersByTimeAsync(10_000)
  focusManager.setFocused(true)

  await waitFor(() => expect(issued.count).toBe(2))
})

test('화면이 가려져 있으면 QR을 받지 않고, 다시 보이면 바로 받는다', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const issued = await openUsablePass()

  focusManager.setFocused(false)
  await vi.advanceTimersByTimeAsync(50_000)
  expect(issued.count).toBe(1)

  focusManager.setFocused(true)
  await waitFor(() => expect(issued.count).toBe(2))
})

test('받은 지 59초가 지나도 새 QR을 받지 못했으면 흐리게 하고, 다시 불러오면 새 QR을 보여 준다', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  let qrs = 0
  mockApi({
    [VIEW]: () => jsonResponse(passOf()),
    // 첫 QR 뒤로는 받지 못한다(읽지 못한 응답은 다시 보내지 않는다). 다시 불러오기를 누르면 받는다.
    [QR]: () => {
      qrs += 1
      if (qrs === 2) return unreadableResponse()
      return jsonResponse({ qrToken: `qr-token-${qrs}`, expiresAt: '2026-10-17T03:00:59Z' })
    },
  })
  renderApp(PATH)
  await within(await screen.findByRole('region', { name: '패스 QR' })).findByRole('img')

  // 45초에 새로 받으려다 실패했다. 아직 쓸 수 있는 QR이라 그대로 둔다.
  await vi.advanceTimersByTimeAsync(46_000)
  await waitFor(() => expect(qrs).toBe(2))
  expect(qrSheet()).toHaveTextContent('데스크에 이 QR을 보여 주세요')

  await vi.advanceTimersByTimeAsync(13_500)
  await waitFor(() => expect(qrSheet()).toHaveTextContent('QR을 새로 받지 못했어요'))
  // 패스 번호는 여전히 보인다.
  expect(qrSheet()).toHaveTextContent('DT-7KQ4MX')

  await userEvent.click(within(qrSheet()).getByRole('button', { name: '다시 불러오기' }))

  await waitFor(() => expect(qrSheet()).toHaveTextContent('데스크에 이 QR을 보여 주세요'))
  expect(qrs).toBe(3)
})

test('보는 사이에 데스크가 사용 처리해 QR이 409로 거부되면, 패스를 다시 받아 사용 완료로 바꾼다', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  let views = 0
  let qrs = 0
  mockApi({
    [VIEW]: () => {
      views += 1
      return jsonResponse(passOf({ state: views === 1 ? 'ISSUED' : 'REDEEMED' }))
    },
    [QR]: () => {
      qrs += 1
      return qrs === 1
        ? jsonResponse({ qrToken: 'qr-token-1', expiresAt: '2026-10-17T03:00:59Z' })
        : problemResponse(409, {
            code: 'DONGTANPASS_PASS_ALREADY_REDEEMED',
            detail: '이미 사용한 패스입니다.',
          })
    },
  })
  renderApp(PATH)
  await screen.findByRole('region', { name: '패스 QR' })

  await vi.advanceTimersByTimeAsync(46_000)

  await waitFor(() => expect(card()).toHaveTextContent('사용 완료'))
  expect(screen.queryByRole('region', { name: '패스 QR' })).not.toBeInTheDocument()
  expect(views).toBe(2)
})

test('첫 QR을 받는 동안에는 불러오는 중이라고 알리고, 받지 못하면 다시 불러올 수 있게 한다', async () => {
  let qrs = 0
  let answerFirst: (response: Response) => void = () => {}
  mockApi({
    [VIEW]: () => jsonResponse(passOf()),
    [QR]: () => {
      qrs += 1
      if (qrs === 1) return new Promise<Response>((resolve) => (answerFirst = resolve))
      return jsonResponse({ qrToken: 'qr-token-2', expiresAt: '2026-10-17T03:00:59Z' })
    },
  })
  renderApp(PATH)

  expect(await screen.findByRole('region', { name: '패스 QR' })).toHaveTextContent(
    'QR을 불러오고 있어요',
  )

  // 다시 보내지 않는 실패(읽지 못한 응답)로 첫 QR을 놓친다.
  answerFirst(unreadableResponse())

  await waitFor(() => expect(qrSheet()).toHaveTextContent('QR을 새로 받지 못했어요'))
  // 받은 QR이 없으니 흐린 그림도 없다. 패스 번호로는 확인할 수 있다.
  expect(within(qrSheet()).queryByRole('img')).not.toBeInTheDocument()
  expect(qrSheet()).toHaveTextContent('DT-7KQ4MX')

  await userEvent.click(within(qrSheet()).getByRole('button', { name: '다시 불러오기' }))

  await waitFor(() => expect(qrSheet()).toHaveTextContent('데스크에 이 QR을 보여 주세요'))
  expect(within(qrSheet()).getByRole('img', { name: '패스 QR' })).toBeInTheDocument()
})

test('보는 사이에 링크가 바뀌어 QR이 404로 거부되면, 패스를 다시 받아 열 수 없는 링크라고 알린다', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const notFound = () =>
    problemResponse(404, { code: 'DONGTANPASS_PASS_NOT_FOUND', detail: '패스를 찾을 수 없습니다.' })
  let views = 0
  let qrs = 0
  mockApi({
    [VIEW]: () => {
      views += 1
      return views === 1 ? jsonResponse(passOf()) : notFound()
    },
    [QR]: () => {
      qrs += 1
      return qrs === 1
        ? jsonResponse({ qrToken: 'qr-token-1', expiresAt: '2026-10-17T03:00:59Z' })
        : notFound()
    },
  })
  renderApp(PATH)
  await screen.findByRole('region', { name: '패스 QR' })

  await vi.advanceTimersByTimeAsync(46_000)

  // 이미 받아 둔 패스가 있어도 열 수 없는 링크라는 안내가 먼저다.
  expect(
    await screen.findByRole('heading', { level: 1, name: '링크가 맞지 않거나 새로 바뀌었어요' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '패스 QR' })).not.toBeInTheDocument()
  expect(views).toBe(2)
})

test('연결이 끊겼다가 다시 이어지면 QR을 바로 새로 받는다', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const issued = await openUsablePass()

  onlineManager.setOnline(false)
  await vi.advanceTimersByTimeAsync(10_000)
  onlineManager.setOnline(true)

  await waitFor(() => expect(issued.count).toBe(2))
})
