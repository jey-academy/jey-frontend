import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { setupDialog } from '@/test/dialog'
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
import { admin, partner, renderApp, staff } from '@/test/renderApp'
import type { PartnerQuote, PartnerRedeemResult, PartnerVerifiedPass } from '../api'

setupMockApi()
setupDialog()

const PATH = '/partner/redeem'
const VERIFY = 'POST /api/v1/dongtanpass/partner-redemptions/verify'
const CHECK = 'POST /api/v1/dongtanpass/partner-redemptions/41/holder-check'
const QUOTE = 'POST /api/v1/dongtanpass/partner-redemptions/41/quote'
const REDEEM = 'POST /api/v1/dongtanpass/partner-redemptions/41/redeem'

const pass: PartnerVerifiedPass = {
  passId: 41,
  passNo: 'DT-J4K8QZ',
  studentName: '김*윤',
  campusName: '동탄관',
  discountRate: 0.05,
  issuedOn: '2026-10-20',
  expiresOn: '2026-11-20',
}
const quote: PartnerQuote = {
  originalFee: 280000,
  discountRate: 0.05,
  discountAmount: 14000,
  payableAmount: 266000,
}
const redeemed: PartnerRedeemResult = {
  redemptionId: 9,
  passId: 41,
  originalFee: 280000,
  discountRate: 0.05,
  discountAmount: 14000,
  payableAmount: 266000,
  redeemedAt: '2026-10-21T02:30:00Z',
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

/** 패스 번호로 확인한다. 확인 결과(학생 줄)가 나올 때까지 기다린다. */
async function verifyByNumber() {
  const field = await screen.findByRole('textbox', { name: '패스 번호' })
  await userEvent.clear(field)
  await userEvent.type(field, 'DT-J4K8QZ')
  await userEvent.click(screen.getByRole('button', { name: '확인하기' }))
}

async function openAndVerify() {
  mockApi({ [VERIFY]: () => jsonResponse(pass) })
  const app = renderApp(PATH, { me: partner })
  await verifyByNumber()
  await screen.findByRole('region', { name: '패스 확인 결과' })
  return app
}

async function fillHolder(name = '김도윤', phone = '010-1234-5678') {
  await userEvent.type(screen.getByLabelText('학생 이름'), name)
  await userEvent.type(screen.getByLabelText('학부모 휴대전화'), phone)
}

function mainButton(name: string | RegExp) {
  return screen.getByRole('button', { name })
}

/** 본인 확인을 통과하고 받을 금액까지 본다. */
async function checkAndQuote() {
  mockApi({
    [CHECK]: () => jsonResponse({ nameMatches: true, phoneMatches: true }),
    [QUOTE]: () => jsonResponse(quote),
  })
  await fillHolder()
  await userEvent.click(mainButton('본인 확인하기'))
  await screen.findByText('학생 이름 맞음')
  await userEvent.type(screen.getByLabelText('원래 수강료(원)'), '280,000')
  await userEvent.click(mainButton('받을 금액 보기'))
  await screen.findByRole('button', { name: '사용 처리하기' })
}

async function confirmRedeem() {
  await userEvent.click(mainButton('사용 처리하기'))
  const dialog = await screen.findByRole('dialog', { name: '이대로 사용 처리할까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '사용 처리하기' }))
}

test.each([
  ['직원', staff],
  ['관리자', admin],
])('%s은 이 화면을 볼 수 없고 아무것도 요청하지 않는다', async (_name, me) => {
  renderApp(PATH, { me })

  expect(
    await screen.findByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expectNoRequests()
})

test('패스 번호로 확인하면 가린 학생 이름, 발급 지점, 할인율, 기한을 보여 주고 처음 오는 학생인지 확인하라고 알린다', async () => {
  await openAndVerify()

  expect(requestOf(VERIFY).body).toEqual({ passNo: 'DT-J4K8QZ' })
  const panel = screen.getByRole('region', { name: '패스 확인 결과' })
  expect(panel).toHaveTextContent('2026.11.20까지 쓸 수 있어요.')
  expect(panel).toHaveTextContent('김*윤')
  expect(panel).toHaveTextContent('JEY 어학원 동탄관')
  expect(panel).toHaveTextContent('첫 달 수강료 5%')
  expect(screen.getByText(/원래 다니던 학생인지는 앱이 알 수 없어요/)).toBeInTheDocument()
  expect(
    within(screen.getByRole('navigation', { name: '직원 메뉴' })).getByRole('link', {
      name: '패스 사용',
    }),
  ).toHaveAttribute('aria-current', 'page')
})

test.each([
  [
    'DONGTANPASS_PASS_FOR_CAMPUS_USE',
    '연계 학원이 발급한 패스라 여기서는 쓸 수 없어요. JEY 어학원 지점에서 쓰는 패스예요.',
  ],
  [
    'DONGTANPASS_STUDENT_ALREADY_USED_AT_PARTNER',
    '이 학생은 이 학원에서 이미 JEY 패스 할인을 받았어요. 할인은 학원마다 한 학생에 한 번이에요.',
  ],
])('확인에서 %s이면 그 사정을 알린다', async (code, message) => {
  mockApi({ [VERIFY]: () => problemResponse(409, { code, detail: '서버 문구' }) })
  renderApp(PATH, { me: partner })

  await verifyByNumber()

  expect(await screen.findByText(message)).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '패스 확인 결과' })).not.toBeInTheDocument()
})

test('쓸 수 없는 패스면 상태 띠로 알린다', async () => {
  mockApi({
    [VERIFY]: () =>
      problemResponse(409, { code: 'DONGTANPASS_PASS_EXPIRED', detail: '기간이 지난 패스입니다.' }),
  })
  renderApp(PATH, { me: partner })

  await verifyByNumber()

  expect(await screen.findByRole('region', { name: '패스 확인 결과' })).toHaveTextContent(
    '기간이 지난 패스입니다.',
  )
})

test('꺼진 학원이면 화면 대신 서버의 안내만 보여 준다', async () => {
  mockApi({
    [VERIFY]: () =>
      problemResponse(403, {
        code: 'DONGTANPASS_PARTNER_INACTIVE',
        detail: '이용이 중지된 학원입니다.',
      }),
  })
  renderApp(PATH, { me: partner })

  await verifyByNumber()

  expect(await screen.findByText('이용이 중지된 학원입니다.')).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: '패스 번호' })).not.toBeInTheDocument()
})

