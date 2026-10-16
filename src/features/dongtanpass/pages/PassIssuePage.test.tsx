import { screen, waitFor, within } from '@testing-library/react'
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
import type { ConsentNotice, IssuedPass } from '../api'

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

function resultCard() {
  return screen.getByRole('heading', { name: '발급 결과' }).parentElement as HTMLElement
}

test('관리자에게는 발급 폼 대신 안내만 보여 주고 요청을 보내지 않는다', async () => {
  renderApp(PATH, { me: admin })

  expect(
    await screen.findByText(
      '패스 발급은 연계 학원 계정으로 해요. 관리자 계정으로는 발급할 수 없어요.',
    ),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '패스 발급하기' })).not.toBeInTheDocument()
  expectNoRequests()
})

test('고지 문구를 줄바꿈 그대로 보여 주고, 동의를 확인해야 발급 버튼이 켜진다', async () => {
  mockNotice()
  await openPage()

  expect(screen.getByText(/수집하는 정보/).textContent).toBe(notice.text)
  expect(screen.getByText(/수집하는 정보/)).toHaveClass('whitespace-pre-line')
  expect(screen.getByLabelText('결제일')).toHaveValue(todayInSeoul())
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
  expect(dialog).toHaveTextContent('학생 이름김도윤')
  expect(dialog).toHaveTextContent(`결제일${formatDate(todayInSeoul())}`)
  expect(dialog).toHaveTextContent('결제 금액280,000원')
  expect(dialog).toHaveTextContent('결제 수단카드')
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
  // 좁은 화면에서 폼 아래에 있는 결과 카드가 보이게 한다.
  expect(scrollIntoView).toHaveBeenCalledOnce()
  expect(scrollIntoView.mock.contexts[0]).toHaveAttribute('aria-live', 'polite')

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
  // 입력은 남는다.
  expect(screen.getByLabelText('학생 이름')).toHaveValue(' 김도윤 ')

  mockApi({ [ISSUE]: () => jsonResponse(issued, 201) })
  await userEvent.click(screen.getByRole('checkbox'))
  await submit()
  await confirmDialog()
  await screen.findByText('발급 완료')
  expect(requestOf(ISSUE).body).toMatchObject({ noticeVersion: '2026-10-16' })
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
