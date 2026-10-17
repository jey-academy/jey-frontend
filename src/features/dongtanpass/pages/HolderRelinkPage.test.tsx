import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import {
  expectNoRequests,
  jsonResponse,
  mockApi,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
  tooManyRequests,
  unreadableResponse,
} from '@/test/mockApi'
import { renderApp } from '@/test/renderApp'
import type { HolderPass } from '../api'

setupMockApi()

const PATH = '/find'
const RELINK = 'POST /api/v1/dongtanpass/holder/relink'
const VIEW = 'POST /api/v1/dongtanpass/holder/view'
const QR = 'POST /api/v1/dongtanpass/holder/qr'
const NEW_TOKEN = 'n3wT0kenAbCdEfGh'
const PHONE = '010-1234-5678'

const pass: HolderPass = {
  passNo: 'DT-7KQ4MX',
  partnerName: '햇살수학',
  studentName: '김*윤',
  campusName: '동탄관',
  issuedOn: '2026-10-16',
  expiresOn: '2026-11-16',
  daysLeft: 16,
  discountRate: 0.05,
  redeemedOn: null,
  state: 'ISSUED',
  noticeVersion: '2026-10-01',
  noticeText: '수집하는 정보: 학생 이름, 학부모 휴대전화',
}

async function openPage() {
  const rendered = renderApp(PATH)
  await screen.findByRole('heading', { level: 1, name: '링크 다시 받기' })
  return rendered
}

async function fill(name: string, phone: string) {
  if (name) await userEvent.type(screen.getByLabelText('학생 이름'), name)
  if (phone) await userEvent.type(screen.getByLabelText('학부모 휴대전화'), phone)
}

function submit() {
  return userEvent.click(screen.getByRole('button', { name: '링크 다시 받기' }))
}

test('예전 링크가 막힌다는 것을 미리 알린다', async () => {
  await openPage()

  expect(screen.getByRole('status')).toHaveTextContent(
    '새 링크를 받으면 예전 링크는 열리지 않아요. 링크를 같이 쓰는 가족에게 새 링크를 보내 주세요.',
  )
})

test('이름과 번호를 본문으로 보내고, 새 링크의 패스 화면으로 가서 저장하라고 알린다', async () => {
  mockApi({
    [RELINK]: () => jsonResponse({ linkToken: NEW_TOKEN }),
    [VIEW]: () => jsonResponse(pass),
    [QR]: () => jsonResponse({ qrToken: 'qr-token-1', expiresAt: '2026-10-17T03:00:59Z' }),
  })
  const { router } = await openPage()
  await fill(' 김도윤 ', ` ${PHONE} `)

  await submit()

  expect(
    await screen.findByText(/새 링크를 받았어요\. 예전 링크는 이제 열리지 않아요/),
  ).toBeInTheDocument()
  expect(router.state.location.pathname).toBe(`/p/${NEW_TOKEN}`)
  // 기록을 바꿔치기했다. 뒤로 가기가 이 폼으로 돌아오지 않는다.
  expect(router.state.historyAction).toBe('REPLACE')
  // 다시 받은 패스는 쓸 수 있는 패스다. 저장 안내와 함께 데스크에 보여 줄 QR도 나온다.
  expect(await screen.findByRole('img', { name: '패스 QR' })).toBeInTheDocument()
  // 가족에게 보낼 수 있게 새 링크를 보여 준다.
  expect(screen.getByLabelText('학부모 링크')).toHaveValue(
    `${window.location.origin}/p/${NEW_TOKEN}`,
  )
  // 앞뒤 공백만 덜어 보낸다. 띄어쓰기·하이픈은 서버가 맞춘다.
  const sent = requestOf(RELINK)
  expect(sent.body).toEqual({ studentName: '김도윤', guardianPhone: PHONE })
  expect(sent.headers.has('Idempotency-Key')).toBe(false)
  // 번호는 본문에만 있다. 주소와 화면 이동 상태에는 없다.
  expect(requests().every((key) => !key.includes('?'))).toBe(true)
  expect(router.state.location.state).toEqual({ relinked: true })
  expect(JSON.stringify(router.state.location)).not.toContain('1234')
})