test('이름과 번호를 적어야 본인 확인을 할 수 있고, 번호는 숫자만 남겨 보낸다', async () => {
  mockApi({ [CHECK]: () => jsonResponse({ nameMatches: true, phoneMatches: true }) })
  await openAndVerify()

  expect(mainButton('본인 확인하기')).toBeDisabled()
  expect(screen.getByText('학생 이름을 적어 주세요.')).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('학생 이름'), ' 김도윤 ')
  expect(screen.getByText('학부모 휴대전화 번호를 적어 주세요.')).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('학부모 휴대전화'), '010-1234-567')
  expect(screen.getByText('학부모 휴대전화 번호를 모두 맞게 적어 주세요.')).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('학부모 휴대전화'), '8')
  await userEvent.click(screen.getByRole('button', { name: '번호 더하기' }))
  await userEvent.type(screen.getByLabelText('학부모 휴대전화 2'), '010 9876 5432')

  await userEvent.click(mainButton('본인 확인하기'))

  expect(await screen.findByText('학생 이름 맞음')).toBeInTheDocument()
  expect(requestOf(CHECK).body).toEqual({
    studentName: '김도윤',
    guardianPhones: ['01012345678', '01098765432'],
  })
})

test('본인 확인이 맞지 않으면 무엇을 고칠지 알리고, 고치면 다시 확인하게 한다', async () => {
  mockApi({ [CHECK]: () => jsonResponse({ nameMatches: true, phoneMatches: false }) })
  await openAndVerify()
  await fillHolder()

  await userEvent.click(mainButton('본인 확인하기'))

  expect(await screen.findByText('학부모 번호 맞지 않음')).toBeInTheDocument()
  expect(screen.getByText(/JEY 어학원에 등록된 학부모 번호를 더해 주세요/)).toBeInTheDocument()
  // 형식이 맞는 다른 번호로 고친다. 앞의 결과는 지금 입력에 대한 것이 아니다.
  await userEvent.clear(screen.getByLabelText('학부모 휴대전화'))
  await userEvent.type(screen.getByLabelText('학부모 휴대전화'), '010-1234-5679')
  expect(screen.queryByText('학부모 번호 맞지 않음')).not.toBeInTheDocument()
  expect(mainButton('본인 확인하기')).toBeEnabled()
})

