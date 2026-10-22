import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, onTestFinished, test, vi } from 'vitest'
import { UNSURE_RESEND_AS_IS } from '@/shared/api'
import { formatDate, todayInSeoul } from '@/shared/lib'
import { setupDialog } from '@/test/dialog'
import {
  expectNoRequests,
  jsonResponse,
  mockApi,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
  unreadableResponse,
} from '@/test/mockApi'
import { admin, partner, renderApp } from '@/test/renderApp'
import { consentNoticeQueryKey, type ConsentNotice, type IssuedPass } from '../api'

setupMockApi()
setupDialog()

const PATH = '/partner/passes/new'
const NOTICE = 'GET /api/v1/dongtanpass/consent-notice'
const ISSUE = 'POST /api/v1/dongtanpass/passes'

const notice: ConsentNotice = {
  version: '2026-10-01',
  text: '수집하는 정보: 학생 이름, 학부모 휴대전화\n보관 기간: 패스 만료 후 1년',
}
const issued: IssuedPass = {
  id: 7,
  passNo: 'DT-7KQ4MX',
  linkToken: 'k7Qm2xVa9LpR4tWz',
  issuedAt: '2026-10-16T01:00:00Z',
  expiresOn: '2026-11-16',
}

function mockNotice(body: ConsentNotice = notice) {
  mockApi({ [NOTICE]: () => jsonResponse(body) })
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

async function openPage() {
  renderApp(PATH, { me: partner })
  await screen.findByText(/수집하는 정보/)
}

async function type(label: string, value: string) {
  const input = screen.getByLabelText(label)
  await userEvent.clear(input)
  if (value) await userEvent.type(input, value)
}

/** 모든 칸을 맞게 채우고 동의를 확인한다. */
async function fillValid() {
  await type('학생 이름', ' 김도윤 ')
  await type('학부모 휴대전화', '010-1234-5678 ')
  await type('결제 금액(원)', '280,000')
  await userEvent.click(screen.getByRole('radio', { name: '카드' }))
  await userEvent.click(screen.getByRole('checkbox', { name: '학부모에게 알리고 동의를 받았어요' }))
}

function submit() {
  return userEvent.click(screen.getByRole('button', { name: '패스 발급하기' }))
}

async function confirmDialog() {
  const dialog = await screen.findByRole('dialog', { name: '이대로 발급할까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '발급하기' }))
}

/** 확인 창 요약에서 이름표 옆의 값 */
function summaryValue(dialog: HTMLElement, label: string) {
  return within(dialog).getByText(label).nextElementSibling?.textContent
}

function resultCard() {
  return screen.getByRole('heading', { name: '발급 결과' }).parentElement as HTMLElement
}

test('관리자는 이 화면을 볼 수 없고 고지 문구를 요청하지도 않는다', async () => {
  renderApp(PATH, { me: admin })

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '패스 발급' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '패스 발급하기' })).not.toBeInTheDocument()
  expectNoRequests()
})

test('고지 문구를 줄바꿈 그대로 보여 주고, 동의를 확인해야 발급 버튼이 켜진다', async () => {
  mockNotice()
  await openPage()

  expect(screen.getByText(/수집하는 정보/).textContent).toBe(notice.text)
  expect(screen.getByText(/수집하는 정보/)).toHaveClass('whitespace-pre-line')
  expect(screen.getByLabelText('결제일')).toHaveValue(todayInSeoul())
  // 결제 칸은 "근거 결제" 묶음 안에 있고, 할인 계산에 쓰지 않는다고 알린다.
  const basis = screen.getByRole('region', { name: '근거 결제' })
  expect(within(basis).getByLabelText('결제일')).toBeInTheDocument()
  expect(within(basis).getByLabelText('결제 금액(원)')).toBeInTheDocument()
  expect(basis).toHaveTextContent('할인 금액 계산에는 쓰지 않아요')
  const button = screen.getByRole('button', { name: '패스 발급하기' })
  expect(button).toBeDisabled()

  await userEvent.click(screen.getByRole('checkbox', { name: '학부모에게 알리고 동의를 받았어요' }))
  expect(button).toBeEnabled()
})

test('고지 문구를 받는 동안에는 동의 칸과 발급 버튼이 막혀 있다', async () => {
  mockApi({ [NOTICE]: () => new Promise<Response>(() => {}) })
  renderApp(PATH, { me: partner })

  expect(await screen.findByText('안내 문구를 불러오고 있어요.')).toBeInTheDocument()
  expect(screen.getByRole('checkbox')).toBeDisabled()
  expect(screen.getByRole('button', { name: '패스 발급하기' })).toBeDisabled()
})

test('고지 문구를 받지 못하면 알리고 다시 불러올 수 있다', async () => {
  let fail = true
  mockApi({ [NOTICE]: () => (fail ? unreadableResponse() : jsonResponse(notice)) })
  renderApp(PATH, { me: partner })

  expect(
    await screen.findByText(/안내 문구를 불러오지 못했어요. 문구를 받아야 발급할 수 있어요./),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '패스 발급하기' })).toBeDisabled()

  fail = false
  await userEvent.click(screen.getByRole('button', { name: '안내 문구 다시 불러오기' }))
  expect(await screen.findByText(/수집하는 정보/)).toBeInTheDocument()
  expect(screen.getByRole('checkbox')).toBeEnabled()
})