test.each([
  ['', '', '학생 이름을 적어 주세요.', '학부모 휴대전화 번호를 적어 주세요.'],
  ['김도윤', '1234', undefined, '휴대전화 번호 형식이 맞지 않아요.'],
])(
  '칸이 비었거나 번호 형식이 틀리면 보내지 않고 칸에 알린다(이름 "%s", 번호 "%s")',
  async (...args) => {
    const [name, phone, nameError, phoneError] = args
    await openPage()
    await fill(name, phone)

    await submit()

    if (nameError) expect(screen.getByLabelText('학생 이름')).toHaveAccessibleDescription(nameError)
    expect(screen.getByLabelText('학부모 휴대전화')).toHaveAccessibleDescription(phoneError)
    expectNoRequests()
  },
)

test('이름이나 번호가 맞지 않으면(404) 어느 쪽인지 밝히지 않고 번호를 다시 확인하게 한다', async () => {
  mockApi({
    [RELINK]: () =>
      problemResponse(404, {
        code: 'DONGTANPASS_PASS_NOT_FOUND',
        detail: '패스를 찾을 수 없습니다.',
      }),
  })
  await openPage()
  await fill('김도윤', PHONE)

  await submit()

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '이름이나 번호가 맞지 않아요. 패스를 받을 때 알려 준 번호인지 확인해 주세요.',
  )
  // 서버 문구를 되풀이하지 않는다. 입력은 그대로 둔다.
  expect(screen.queryByText('패스를 찾을 수 없습니다.')).not.toBeInTheDocument()
  expect(screen.getByLabelText('학부모 휴대전화')).toHaveValue(PHONE)
})

test('이름과 번호는 맞지만 쓸 수 있는 패스가 없으면(409) 서버가 준 사정과 함께 학원에 문의하라고 한다', async () => {
  mockApi({
    [RELINK]: () =>
      problemResponse(409, {
        code: 'DONGTANPASS_PASS_ALREADY_REDEEMED',
        detail: '이미 사용한 패스입니다.',
      }),
  })
  await openPage()
  await fill('김도윤', PHONE)

  await submit()

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '이미 사용한 패스입니다. 패스를 발급한 학원에 문의해 주세요.',
  )
})

test('여러 번 틀려 잠시 막히면(429) 몇 분 뒤에 다시 하라고 알린다', async () => {
  mockApi({
    [RELINK]: () =>
      tooManyRequests(
        { code: 'DONGTANPASS_HOLDER_RELINK_LIMITED', detail: '잠시 후 다시 시도해 주세요.' },
        '600',
      ),
  })
  await openPage()
  await fill('김도윤', PHONE)

  await submit()

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('여러 번 맞지 않아 잠시 막혔어요. 약 10분 뒤에 다시 해 주세요.')
  expect(alert).toHaveTextContent('같은 와이파이를 쓰는 다른 사람 때문일 수도 있어요.')
})

test('서버가 번호 형식이 틀렸다고 하면(400) 번호 칸에 알린다', async () => {
  mockApi({
    [RELINK]: () =>
      problemResponse(400, {
        detail: '입력값이 올바르지 않습니다.',
        code: 'COMMON_VALIDATION_FAILED',
        errors: [{ field: 'guardianPhone', message: '형식이 올바르지 않습니다.' }],
      }),
  })
  await openPage()
  await fill('김도윤', PHONE)

  await submit()

  await waitFor(() =>
    expect(screen.getByLabelText('학부모 휴대전화')).toHaveAccessibleDescription(
      '형식이 올바르지 않습니다.',
    ),
  )
})