test('본인 확인을 통과한 뒤 형식이 맞는 다른 이름으로 고치면 결과를 버리고 다시 확인하게 한다', async () => {
  mockApi({ [CHECK]: () => jsonResponse({ nameMatches: true, phoneMatches: true }) })
  await openAndVerify()
  await fillHolder()
  await userEvent.click(mainButton('본인 확인하기'))
  await screen.findByText('학생 이름 맞음')

  await userEvent.type(screen.getByLabelText('학생 이름'), '연')

  expect(screen.queryByText('학생 이름 맞음')).not.toBeInTheDocument()
  expect(mainButton('본인 확인하기')).toBeEnabled()
  expect(screen.queryByRole('button', { name: '받을 금액 보기' })).not.toBeInTheDocument()
})

test('본인 확인을 통과하면 원래 수강료로 서버가 계산한 받을 금액을 보여 준다. 수강료를 고치면 다시 계산하게 한다', async () => {
  await openAndVerify()
  await checkAndQuote()

  expect(requestOf(QUOTE).body).toEqual({ originalFee: 280000 })
  const steps = screen.getByRole('complementary')
  expect(steps).toHaveTextContent('원래 수강료280,000원')
  expect(steps).toHaveTextContent('할인 5%- 14,000원')
  expect(steps).toHaveTextContent('받을 금액266,000원')

  await userEvent.type(screen.getByLabelText('원래 수강료(원)'), '0')
  expect(screen.queryByText('266,000원')).not.toBeInTheDocument()
  expect(mainButton('받을 금액 보기')).toBeInTheDocument()
})

test('원래 수강료가 범위 밖이라는 답이면 그 칸에 알린다', async () => {
  mockApi({
    [CHECK]: () => jsonResponse({ nameMatches: true, phoneMatches: true }),
    [QUOTE]: () =>
      problemResponse(400, { code: 'DONGTANPASS_INVALID_ORIGINAL_FEE', detail: '금액 오류' }),
  })
  await openAndVerify()
  await fillHolder()
  await userEvent.click(mainButton('본인 확인하기'))
  await screen.findByText('학생 이름 맞음')
  await userEvent.type(screen.getByLabelText('원래 수강료(원)'), '20,000,000')

  await userEvent.click(mainButton('받을 금액 보기'))

  expect(await screen.findByLabelText('원래 수강료(원)')).toHaveAccessibleDescription(
    /1,000만 원 이하로/,
  )
})

test('확인 창을 거쳐 이름·번호·수강료를 멱등 키와 함께 보내고, 받을 금액을 크게 보여 준다', async () => {
  await openAndVerify()
  await checkAndQuote()
  mockApi({ [REDEEM]: () => jsonResponse(redeemed, 201) })

  await userEvent.click(mainButton('사용 처리하기'))
  const dialog = await screen.findByRole('dialog', { name: '이대로 사용 처리할까요?' })
  expect(dialog).toHaveTextContent('받을 금액266,000원')
  await userEvent.click(within(dialog).getByRole('button', { name: '사용 처리하기' }))

  const title = await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })
  await waitFor(() => expect(title).toHaveFocus())
  const { body, headers } = requestOf(REDEEM)
  expect(body).toEqual({
    studentName: '김도윤',
    guardianPhones: ['01012345678'],
    originalFee: 280000,
  })
  expect(headers.get('Idempotency-Key')).toBeTruthy()
  const done = title.closest('section') as HTMLElement
  expect(done).toHaveTextContent('받을 금액266,000원')
  expect(done).toHaveTextContent('DT-J4K8QZ 사용 완료')

  await userEvent.click(screen.getByRole('button', { name: '다음 패스 확인하기' }))
  expect(screen.queryByRole('heading', { name: '패스를 사용 처리했어요' })).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '패스 번호' })).toHaveFocus()
})