test('빈 칸을 모두 알리고 보내지 않는다', async () => {
  mockNotice()
  await openPage()
  await type('결제일', '')
  await userEvent.click(screen.getByRole('checkbox', { name: '학부모에게 알리고 동의를 받았어요' }))

  await submit()

  expect(screen.getByLabelText('학생 이름')).toHaveAccessibleDescription(
    '학생 이름을 입력해 주세요.',
  )
  expect(screen.getByLabelText('학부모 휴대전화')).toHaveAccessibleDescription(
    '학부모 휴대전화 번호를 입력해 주세요.',
  )
  expect(screen.getByLabelText('결제일')).toHaveAccessibleDescription('결제일을 골라 주세요.')
  expect(screen.getByLabelText('결제 금액(원)')).toHaveAccessibleDescription(
    '결제 금액을 입력해 주세요.',
  )
  expect(screen.getByRole('radiogroup', { name: '결제 수단' })).toHaveAccessibleDescription(
    '결제 수단을 골라 주세요.',
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(count(ISSUE)).toBe(0)
})

test('형식이 틀린 칸을 알리고 보내지 않는다', async () => {
  mockNotice()
  await openPage()
  await fillValid()
  await type('학생 이름', '가'.repeat(51))
  await type('학부모 휴대전화', '02-123-4567')
  await type('결제 금액(원)', '280,00')
  // 내일. 날짜 칸의 max는 키보드 입력을 막지 못한다.
  const tomorrow = new Date(`${todayInSeoul()}T12:00:00+09:00`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  await type('결제일', todayInSeoul(tomorrow))

  await submit()

  expect(screen.getByLabelText('학생 이름')).toHaveAccessibleDescription('50자까지 적을 수 있어요.')
  expect(screen.getByLabelText('학부모 휴대전화')).toHaveAccessibleDescription(
    '휴대전화 번호 형식이 아니에요. 예: 010-1234-5678',
  )
  expect(screen.getByLabelText('결제 금액(원)')).toHaveAccessibleDescription(
    '금액을 숫자로 적어 주세요. 예: 280,000',
  )
  expect(screen.getByLabelText('결제일')).toHaveAccessibleDescription(
    '결제일은 오늘보다 뒤일 수 없어요.',
  )
  expect(count(ISSUE)).toBe(0)
})

test('확인 창에서 다시 확인을 누르면 보내지 않고 닫는다', async () => {
  mockNotice()
  await openPage()
  await fillValid()

  await submit()
  const dialog = await screen.findByRole('dialog', { name: '이대로 발급할까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '다시 확인' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(count(ISSUE)).toBe(0)
})

test('확인 창에서 요약을 보여 주고, 발급하면 서버 형식 그대로 보낸 뒤 결과와 학부모 링크를 보여 준다', async () => {
  // jsdom에는 scrollIntoView가 없다. 이 테스트에서만 두고 끝나면 지운다.
  const scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView = scrollIntoView
  onTestFinished(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })
  mockNotice()
  mockApi({ [ISSUE]: () => jsonResponse(issued, 201) })
  await openPage()
  await fillValid()

  await submit()
  const dialog = await screen.findByRole('dialog', { name: '이대로 발급할까요?' })
  expect(summaryValue(dialog, '학생 이름')).toBe('김도윤')
  expect(summaryValue(dialog, '결제일')).toBe(formatDate(todayInSeoul()))
  expect(summaryValue(dialog, '결제 금액')).toBe('280,000원')
  expect(summaryValue(dialog, '결제 수단')).toBe('카드')
  // 결제 세 줄은 "근거 결제" 묶음 안에, 학생 이름은 그 밖에 있다.
  const basis = within(dialog).getByRole('region', { name: '근거 결제' })
  expect(within(basis).getByText('결제일')).toBeInTheDocument()
  expect(within(basis).getByText('280,000원')).toBeInTheDocument()
  expect(within(basis).getByText('카드')).toBeInTheDocument()
  expect(within(basis).queryByText('김도윤')).not.toBeInTheDocument()
  // 전화번호는 요약에 다시 보여 주지 않는다.
  expect(dialog).not.toHaveTextContent('010-1234-5678')
  await confirmDialog()

  await screen.findByText('발급 완료')
  const { body, headers } = requestOf(ISSUE)
  expect(body).toEqual({
    studentName: '김도윤',
    guardianPhone: '010-1234-5678',
    paidOn: todayInSeoul(),
    paidAmount: 280000,
    paymentMethod: 'CARD',
    consentConfirmed: true,
    noticeVersion: '2026-10-01',
  })
  expect(headers.get('Idempotency-Key')).toBeTruthy()

  const card = resultCard()
  expect(card).toHaveTextContent('패스 번호 DT-7KQ4MX')
  expect(card).toHaveTextContent('김도윤 학생 · 2026.11.16까지 사용 가능')
  expect(within(card).getByRole('textbox', { name: '학부모 링크' })).toHaveValue(
    `${window.location.origin}/p/k7Qm2xVa9LpR4tWz`,
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  // 좁은 화면에서 폼 아래에 있는 결과가 보이게 하고, 포커스를 링크 복사로 옮긴다(발급 버튼은 막혀 있다).
  expect(scrollIntoView).toHaveBeenCalledOnce()
  expect(scrollIntoView.mock.contexts[0]).toHaveTextContent('DT-7KQ4MX')
  await waitFor(() => expect(within(card).getByRole('button', { name: '링크 복사' })).toHaveFocus())

  // 다음 학부모를 받도록 비운다. 결제일은 남긴다.
  expect(screen.getByLabelText('학생 이름')).toHaveValue('')
  expect(screen.getByLabelText('학부모 휴대전화')).toHaveValue('')
  expect(screen.getByLabelText('결제 금액(원)')).toHaveValue('')
  expect(screen.getByRole('radio', { name: '카드' })).not.toBeChecked()
  expect(screen.getByLabelText('결제일')).toHaveValue(todayInSeoul())
  expect(screen.getByRole('checkbox')).not.toBeChecked()
})

test('결과의 링크를 복사한다. 복사가 막히면 직접 복사하라고 알린다', async () => {
  const writeText = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('denied'))
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
  mockNotice()
  mockApi({ [ISSUE]: () => jsonResponse(issued, 201) })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()
  await screen.findByText('발급 완료')

  await userEvent.click(screen.getByRole('button', { name: '링크 복사' }))
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/k7Qm2xVa9LpR4tWz`)
  expect(await screen.findByRole('button', { name: '복사했어요' })).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '복사했어요' }))
  expect(
    await screen.findByText('링크를 복사하지 못했어요. 링크 칸을 눌러 직접 복사해 주세요.'),
  ).toBeInTheDocument()

  // 다음 패스를 발급하면 앞 패스의 복사 결과는 남지 않는다.
  mockApi({ [ISSUE]: () => jsonResponse({ ...issued, id: 8, passNo: 'DT-9WXYZA' }, 201) })
  await fillValid()
  await submit()
  await confirmDialog()
  await screen.findByText(/DT-9WXYZA/)
  expect(
    screen.queryByText('링크를 복사하지 못했어요. 링크 칸을 눌러 직접 복사해 주세요.'),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '링크 복사' })).toBeInTheDocument()
})

test('고지 문구가 바뀌었다는 답이면 새 문구를 받아 보여 주고 다시 확인하게 한다', async () => {
  let current = notice
  mockApi({ [NOTICE]: () => jsonResponse(current) })
  mockApi({
    [ISSUE]: () => {
      current = { version: '2026-10-16', text: '수집하는 정보: 바뀐 문구' }
      return problemResponse(400, {
        detail: '고지 문구가 바뀌었습니다.',
        code: 'DONGTANPASS_NOTICE_VERSION_MISMATCH',
      })
    },
  })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()

  expect(await screen.findByText('수집하는 정보: 바뀐 문구')).toBeInTheDocument()
  expect(
    screen.getByText('안내 문구가 바뀌었어요. 바뀐 문구를 학부모에게 다시 알리고 확인해 주세요.'),
  ).toBeInTheDocument()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  expect(screen.getByRole('button', { name: '패스 발급하기' })).toBeDisabled()
  // 서버 문구를 따로 되풀이하지 않는다.
  expect(screen.queryByText('고지 문구가 바뀌었습니다.')).not.toBeInTheDocument()
  // 입력은 남는다. 다시 확인하도록 동의 칸으로 포커스를 옮긴다.
  expect(screen.getByLabelText('학생 이름')).toHaveValue(' 김도윤 ')
  await waitFor(() => expect(screen.getByRole('checkbox')).toHaveFocus())

  mockApi({ [ISSUE]: () => jsonResponse(issued, 201) })
  await userEvent.click(screen.getByRole('checkbox'))
  // 바뀐 문구로 다시 확인했으니 안내가 사라진다(뒤에서 바뀐 경우와 같다).
  expect(screen.queryByText(/안내 문구가 바뀌었어요/)).not.toBeInTheDocument()
  await submit()
  await confirmDialog()
  await screen.findByText('발급 완료')
  expect(requestOf(ISSUE).body).toMatchObject({ noticeVersion: '2026-10-16' })
})

test('문구가 바뀌었다는 답 뒤에 새 문구를 받는 동안과 받지 못했을 때 옛 문구를 보여 주지 않고 동의 칸을 막는다', async () => {
  let notices = 0
  let respond: (response: Response) => void = () => {}
  mockApi({
    [NOTICE]: () => {
      notices += 1
      if (notices === 1) return jsonResponse(notice)
      // 두 번째(다시 받기)는 붙잡아 두었다가 실패시킨다.
      return new Promise<Response>((resolve) => (respond = resolve))
    },
    [ISSUE]: () =>
      problemResponse(400, { detail: 'x', code: 'DONGTANPASS_NOTICE_VERSION_MISMATCH' }),
  })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()

  // 받는 동안
  expect(await screen.findByText('안내 문구를 불러오고 있어요.')).toBeInTheDocument()
  expect(screen.queryByText(/보관 기간/)).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox')).toBeDisabled()

  // 받지 못함. 읽지 못한 응답은 조회가 다시 보내지 않는다.
  respond(unreadableResponse())
  expect(
    await screen.findByText(/안내 문구를 불러오지 못했어요. 문구를 받아야 발급할 수 있어요./),
  ).toBeInTheDocument()
  expect(screen.queryByText(/보관 기간/)).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox')).toBeDisabled()
  expect(screen.getByRole('button', { name: '패스 발급하기' })).toBeDisabled()

  // 다시 불러오면 새 문구가 나오고 동의 칸이 켜진다.
  mockApi({
    [NOTICE]: () => jsonResponse({ version: '2026-10-16', text: '수집하는 정보: 새 문구' }),
  })
  await userEvent.click(screen.getByRole('button', { name: '안내 문구 다시 불러오기' }))
  expect(await screen.findByText('수집하는 정보: 새 문구')).toBeInTheDocument()
  expect(screen.getByRole('checkbox')).toBeEnabled()
})

test('문구가 바뀌었다는 답 뒤에 다른 실패가 나면 그 실패를 알리고 문구 경고는 지운다', async () => {
  let current = notice
  mockApi({ [NOTICE]: () => jsonResponse(current) })
  mockApi({
    [ISSUE]: () => {
      current = { version: '2026-10-16', text: '수집하는 정보: 바뀐 문구' }
      return problemResponse(400, { detail: 'x', code: 'DONGTANPASS_NOTICE_VERSION_MISMATCH' })
    },
  })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()
  await screen.findByText('수집하는 정보: 바뀐 문구')

  mockApi({ [ISSUE]: () => unreadableResponse() })
  await userEvent.click(screen.getByRole('checkbox'))
  await submit()
  await confirmDialog()

  expect(await screen.findByText(new RegExp(UNSURE_RESEND_AS_IS))).toBeInTheDocument()
  expect(screen.queryByText(/안내 문구가 바뀌었어요/)).not.toBeInTheDocument()
})

test('발급하는 동안에는 확인 창을 닫을 수 없고 버튼과 입력칸이 막혀 한 번만 보낸다', async () => {
  let respond: (response: Response) => void = () => {}
  mockNotice()
  mockApi({ [ISSUE]: () => new Promise<Response>((resolve) => (respond = resolve)) })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()

  const dialog = screen.getByRole('dialog', { name: '이대로 발급할까요?' })
  await waitFor(() =>
    expect(within(dialog).getByRole('button', { name: '발급하는 중' })).toBeDisabled(),
  )
  expect(within(dialog).getByRole('button', { name: '다시 확인' })).toBeDisabled()
  expect(screen.getByLabelText('학생 이름')).toBeDisabled()
  // Esc(cancel)로도 닫히지 않는다.
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('dialog', { name: '이대로 발급할까요?' })).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: '발급하는 중' }))
  expect(count(ISSUE)).toBe(1)

  respond(jsonResponse(issued, 201))
  expect(await screen.findByText('발급 완료')).toBeInTheDocument()
})

test('서버가 칸을 짚은 오류는 그 칸에 알리고 아래에 되풀이하지 않는다', async () => {
  mockNotice()
  mockApi({
    [ISSUE]: () =>
      problemResponse(400, {
        detail: '입력값이 올바르지 않습니다.',
        code: 'COMMON_VALIDATION_FAILED',
        errors: [{ field: 'guardianPhone', message: '형식이 올바르지 않습니다.' }],
      }),
  })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()

  await waitFor(() =>
    expect(screen.getByLabelText('학부모 휴대전화')).toHaveAccessibleDescription(
      '형식이 올바르지 않습니다.',
    ),
  )
  expect(screen.queryByText('입력값이 올바르지 않습니다.')).not.toBeInTheDocument()
  expect(screen.getAllByText('형식이 올바르지 않습니다.')).toHaveLength(1)
})

test('보내기 전 검사에 걸리면 지난번 서버 오류는 지운다', async () => {
  mockNotice()
  mockApi({
    [ISSUE]: () =>
      problemResponse(400, {
        detail: '결제 금액이 올바르지 않습니다.',
        code: 'DONGTANPASS_INVALID_PAID_AMOUNT',
      }),
  })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()
  await waitFor(() =>
    expect(screen.getByLabelText('결제 금액(원)')).toHaveAccessibleDescription(
      '결제 금액이 올바르지 않습니다.',
    ),
  )

  await type('학생 이름', '')
  await submit()

  expect(screen.getByLabelText('학생 이름')).toHaveAccessibleDescription(
    '학생 이름을 입력해 주세요.',
  )
  expect(screen.queryByText('결제 금액이 올바르지 않습니다.')).not.toBeInTheDocument()
})

test('동의를 확인하지 않았다는 답은 동의 칸에 알리고, 칸을 다시 누르면 지운다', async () => {
  mockNotice()
  mockApi({
    [ISSUE]: () =>
      problemResponse(400, {
        detail: '동의를 확인해야 발급할 수 있습니다.',
        code: 'DONGTANPASS_CONSENT_NOT_CONFIRMED',
      }),
  })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()

  const checkbox = screen.getByRole('checkbox', { name: '학부모에게 알리고 동의를 받았어요' })
  await waitFor(() =>
    expect(checkbox).toHaveAccessibleDescription('동의를 확인해야 발급할 수 있습니다.'),
  )
  await userEvent.click(checkbox)
  expect(screen.queryByText('동의를 확인해야 발급할 수 있습니다.')).not.toBeInTheDocument()
})

test.each([
  ['DONGTANPASS_PAID_ON_IN_FUTURE', '결제일', '결제일이 오늘보다 뒤입니다.'],
  ['DONGTANPASS_INVALID_PAID_AMOUNT', '결제 금액(원)', '결제 금액이 올바르지 않습니다.'],
])('%s는 %s 칸에 알린다', async (code, label, detail) => {
  mockNotice()
  mockApi({ [ISSUE]: () => problemResponse(400, { detail, code }) })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()

  await waitFor(() => expect(screen.getByLabelText(label)).toHaveAccessibleDescription(detail))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('고지 문구를 받을 때 꺼진 학원이라는 답이면 폼 없이 그 안내만 보여 준다', async () => {
  mockApi({
    [NOTICE]: () =>
      problemResponse(403, {
        detail: '이용이 중지된 학원입니다.',
        code: 'DONGTANPASS_PARTNER_INACTIVE',
      }),
  })
  renderApp(PATH, { me: partner })

  expect(await screen.findByText('이용이 중지된 학원입니다.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '패스 발급하기' })).not.toBeInTheDocument()
})

test('발급할 때 꺼진 학원이라는 답이면 폼 없이 그 안내만 보여 준다', async () => {
  mockNotice()
  mockApi({
    [ISSUE]: () =>
      problemResponse(403, {
        detail: '이용이 중지된 학원입니다.',
        code: 'DONGTANPASS_PARTNER_INACTIVE',
      }),
  })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()

  expect(await screen.findByText('이용이 중지된 학원입니다.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '패스 발급하기' })).not.toBeInTheDocument()
})

test('응답을 받지 못하면 그대로 다시 누르게 하고, 다시 보낼 때 같은 키를 싣는다', async () => {
  mockNotice()
  mockApi({ [ISSUE]: () => unreadableResponse() })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()

  expect(await screen.findByText(new RegExp(UNSURE_RESEND_AS_IS))).toBeInTheDocument()
  const firstKey = requestOf(ISSUE).headers.get('Idempotency-Key')
  // 동의 확인은 남아 있어 그대로 다시 누를 수 있다.
  expect(screen.getByRole('checkbox')).toBeChecked()

  mockApi({ [ISSUE]: () => jsonResponse(issued, 201) })
  await submit()
  await confirmDialog()

  await screen.findByText('발급 완료')
  expect(requestOf(ISSUE).headers.get('Idempotency-Key')).toBe(firstKey)
  expect(count(ISSUE)).toBe(2)
})

// ── 뒤에서 고지 문구를 다시 받을 때 ──────────────────────────

/** 동의까지 마친 뒤, 창 포커스·재연결처럼 고지 문구를 뒤에서 다시 받는다. 받은 문구를 돌려준다. */
async function refetchNoticeAfterConsent(next: ConsentNotice) {
  let current = notice
  mockApi({ [NOTICE]: () => jsonResponse(current) })
  const { queryClient } = renderApp(PATH, { me: partner })
  await screen.findByText(/수집하는 정보/)
  await fillValid()
  // 동의 뒤에 학생 이름 칸에서 고치는 중이다.
  await userEvent.click(screen.getByLabelText('학생 이름'))

  current = next
  await queryClient.refetchQueries({ queryKey: consentNoticeQueryKey })
}

test('동의한 뒤 다시 받은 고지 문구의 버전이 바뀌면, 동의를 풀고 다시 확인하게 한다. 입력 중인 칸의 포커스는 옮기지 않는다', async () => {
  await refetchNoticeAfterConsent({ version: '2026-10-16', text: '수집하는 정보: 바뀐 문구' })

  expect(await screen.findByText('수집하는 정보: 바뀐 문구')).toBeInTheDocument()
  expect(
    screen.getByText('안내 문구가 바뀌었어요. 바뀐 문구를 학부모에게 다시 알리고 확인해 주세요.'),
  ).toBeInTheDocument()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  // 학부모가 확인하지 않은 버전으로는 발급할 수 없다.
  expect(screen.getByRole('button', { name: '패스 발급하기' })).toBeDisabled()
  expect(screen.getByLabelText('학생 이름')).toHaveFocus()

  // 바뀐 문구로 다시 확인하면 안내가 사라지고, 새 버전으로 발급한다.
  await userEvent.click(screen.getByRole('checkbox', { name: '학부모에게 알리고 동의를 받았어요' }))
  expect(screen.queryByText(/안내 문구가 바뀌었어요/)).not.toBeInTheDocument()
  mockApi({ [ISSUE]: () => jsonResponse(issued, 201) })
  await submit()
  await confirmDialog()
  await screen.findByRole('heading', { name: '발급 결과' })
  expect(requestOf(ISSUE).body).toMatchObject({
    noticeVersion: '2026-10-16',
    consentConfirmed: true,
  })
})

test('다시 받은 고지 문구의 버전이 같으면 동의는 그대로다', async () => {
  await refetchNoticeAfterConsent({ ...notice })
  // 다시 받기가 실제로 일어났다(처음 + 다시).
  expect(count(NOTICE)).toBe(2)

  expect(screen.getByRole('checkbox', { name: '학부모에게 알리고 동의를 받았어요' })).toBeChecked()
  expect(screen.queryByText(/안내 문구가 바뀌었어요/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '패스 발급하기' })).toBeEnabled()
})

test('서버가 알려 준 칸 오류는 고지 문구가 뒤에서 바뀌어도 남는다', async () => {
  let current = notice
  mockApi({
    [NOTICE]: () => jsonResponse(current),
    [ISSUE]: () =>
      problemResponse(400, {
        detail: '입력값이 올바르지 않습니다.',
        code: 'COMMON_VALIDATION_FAILED',
        errors: [{ field: 'guardianPhone', message: '형식이 올바르지 않습니다.' }],
      }),
  })
  const { queryClient } = renderApp(PATH, { me: partner })
  await screen.findByText(/수집하는 정보/)
  await fillValid()
  await submit()
  await confirmDialog()
  const phone = screen.getByLabelText('학부모 휴대전화')
  await waitFor(() => expect(phone).toHaveAccessibleDescription('형식이 올바르지 않습니다.'))

  current = { version: '2026-10-16', text: '수집하는 정보: 바뀐 문구' }
  await queryClient.refetchQueries({ queryKey: consentNoticeQueryKey })

  expect(await screen.findByText(/안내 문구가 바뀌었어요/)).toBeInTheDocument()
  // 문구가 바뀐 것과 칸 오류는 따로다. 고칠 칸을 계속 알려 준다.
  expect(phone).toHaveAccessibleDescription('형식이 올바르지 않습니다.')
})

test('확인 창이 열린 채로 뒤에서 문구가 바뀌면, 학부모가 동의한 옛 버전을 그대로 보내고 서버의 거부로 다시 확인하게 한다', async () => {
  let current = notice
  mockApi({
    [NOTICE]: () => jsonResponse(current),
    [ISSUE]: () =>
      problemResponse(400, {
        detail: '고지 문구가 바뀌었습니다.',
        code: 'DONGTANPASS_NOTICE_VERSION_MISMATCH',
      }),
  })
  const { queryClient } = renderApp(PATH, { me: partner })
  await screen.findByText(/수집하는 정보/)
  await fillValid()
  await submit()
  const dialog = await screen.findByRole('dialog', { name: '이대로 발급할까요?' })

  current = { version: '2026-10-16', text: '수집하는 정보: 바뀐 문구' }
  await queryClient.refetchQueries({ queryKey: consentNoticeQueryKey })
  await userEvent.click(within(dialog).getByRole('button', { name: '발급하기' }))

  // 보낼 때 버전을 다시 읽지 않는다. 학부모가 확인하지 않은 새 버전을 보내면 서버가 그대로 받아 버린다.
  await waitFor(() => expect(count(ISSUE)).toBe(1))
  expect(requestOf(ISSUE).body).toMatchObject({ noticeVersion: '2026-10-01' })
  // 서버가 거부하면 창을 닫고 바뀐 문구로 다시 확인하게 한다.
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(await screen.findByText('수집하는 정보: 바뀐 문구')).toBeInTheDocument()
  expect(screen.getByText(/안내 문구가 바뀌었어요/)).toBeInTheDocument()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
})

// ── 답을 받지 못한 발급 뒤에 내용이 바뀔 때(#160) ──────────────────────────

test('답을 받지 못한 뒤 고지 문구가 바뀌어 다시 동의하면, 보내기 전에 목록부터 확인하라고 경고한다', async () => {
  let current = notice
  mockApi({
    [NOTICE]: () => jsonResponse(current),
    [ISSUE]: () => unreadableResponse(),
  })
  const { queryClient } = renderApp(PATH, { me: partner })
  await screen.findByText(/수집하는 정보/)
  await fillValid()
  await submit()
  await confirmDialog()
  await screen.findByText(new RegExp(UNSURE_RESEND_AS_IS))
  const firstKey = requestOf(ISSUE).headers.get('Idempotency-Key')

  current = { version: '2026-10-16', text: '수집하는 정보: 바뀐 문구' }
  await queryClient.refetchQueries({ queryKey: consentNoticeQueryKey })
  await screen.findByText('수집하는 정보: 바뀐 문구')
  await userEvent.click(screen.getByRole('checkbox', { name: '학부모에게 알리고 동의를 받았어요' }))
  await submit()

  const dialog = await screen.findByRole('dialog', { name: '이대로 발급할까요?' })
  expect(dialog).toHaveTextContent('이미 발급됐을 수 있어요')
  expect(within(dialog).getByRole('link', { name: '패스 목록(새 탭)' })).toHaveAttribute(
    'href',
    '/partner/passes',
  )
  expect(within(dialog).getByRole('link', { name: '패스 목록(새 탭)' })).toHaveAttribute(
    'target',
    '_blank',
  )

  // 확인하고도 보내기로 했다. 새 내용이라 새 키로 나간다.
  mockApi({ [ISSUE]: () => unreadableResponse() })
  await userEvent.click(within(dialog).getByRole('button', { name: '그래도 발급하기' }))
  await waitFor(() => expect(count(ISSUE)).toBe(2))
  expect(requestOf(ISSUE).headers.get('Idempotency-Key')).not.toBe(firstKey)
  expect(requestOf(ISSUE).body).toMatchObject({ noticeVersion: '2026-10-16' })
})

test('답을 받지 못한 뒤 같은 내용으로 다시 보내면 경고 없이 같은 키로 보낸다', async () => {
  mockNotice()
  mockApi({ [ISSUE]: () => unreadableResponse() })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()
  await screen.findByText(new RegExp(UNSURE_RESEND_AS_IS))
  const firstKey = requestOf(ISSUE).headers.get('Idempotency-Key')

  await submit()

  const dialog = await screen.findByRole('dialog', { name: '이대로 발급할까요?' })
  expect(dialog).not.toHaveTextContent('이미 발급됐을 수 있어요')
  mockApi({ [ISSUE]: () => jsonResponse(issued, 201) })
  await userEvent.click(within(dialog).getByRole('button', { name: '발급하기' }))
  await screen.findByRole('heading', { name: '발급 결과' })
  expect(count(ISSUE)).toBe(2)
  expect(requestOf(ISSUE).headers.get('Idempotency-Key')).toBe(firstKey)
})

test('답을 받지 못한 뒤 금액을 고쳐 보내려 해도 경고한다', async () => {
  mockNotice()
  mockApi({ [ISSUE]: () => unreadableResponse() })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()
  await screen.findByText(new RegExp(UNSURE_RESEND_AS_IS))

  await type('결제 금액(원)', '290,000')
  await submit()

  expect(await screen.findByRole('dialog', { name: '이대로 발급할까요?' })).toHaveTextContent(
    '이미 발급됐을 수 있어요',
  )
})

test('같은 내용으로 다시 보내 답을 받으면 결과를 안 것이라 그 뒤 다른 내용에는 경고하지 않는다', async () => {
  mockNotice()
  mockApi({ [ISSUE]: () => unreadableResponse() })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()
  await screen.findByText(new RegExp(UNSURE_RESEND_AS_IS))
  // 같은 내용(같은 키)으로 다시 보냈더니 서버가 거부했다. 앞의 요청은 발급되지 않은 것이다.
  mockApi({
    [ISSUE]: () =>
      problemResponse(400, { code: 'DONGTANPASS_INVALID_PAID_AMOUNT', detail: '금액 오류' }),
  })
  await submit()
  await confirmDialog()
  await screen.findByText('금액 오류')

  await type('결제 금액(원)', '290,000')
  await submit()

  const dialog = await screen.findByRole('dialog', { name: '이대로 발급할까요?' })
  expect(dialog).not.toHaveTextContent('이미 발급됐을 수 있어요')
})

test('경고를 보고도 바뀐 내용으로 보냈으면, 그 뒤에 또 내용을 바꿔도 다시 경고하지 않는다', async () => {
  mockNotice()
  mockApi({ [ISSUE]: () => unreadableResponse() })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()
  await screen.findByText(new RegExp(UNSURE_RESEND_AS_IS))
  await type('결제 금액(원)', '290,000')
  await submit()
  const warned = await screen.findByRole('dialog', { name: '이대로 발급할까요?' })
  mockApi({
    [ISSUE]: () =>
      problemResponse(400, { code: 'DONGTANPASS_INVALID_PAID_AMOUNT', detail: '금액 오류' }),
  })
  await userEvent.click(within(warned).getByRole('button', { name: '그래도 발급하기' }))
  await screen.findByText('금액 오류')

  await type('결제 금액(원)', '300,000')
  await submit()

  const dialog = await screen.findByRole('dialog', { name: '이대로 발급할까요?' })
  expect(dialog).not.toHaveTextContent('이미 발급됐을 수 있어요')
})

/** 응답을 놓친 발급을 하나 만든다(확인 창은 닫힌다). */
async function loseFirstAnswer() {
  mockNotice()
  mockApi({ [ISSUE]: () => unreadableResponse() })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()
  await screen.findByText(new RegExp(UNSURE_RESEND_AS_IS))
}

test.each([
  [
    '아직 처리 중이라는 답(409)',
    () => problemResponse(409, { code: 'COMMON_IDEMPOTENCY_IN_PROGRESS', detail: '처리 중' }),
  ],
  [
    '횟수 한도(429)',
    () => problemResponse(429, { code: 'COMMON_TOO_MANY_REQUESTS', detail: '잠시 뒤' }),
  ],
])(
  '같은 내용으로 다시 보냈는데 %s이면 앞의 결과를 아직 모르므로, 그 뒤 내용을 바꿀 때 여전히 경고한다',
  async (_case, answer) => {
    await loseFirstAnswer()
    mockApi({ [ISSUE]: answer })
    await submit()
    await confirmDialog()
    await waitFor(() => expect(count(ISSUE)).toBe(2))
    await screen.findByRole('button', { name: '패스 발급하기' })

    await type('결제 금액(원)', '290,000')
    await submit()

    expect(await screen.findByRole('dialog', { name: '이대로 발급할까요?' })).toHaveTextContent(
      '이미 발급됐을 수 있어요',
    )
  },
)

test('같은 내용으로 다시 보내려다 토큰을 받지 못해 보내지 못했으면, 그 뒤 내용을 바꿀 때 여전히 경고한다', async () => {
  await loseFirstAnswer()
  // 토큰 쿠키가 없어 받으러 갔다가 실패한다. 본 요청은 나가지 않는다.
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  mockApi({ 'GET /api/v1/auth/csrf': () => problemResponse(500, { detail: '오류' }) })
  await submit()
  await confirmDialog()
  await waitFor(() => expect(requests()).toContain('GET /api/v1/auth/csrf'))
  await screen.findByRole('button', { name: '패스 발급하기' })
  expect(count(ISSUE)).toBe(1)
  document.cookie = 'XSRF-TOKEN=test-csrf-token'

  await type('결제 금액(원)', '290,000')
  await submit()

  expect(await screen.findByRole('dialog', { name: '이대로 발급할까요?' })).toHaveTextContent(
    '이미 발급됐을 수 있어요',
  )
})

test('처음부터 거부된 발급 뒤에는 내용을 바꿔도 경고하지 않는다', async () => {
  mockNotice()
  mockApi({
    [ISSUE]: () =>
      problemResponse(400, { code: 'DONGTANPASS_INVALID_PAID_AMOUNT', detail: '금액 오류' }),
  })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()
  await screen.findByText('금액 오류')

  await type('결제 금액(원)', '290,000')
  await submit()

  expect(await screen.findByRole('dialog', { name: '이대로 발급할까요?' })).not.toHaveTextContent(
    '이미 발급됐을 수 있어요',
  )
})

test('경고를 보고 다시 확인으로 닫았다가 다시 열어도 경고한다', async () => {
  await loseFirstAnswer()
  await type('결제 금액(원)', '290,000')
  await submit()
  const first = await screen.findByRole('dialog', { name: '이대로 발급할까요?' })
  await userEvent.click(within(first).getByRole('button', { name: '다시 확인' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

  await submit()

  expect(await screen.findByRole('dialog', { name: '이대로 발급할까요?' })).toHaveTextContent(
    '이미 발급됐을 수 있어요',
  )
})

test('경고를 보고 보낸 발급의 답도 놓치면, 이번 내용을 기억해 그 뒤 내용을 또 바꿀 때 경고한다', async () => {
  await loseFirstAnswer()
  await type('결제 금액(원)', '290,000')
  await submit()
  const warned = await screen.findByRole('dialog', { name: '이대로 발급할까요?' })
  await userEvent.click(within(warned).getByRole('button', { name: '그래도 발급하기' }))
  await waitFor(() => expect(count(ISSUE)).toBe(2))
  await screen.findByRole('button', { name: '패스 발급하기' })

  // 방금 보낸 내용(290,000원)으로 다시 열면 경고하지 않는다(같은 키로 나간다).
  await submit()
  const same = await screen.findByRole('dialog', { name: '이대로 발급할까요?' })
  expect(same).not.toHaveTextContent('이미 발급됐을 수 있어요')
  await userEvent.click(within(same).getByRole('button', { name: '다시 확인' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

  await type('결제 금액(원)', '300,000')
  await submit()
  expect(await screen.findByRole('dialog', { name: '이대로 발급할까요?' })).toHaveTextContent(
    '이미 발급됐을 수 있어요',
  )
})

test('발급에 성공한 뒤 다음 학부모의 발급에는 경고하지 않는다', async () => {
  mockNotice()
  mockApi({ [ISSUE]: () => jsonResponse(issued, 201) })
  await openPage()
  await fillValid()
  await submit()
  await confirmDialog()
  await screen.findByRole('heading', { name: '발급 결과' })

  // 다음 학부모. 내용이 앞의 발급과 다르다.
  await fillValid()
  await type('학생 이름', '이서준')
  await submit()

  expect(await screen.findByRole('dialog', { name: '이대로 발급할까요?' })).not.toHaveTextContent(
    '이미 발급됐을 수 있어요',
  )
})