test('응답을 받지 못하면 새 링크가 만들어졌을 수 있다고 알리고, 콘솔에 번호를 남기지 않는다', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  mockApi({ [RELINK]: () => unreadableResponse('req-relink-1') })
  await openPage()
  await fill('김도윤', PHONE)

  await submit()

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('새 링크가 만들어졌을 수도 있어요.')
  expect(alert).toHaveTextContent('req-relink-1')
  expect(consoleError).toHaveBeenCalled()
  const logged = JSON.stringify(consoleError.mock.calls)
  expect(logged).not.toContain('1234')
  expect(logged).not.toContain('5678')
  expect(logged).not.toContain('김도윤')
  consoleError.mockRestore()
})

test('서버 오류(500)여도 다시 보내지 않는다. 다시 보내면 링크가 또 바뀌어 가족에게 보낸 링크가 막힌다', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockApi({ [RELINK]: () => problemResponse(500, { detail: '일시적인 문제가 생겼어요.' }) })
  await openPage()
  await fill('김도윤', PHONE)

  await submit()

  expect(await screen.findByRole('alert')).toHaveTextContent('새 링크가 만들어졌을 수도 있어요.')
  // 다시 보내는 설정이 있었다면 이 사이에 나갔을 것이다(재시도 첫 간격은 1초다).
  await new Promise((resolve) => setTimeout(resolve, 1200))
  expect(requests().filter((key) => key === RELINK)).toHaveLength(1)
})

test('받는 중에는 다시 누를 수 없다', async () => {
  let answer: (response: Response) => void = () => {}
  mockApi({
    [RELINK]: () => new Promise<Response>((resolve) => (answer = resolve)),
    [VIEW]: () => jsonResponse(pass),
    [QR]: () => jsonResponse({ qrToken: 'qr-token-1', expiresAt: '2026-10-17T03:00:59Z' }),
  })
  const { router } = await openPage()
  await fill('김도윤', PHONE)

  await submit()

  const button = await screen.findByRole('button', { name: '받는 중' })
  expect(button).toBeDisabled()
  await userEvent.click(button)
  await userEvent.type(screen.getByLabelText('학부모 휴대전화'), '{Enter}')
  expect(requests().filter((key) => key === RELINK)).toHaveLength(1)

  answer(jsonResponse({ linkToken: NEW_TOKEN }))
  await waitFor(() => expect(router.state.location.pathname).toBe(`/p/${NEW_TOKEN}`))
})

test('보안 토큰이 없다는 답(403)이면 기술 용어 없이 새로 고친 뒤 다시 하라고 한다', async () => {
  mockApi({
    [RELINK]: () =>
      problemResponse(403, { detail: 'Invalid CSRF token', code: 'COMMON_FORBIDDEN' }),
  })
  await openPage()
  await fill('김도윤', PHONE)

  await submit()

  expect(await screen.findByRole('alert')).toHaveTextContent('화면을 새로 고친 뒤 다시 해 주세요.')
  expect(screen.queryByText(/CSRF/)).not.toBeInTheDocument()
})

test('다시 눌렀는데 앞에서 막히면 지난 서버 안내는 지운다', async () => {
  mockApi({
    [RELINK]: () =>
      problemResponse(404, {
        code: 'DONGTANPASS_PASS_NOT_FOUND',
        detail: '패스를 찾을 수 없습니다.',
      }),
  })
  await openPage()
  await fill('김도윤', PHONE)
  await submit()
  expect(await screen.findByRole('alert')).toHaveTextContent('이름이나 번호가 맞지 않아요.')

  await userEvent.clear(screen.getByLabelText('학부모 휴대전화'))
  await submit()

  expect(screen.getByLabelText('학부모 휴대전화')).toHaveAccessibleDescription(
    '학부모 휴대전화 번호를 적어 주세요.',
  )
  expect(screen.queryByText(/이름이나 번호가 맞지 않아요/)).not.toBeInTheDocument()
  expect(requests().filter((key) => key === RELINK)).toHaveLength(1)
})