test('사용 처리 응답을 받지 못하면 그대로 다시 하게 하고, 같은 키로 보낸다', async () => {
  await openAndVerify()
  await checkAndQuote()
  mockApi({ [REDEEM]: () => unreadableResponse() })
  await confirmRedeem()

  expect(
    await screen.findByText(/그대로 다시 해 주세요. 두 번 처리되지 않아요/),
  ).toBeInTheDocument()
  const firstKey = requestOf(REDEEM).headers.get('Idempotency-Key')

  mockApi({ [REDEEM]: () => jsonResponse(redeemed, 201) })
  await confirmRedeem()

  await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })
  expect(requestOf(REDEEM).headers.get('Idempotency-Key')).toBe(firstKey)
  expect(count(REDEEM)).toBe(2)
})

test('확인한 지 30분이 지났다는 답이면 다시 확인하게 하고, 같은 패스면 적은 것을 남긴 채 처리한다', async () => {
  await openAndVerify()
  await checkAndQuote()
  mockApi({
    [REDEEM]: () =>
      problemResponse(404, { code: 'DONGTANPASS_PASS_NOT_VERIFIED', detail: '다시 확인' }),
  })
  await confirmRedeem()

  expect(await screen.findByText(/확인한 지 30분이 지났어요/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '패스 다시 확인하기' }))
  expect(screen.getByRole('textbox', { name: '패스 번호' })).toHaveFocus()

  // 다시 확인할 때는 지울지 묻지 않는다.
  await verifyByNumber()
  await waitFor(() =>
    expect(screen.queryByText(/확인한 지 30분이 지났어요/)).not.toBeInTheDocument(),
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByLabelText('학생 이름')).toHaveValue('김도윤')
  expect(screen.getByLabelText('원래 수강료(원)')).toHaveValue('280,000')

  mockApi({ [REDEEM]: () => jsonResponse(redeemed, 201) })
  await confirmRedeem()
  await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })
  // 이 404는 처리되지 않았다는 답이라 다음 시도는 새 키로 나가도 두 번 처리되지 않는다.
  expect(count(REDEEM)).toBe(2)
})

test('사용 처리에서 이미 할인받은 학생이라는 답이면 알리고 다음 패스로 넘어가게 한다', async () => {
  await openAndVerify()
  await checkAndQuote()
  mockApi({
    [REDEEM]: () =>
      problemResponse(409, {
        code: 'DONGTANPASS_STUDENT_ALREADY_USED_AT_PARTNER',
        detail: '서버 문구',
      }),
  })
  await confirmRedeem()

  const result = await screen.findByRole('region', { name: '패스 확인 결과' })
  expect(result).toHaveTextContent('이미 JEY 패스 할인을 받았어요')
  await waitFor(() => expect(result).toHaveFocus())
  expect(screen.queryByRole('button', { name: '사용 처리하기' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '다음 패스 확인하기' })).toBeInTheDocument()
})

test('사용 처리에서 이름이 다르다는 답이면 등록 서류를 확인하라고 알린다', async () => {
  await openAndVerify()
  await checkAndQuote()
  mockApi({
    [REDEEM]: () =>
      problemResponse(409, { code: 'DONGTANPASS_HOLDER_NAME_MISMATCH', detail: '서버 문구' }),
  })
  await confirmRedeem()

  expect(
    await screen.findByText(/학생 이름이 패스와 달라요. 등록 서류의 이름을/),
  ).toBeInTheDocument()
})

test('적은 것이 있을 때 다른 패스를 확인하면 지울지 먼저 묻고, 지우면 적은 것과 본인 확인 결과를 비운다', async () => {
  mockApi({ [CHECK]: () => jsonResponse({ nameMatches: true, phoneMatches: true }) })
  await openAndVerify()
  await fillHolder()
  await userEvent.click(mainButton('본인 확인하기'))
  await screen.findByText('학생 이름 맞음')
  mockApi({ [VERIFY]: () => jsonResponse({ ...pass, passId: 42, passNo: 'DT-OTHER2' }) })

  await verifyByNumber()

  const dialog = await screen.findByRole('dialog', { name: '입력한 내용을 지울까요?' })
  expect(count(VERIFY)).toBe(1)
  await userEvent.click(within(dialog).getByRole('button', { name: '지우고 확인' }))
  await waitFor(() => expect(count(VERIFY)).toBe(2))
  expect(await screen.findByText('DT-OTHER2')).toBeInTheDocument()
  expect(screen.getByLabelText('학생 이름')).toHaveValue('')
  expect(screen.queryByText('학생 이름 맞음')).not.toBeInTheDocument()
  expect(mainButton('본인 확인하기')).toBeDisabled()
})

