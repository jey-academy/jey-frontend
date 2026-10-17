import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import {
  jsonResponse,
  mockApi,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
  tooManyRequests,
  unreadableResponse,
} from '@/test/mockApi'
import { renderApp, staff } from '@/test/renderApp'
import type { VerifiedPass } from '../api'

setupMockApi()

const PATH = '/desk/dongtanpass'
const VERIFY = 'POST /api/v1/dongtanpass/passes/verify'
// USB 스캐너가 입력 칸에 넣는 QR 글자(서명이 붙은 긴 글자, 대소문자 구분).
const QR = 'eyJ2IjoxLCJwIjo0Mn0.aGVsbG8td29ybGQtc2lnbmF0dXJlLXRoYXQtaXMtbG9uZw-abcDEF_123'

const pass: VerifiedPass = {
  passId: 42,
  passNo: 'DT-ABC234',
  partnerName: '햇살수학',
  studentName: '김*윤',
  issuedOn: '2026-10-16',
  expiresOn: '2026-11-16',
  discountRate: 0.05,
}

function input() {
  return screen.getByRole('textbox', { name: '패스 번호' })
}

function result() {
  return screen.getByRole('region', { name: '패스 확인 결과' })
}

async function check(value: string) {
  const user = userEvent.setup()
  renderApp(PATH, { me: staff })
  await user.type(await screen.findByRole('textbox', { name: '패스 번호' }), `${value}{Enter}`)
  return user
}

test('들어오면 검색 상자에 포커스하고 서버에 묻지 않는다', async () => {
  renderApp(PATH, { me: staff })

  expect(await screen.findByRole('heading', { level: 1, name: '패스 확인' })).toBeInTheDocument()
  expect(input()).toHaveFocus()
  expect(input()).toHaveAccessibleDescription('QR 스캐너를 연결했다면 이 칸에 바로 찍으면 돼요.')
  // 카메라를 쓸 수 없는 브라우저(jsdom 기본)에서는 눌러도 안 되는 "QR 찍기"를 두지 않는다.
  expect(screen.queryByRole('button', { name: /QR 찍기/ })).not.toBeInTheDocument()
  expect(requests()).toEqual([])
})

test('패스 번호는 공백을 떼고 대문자로 보내고, 쓸 수 있는 패스면 상태 띠와 학생 줄을 보여 준다', async () => {
  mockApi({ [VERIFY]: () => jsonResponse(pass) })
  await check('dt-abc 234')

  expect(
    await within(await screen.findByRole('region', { name: '패스 확인 결과' })).findByRole(
      'status',
    ),
  ).toHaveTextContent('사용할 수 있는 패스예요2026.11.16까지 쓸 수 있어요.')
  expect(requestOf(VERIFY).body).toEqual({ passNo: 'DT-ABC234' })
  // 확인은 멱등 키를 받지 않는다(@NotIdempotent).
  expect(requestOf(VERIFY).headers.has('Idempotency-Key')).toBe(false)

  // 이름은 서버가 가린 그대로. 학부모 전화번호는 없다.
  expect(result()).toHaveTextContent('김*윤')
  expect(result()).toHaveTextContent('DT-ABC234|햇살수학 발급|2026.11.16까지')
  expect(result()).toHaveTextContent('첫 달 5% 할인')
  expect(
    screen.getByText(/본인 확인과 학생 등록, 사용 처리 화면은 준비 중이에요/),
  ).toBeInTheDocument()
  // 번호는 오타를 고쳐 다시 확인할 수 있게 칸에 남긴다.
  expect(input()).toHaveValue('dt-abc 234')
})

test('스캐너가 넣은 긴 글자는 QR로 그대로 보내고, 보낸 뒤 칸을 비운다', async () => {
  mockApi({ [VERIFY]: () => jsonResponse(pass) })
  await check(QR)

  await screen.findByRole('region', { name: '패스 확인 결과' })
  expect(requestOf(VERIFY).body).toEqual({ qrToken: QR })
  expect(input()).toHaveValue('')
})

test('비어 있으면 보내지 않고 칸에 포커스를 둔다', async () => {
  const user = userEvent.setup()
  renderApp(PATH, { me: staff })

  await user.click(await screen.findByRole('button', { name: '확인하기' }))

  expect(input()).toHaveFocus()
  expect(requests()).toEqual([])
})