test('같은 패스를 다시 찍어도 지우고 확인을 누르면 적은 것을 실제로 지운다', async () => {
  await openAndVerify()
  await fillHolder()

  await verifyByNumber()
  const dialog = await screen.findByRole('dialog', { name: '입력한 내용을 지울까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '지우고 확인' }))

  await waitFor(() => expect(count(VERIFY)).toBe(2))
  expect(await screen.findByLabelText('학생 이름')).toHaveValue('')
})

test('같은 패스를 다시 찍고 계속 입력을 누르면 확인하지 않고 적은 것을 남긴다', async () => {
  await openAndVerify()
  await fillHolder()

  await verifyByNumber()
  const dialog = await screen.findByRole('dialog', { name: '입력한 내용을 지울까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '계속 입력' }))

  expect(count(VERIFY)).toBe(1)
  expect(screen.getByLabelText('학생 이름')).toHaveValue('김도윤')
})

/** 직접 풀 수 있는 응답. 보내는 중인 상태를 보려고 쓴다. */
function hold() {
  let respond!: (response: Response) => void
  const response = new Promise<Response>((resolve) => (respond = resolve))
  return { response, respond }
}

test('사용 처리를 보내는 동안에는 다음 패스로 넘어가지 못하고, 페이지를 닫기 전에 묻는다. 끝나면 묻지 않는다', async () => {
  await openAndVerify()
  await checkAndQuote()
  const redeemCall = hold()
  mockApi({ [REDEEM]: () => redeemCall.response })
  await userEvent.click(mainButton('사용 처리하기'))
  const confirm = await screen.findByRole('dialog', { name: '이대로 사용 처리할까요?' })
  await userEvent.click(within(confirm).getByRole('button', { name: '사용 처리하기' }))
  await within(confirm).findByRole('button', { name: '처리하는 중' })

  // 보내는 동안에는 확인 창이 닫히지 않아 바깥을 누를 수 없다. 다른 패스·화면 막기는 답을 받지 못한 경우의 테스트에서 본다.
  expect(screen.getByRole('button', { name: '다음 패스 확인하기', hidden: true })).toBeDisabled()
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)

  redeemCall.respond(jsonResponse(redeemed, 201))
  expect(await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })).toBeInTheDocument()
  // 끝나면 막지 않는다. 막기를 푸는 것은 화면을 그린 뒤의 효과라 기다린다.
  await waitFor(() => {
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })
})

test.each([
  ['본인 확인', CHECK],
  ['사용 처리', REDEEM],
])('%s에서 꺼진 학원이라는 답이면 화면 대신 서버의 안내만 보여 준다', async (_step, key) => {
  await openAndVerify()
  const inactive = () =>
    problemResponse(403, {
      code: 'DONGTANPASS_PARTNER_INACTIVE',
      detail: '이용이 중지된 학원입니다.',
    })
  if (key === CHECK) {
    mockApi({ [CHECK]: inactive })
    await fillHolder()
    await userEvent.click(mainButton('본인 확인하기'))
  } else {
    await checkAndQuote()
    mockApi({ [REDEEM]: inactive })
    await confirmRedeem()
  }

  expect(await screen.findByText('이용이 중지된 학원입니다.')).toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: '패스 번호' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('학생 이름')).not.toBeInTheDocument()
})

test('완료 화면에서 다음 패스를 찍으면 묻지 않고 확인하고, 그 사이 방금 쓴 패스를 쓸 수 있는 패스로 보이지 않는다', async () => {
  await openAndVerify()
  await checkAndQuote()
  mockApi({ [REDEEM]: () => jsonResponse(redeemed, 201) })
  await confirmRedeem()
  await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })
  const next = hold()
  mockApi({ [VERIFY]: () => next.response })

  await verifyByNumber()

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(count(VERIFY)).toBe(2))
  expect(screen.queryByText('사용할 수 있는 패스예요')).not.toBeInTheDocument()
  next.respond(jsonResponse({ ...pass, passId: 43, passNo: 'DT-NEXT03' }))
  expect(await screen.findByText('DT-NEXT03')).toBeInTheDocument()
})

test('사용 처리 사이 패스를 쓸 수 없게 됐다는 답이면 상태 띠로 알리고 그리로 포커스를 옮긴다', async () => {
  await openAndVerify()
  await checkAndQuote()
  mockApi({
    [REDEEM]: () =>
      problemResponse(409, {
        code: 'DONGTANPASS_PASS_ALREADY_REDEEMED',
        detail: '이미 사용된 패스입니다.',
      }),
  })
  await confirmRedeem()

  const result = await screen.findByRole('region', { name: '패스 확인 결과' })
  expect(result).toHaveTextContent('이미 사용된 패스입니다.')
  await waitFor(() => expect(result).toHaveFocus())
  expect(screen.queryByRole('button', { name: '사용 처리하기' })).not.toBeInTheDocument()
})

test('다시 확인이 잠깐의 오류로 실패하면 적은 것을 남기고, 쓸 수 없는 패스라는 답이면 결과를 내린다', async () => {
  await openAndVerify()
  await fillHolder()
  mockApi({
    [VERIFY]: () =>
      problemResponse(404, {
        code: 'DONGTANPASS_PASS_NOT_FOUND',
        detail: '패스를 찾을 수 없습니다.',
      }),
  })
  await verifyByNumber()
  const dialog = await screen.findByRole('dialog', { name: '입력한 내용을 지울까요?' })
  await userEvent.click(within(dialog).getByRole('button', { name: '계속 입력' }))
  expect(count(VERIFY)).toBe(1)

  // 30분이 지난 뒤처럼, 묻지 않는 상태에서 다시 확인이 실패하는 경우를 본다.
  mockApi({
    [CHECK]: () =>
      problemResponse(404, { code: 'DONGTANPASS_PASS_NOT_VERIFIED', detail: '다시 확인' }),
  })
  await userEvent.click(mainButton('본인 확인하기'))
  await screen.findByText(/확인한 지 30분이 지났어요/)
  await verifyByNumber()

  expect(await screen.findByText(/이 번호의 패스가 없어요/)).toBeInTheDocument()
  expect(screen.getByLabelText('학생 이름')).toHaveValue('김도윤')

  mockApi({
    [VERIFY]: () =>
      problemResponse(409, { code: 'DONGTANPASS_PASS_EXPIRED', detail: '기간이 지난 패스입니다.' }),
  })
  await verifyByNumber()
  expect(await screen.findByText('기간이 지난 패스입니다.')).toBeInTheDocument()
  expect(screen.queryByLabelText('학생 이름')).not.toBeInTheDocument()
})

test('사용 처리에서 이름·번호가 다르다는 답이면 본인 확인 단계로 되돌린다', async () => {
  await openAndVerify()
  await checkAndQuote()
  mockApi({
    [REDEEM]: () =>
      problemResponse(409, { code: 'DONGTANPASS_HOLDER_PHONE_MISMATCH', detail: '서버 문구' }),
  })
  await confirmRedeem()

  expect(await screen.findByText(/학부모 번호가 패스와 달라요/)).toBeInTheDocument()
  expect(mainButton('본인 확인하기')).toBeEnabled()
  expect(screen.queryByText('학생 이름 맞음')).not.toBeInTheDocument()
})