test.each([
  ['DONGTANPASS_PASS_ALREADY_REDEEMED', '이미 사용한 패스예요', '이미 사용 처리된 패스입니다.'],
  ['DONGTANPASS_PASS_EXPIRED', '사용 기한이 지난 패스예요', '사용 기한이 지난 패스입니다.'],
  ['DONGTANPASS_PASS_CANCELED', '발급이 취소된 패스예요', '발급이 취소된 패스입니다.'],
])(
  '쓸 수 없는 패스(409 %s)는 그 상태 띠와 서버의 사정을 보여 준다',
  async (code, title, detail) => {
    mockApi({ [VERIFY]: () => problemResponse(409, { code, detail }) })
    await check('DT-ABC234')

    const panel = await screen.findByRole('region', { name: '패스 확인 결과' })
    expect(within(panel).getByRole('status')).toHaveTextContent(`${title}${detail}`)
    // 오류 응답에는 패스 정보가 없다. 학생 줄과 다음 단계 안내를 그리지 않는다.
    expect(panel).not.toHaveTextContent('할인')
    expect(screen.queryByText(/준비 중이에요/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음 패스 확인하기' })).toBeInTheDocument()
  },
)

test.each([
  [
    'QR이 틀렸거나 이미 쓴 것(400)',
    () => problemResponse(400, { code: 'DONGTANPASS_QR_INVALID', detail: '서버 문구' }),
    'QR을 확인하지 못했어요. 학부모 화면에서 QR을 새로 받아 다시 찍어 주세요.',
  ],
  [
    '패스 번호 형식(400)',
    () =>
      problemResponse(400, {
        code: 'COMMON_VALIDATION_FAILED',
        errors: [{ field: 'passNo', message: '형식이 올바르지 않습니다.' }],
      }),
    '패스 번호 형식이 맞지 않아요. DT-로 시작하는 번호인지 다시 확인해 주세요.',
  ],
  [
    'QR 글자가 너무 김(400)',
    () =>
      problemResponse(400, {
        code: 'COMMON_VALIDATION_FAILED',
        errors: [{ field: 'qrToken', message: '200자 이하여야 합니다' }],
      }),
    'QR을 확인하지 못했어요. 학부모 화면에서 QR을 새로 받아 다시 찍어 주세요.',
  ],
  [
    '없는 번호(404)',
    () => problemResponse(404, { code: 'DONGTANPASS_PASS_NOT_FOUND', detail: '서버 문구' }),
    '이 번호의 패스가 없어요. 학부모 화면의 패스 번호를 다시 확인해 주세요.',
  ],
  [
    '패스를 받지 않는 지점(403)',
    () => problemResponse(403, { code: 'DONGTANPASS_CAMPUS_NOT_PROVIDING', detail: '서버 문구' }),
    '이 지점은 동탄고 패스를 받지 않아요. 패스를 받는 지점에서 확인해 주세요.',
  ],
  [
    '번호 확인을 너무 많이 함(429)',
    () => tooManyRequests({ code: 'DONGTANPASS_PASS_NO_VERIFY_LIMITED' }, '90'),
    '패스 번호 확인을 여러 번 했어요. 약 2분 뒤에 다시 하거나, QR로 확인해 주세요.',
  ],
])('%s는 검색 상자 아래에 할 일을 알려 준다', async (_name, respond, message) => {
  mockApi({ [VERIFY]: respond })
  await check('DT-ABC234')

  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(screen.queryByRole('region', { name: '패스 확인 결과' })).not.toBeInTheDocument()
})

test('응답을 읽지 못하면 다시 확인해도 된다고 알리고, 요청 번호를 보여 준다', async () => {
  mockApi({ [VERIFY]: () => unreadableResponse('req-desk-1') })
  await check('DT-ABC234')

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent(
    '다시 확인해 주세요. QR이 통하지 않으면 학부모 화면에서 새 QR을 받아 주세요.',
  )
  expect(alert).toHaveTextContent('req-desk-1')
})

test('확인하는 동안 버튼을 막고, 끝나면 다시 쓸 수 있다', async () => {
  let answer: (response: Response) => void = () => {}
  mockApi({ [VERIFY]: () => new Promise<Response>((resolve) => (answer = resolve)) })
  await check('DT-ABC234')

  expect(await screen.findByRole('button', { name: '확인하는 중' })).toBeDisabled()
  answer(jsonResponse(pass))
  expect(await screen.findByRole('button', { name: '확인하기' })).toBeEnabled()
})

test('다음 패스 확인하기를 누르면 결과와 칸을 비우고 칸에 포커스한다', async () => {
  mockApi({ [VERIFY]: () => jsonResponse(pass) })
  const user = await check('DT-ABC234')

  await user.click(await screen.findByRole('button', { name: '다음 패스 확인하기' }))

  expect(screen.queryByRole('region', { name: '패스 확인 결과' })).not.toBeInTheDocument()
  expect(input()).toHaveValue('')
  expect(input()).toHaveFocus()
})

test('번호가 틀렸으면 칸에 남겨 고쳐 다시 확인할 수 있고, 앞의 안내는 지운다', async () => {
  let call = 0
  mockApi({
    [VERIFY]: () =>
      ++call === 1
        ? problemResponse(404, { code: 'DONGTANPASS_PASS_NOT_FOUND' })
        : jsonResponse(pass),
  })
  const user = await check('DT-ABC23')
  await screen.findByRole('alert')
  expect(input()).toHaveValue('DT-ABC23')

  // 칸 전체가 선택돼 있으니 끝으로 옮겨 한 글자를 더한다.
  await user.type(input(), '{ArrowRight}4{Enter}')

  expect(await screen.findByRole('region', { name: '패스 확인 결과' })).toBeInTheDocument()
  expect(requestOf(VERIFY).body).toEqual({ passNo: 'DT-ABC234' })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

// ── 다음 입력 받기 (USB 스캐너는 포커스된 칸의 커서 자리에 글자를 친다) ─────────────

test('번호로 확인한 뒤 칸을 전체 선택해 두어, 다음 스캔이 앞의 번호에 이어 붙지 않는다', async () => {
  mockApi({ [VERIFY]: () => jsonResponse(pass) })
  const user = await check('DT-ABC234')
  await screen.findByRole('region', { name: '패스 확인 결과' })

  expect(input()).toHaveFocus()
  const field = input() as HTMLInputElement
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, 'DT-ABC234'.length])

  await user.keyboard(`${QR}{Enter}`)

  await screen.findByRole('region', { name: '패스 확인 결과' })
  expect(requestOf(VERIFY).body).toEqual({ qrToken: QR })
})

test('확인하기를 눌러 확인한 뒤에도 칸으로 포커스가 돌아온다', async () => {
  const user = userEvent.setup()
  mockApi({ [VERIFY]: () => jsonResponse(pass) })
  renderApp(PATH, { me: staff })
  await user.type(await screen.findByRole('textbox', { name: '패스 번호' }), 'DT-ABC234')

  await user.click(screen.getByRole('button', { name: '확인하기' }))

  await screen.findByRole('region', { name: '패스 확인 결과' })
  expect(input()).toHaveFocus()
})

test.each([
  ['쓸 수 없는 패스(409)', () => problemResponse(409, { code: 'DONGTANPASS_PASS_CANCELED' })],
  ['틀렸거나 이미 쓴 QR(400)', () => problemResponse(400, { code: 'DONGTANPASS_QR_INVALID' })],
])(
  'QR 확인이 실패해도(%s) 그 QR은 다시 쓸 수 없으니 칸을 비우고 포커스를 둔다',
  async (_name, respond) => {
    mockApi({ [VERIFY]: respond })
    await check(QR)

    await screen.findByText(/발급이 취소된 패스예요|QR을 확인하지 못했어요/)
    expect(input()).toHaveValue('')
    expect(input()).toHaveFocus()
  },
)

test('쓸 수 있는 패스를 본 뒤 다음 확인이 쓸 수 없는 패스면, 앞 패스의 결과를 남기지 않는다', async () => {
  let call = 0
  mockApi({
    [VERIFY]: () =>
      ++call === 1
        ? jsonResponse(pass)
        : problemResponse(409, { code: 'DONGTANPASS_PASS_CANCELED', detail: '취소된 패스입니다.' }),
  })
  const user = await check('DT-ABC234')
  await screen.findByText('사용할 수 있는 패스예요')

  // "다음 패스 확인하기"를 누르지 않고 바로 다음 번호를 친다(칸이 선택돼 있어 덮어쓴다).
  await user.keyboard('DT-XYZ789{Enter}')

  expect(await screen.findByText('발급이 취소된 패스예요')).toBeInTheDocument()
  expect(result()).not.toHaveTextContent('사용할 수 있는 패스예요')
  expect(result()).not.toHaveTextContent('할인')
  expect(screen.queryByText(/준비 중이에요/)).not.toBeInTheDocument()
  expect(requestOf(VERIFY).body).toEqual({ passNo: 'DT-XYZ789' })
})

test('쓸 수 없는 패스 결과에서도 다음 패스 확인하기로 비우고 칸에 포커스한다', async () => {
  mockApi({ [VERIFY]: () => problemResponse(409, { code: 'DONGTANPASS_PASS_EXPIRED' }) })
  const user = await check('DT-ABC234')

  await user.click(await screen.findByRole('button', { name: '다음 패스 확인하기' }))

  expect(screen.queryByRole('region', { name: '패스 확인 결과' })).not.toBeInTheDocument()
  expect(input()).toHaveValue('')
  expect(input()).toHaveFocus()
})