test.each([
  [
    '본인 확인의 응답을 받지 못함',
    CHECK,
    () => unreadableResponse(),
    /본인 확인 결과를 받지 못했어요/,
  ],
  [
    '본인 확인 한도',
    CHECK,
    () => tooManyRequests({ code: 'DONGTANPASS_HOLDER_CHECK_LIMITED', detail: '한도' }, '120'),
    /본인 확인을 여러 번 했어요. 약 2분 뒤에/,
  ],
  [
    '사용 처리 한도',
    REDEEM,
    () => tooManyRequests({ code: 'DONGTANPASS_REDEEM_LIMITED', detail: '한도' }, '60'),
    /사용 처리를 여러 번 했어요. 약 1분 뒤에/,
  ],
])('%s이면 그 단계의 안내를 보여 준다', async (_name, key, response, message) => {
  await openAndVerify()
  if (key === CHECK) {
    mockApi({ [CHECK]: response })
    await fillHolder()
    await userEvent.click(mainButton('본인 확인하기'))
  } else {
    await checkAndQuote()
    mockApi({ [REDEEM]: response })
    await confirmRedeem()
  }

  expect(await screen.findByText(message)).toBeInTheDocument()
})

test('사용 처리의 답을 받지 못하면 칸을 잠그고, 결과를 알 때까지 다른 패스·다음 패스·다른 화면으로 넘어가지 못한다', async () => {
  const app = await openAndVerify()
  await checkAndQuote()
  mockApi({ [REDEEM]: () => unreadableResponse() })
  await confirmRedeem()

  expect(await screen.findByText(/사용 처리가 됐는지 아직 몰라요/)).toBeInTheDocument()
  expect(screen.getByLabelText('학생 이름')).toBeDisabled()
  expect(screen.getByLabelText('원래 수강료(원)')).toBeDisabled()
  expect(screen.getByRole('button', { name: '다음 패스 확인하기' })).toBeDisabled()
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)

  await verifyByNumber()
  expect(
    await screen.findByRole('dialog', { name: '사용 처리 결과를 아직 몰라요' }),
  ).toBeInTheDocument()
  expect(count(VERIFY)).toBe(1)
  await userEvent.click(screen.getByRole('button', { name: '확인' }))

  await userEvent.click(screen.getByRole('link', { name: '패스 목록' }))
  expect(
    await screen.findByRole('dialog', { name: '사용 처리 결과를 아직 몰라요' }),
  ).toBeInTheDocument()
  expect(app.router.state.location.pathname).toBe('/partner/redeem')
})

test('답을 받지 못한 뒤 다시 확인했는데 이미 할인받은 학생이라는 답이면, 방금 처리가 됐을 수 있다며 받을 금액을 알린다', async () => {
  await openAndVerify()
  await checkAndQuote()
  mockApi({ [REDEEM]: () => unreadableResponse() })
  await confirmRedeem()
  await screen.findByText(/사용 처리가 됐는지 아직 몰라요/)
  // 다시 보냈더니 30분이 지났다. 다시 확인하는 것은 막지 않는다.
  mockApi({
    [REDEEM]: () =>
      problemResponse(404, { code: 'DONGTANPASS_PASS_NOT_VERIFIED', detail: '다시 확인' }),
  })
  await confirmRedeem()
  await screen.findByText(/확인한 지 30분이 지났어요/)
  mockApi({
    [VERIFY]: () =>
      problemResponse(409, {
        code: 'DONGTANPASS_STUDENT_ALREADY_USED_AT_PARTNER',
        detail: '서버 문구',
      }),
  })

  await verifyByNumber()

  expect(
    await screen.findByText(/방금 한 사용 처리\(DT-J4K8QZ\)가 완료됐을 수 있어요/),
  ).toHaveTextContent('완료됐다면 받을 금액은 266,000원이에요')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('답을 받지 못한 뒤 다시 보낸 사용 처리가 이미 할인받은 학생이라는 답이면 받을 금액을 함께 알린다', async () => {
  await openAndVerify()
  await checkAndQuote()
  mockApi({ [REDEEM]: () => unreadableResponse() })
  await confirmRedeem()
  await screen.findByText(/사용 처리가 됐는지 아직 몰라요/)
  mockApi({
    [REDEEM]: () =>
      problemResponse(409, {
        code: 'DONGTANPASS_STUDENT_ALREADY_USED_AT_PARTNER',
        detail: '서버 문구',
      }),
  })

  await confirmRedeem()

  expect(await screen.findByText(/완료됐다면 받을 금액은 266,000원이에요/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '다음 패스 확인하기' })).toBeEnabled()
})
