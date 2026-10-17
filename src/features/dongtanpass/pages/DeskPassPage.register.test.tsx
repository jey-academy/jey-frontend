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
  tooManyRequests,
  unreadableResponse,
} from '@/test/mockApi'
import { renderApp, staff } from '@/test/renderApp'
import { HOLDER_CHECK, mockLookups, pass, VERIFY } from './deskTestData'

// 데스크 결과의 신규 등록 폼과 본인 미리 확인(진행 카드 ②).
setupMockApi()
setupDialog()

// 화면에 넣는 번호. 가짜 번호다.
const MOTHER_PHONE = '010-1234-5678'
const FATHER_PHONE = '010 9876 5432'

/** 패스 번호로 확인해 신규 등록 폼이 뜬 데까지. */
async function openForm() {
  const user = userEvent.setup()
  mockApi({ [VERIFY]: () => jsonResponse(pass) })
  mockLookups()
  renderApp('/desk/dongtanpass', { me: staff })
  await user.type(await screen.findByRole('textbox', { name: '패스 번호' }), 'DT-ABC234{Enter}')
  await screen.findByRole('form', { name: '신규 등록 정보' })
  // 지점 목록을 받아 직원의 지점이 골라질 때까지
  await waitFor(() => expect(screen.getByRole('combobox', { name: '지점' })).toHaveValue('1'))
  return user
}

function studentName() {
  return within(screen.getByRole('group', { name: '학생' })).getByRole('textbox', { name: '이름' })
}

function guardianPhone(order = 1) {
  return within(screen.getByRole('group', { name: `학부모 ${order}` })).getByRole('textbox', {
    name: '휴대전화',
  })
}

function card() {
  return screen.getByRole('complementary', { name: '처리 순서' })
}

function checkButton() {
  return within(card()).queryByRole('button', { name: /본인 확인하기|확인하는 중/ })
}

/** 지금 단계(aria-current)의 제목 */
function currentStep() {
  return card().querySelector('[aria-current="step"]')
}

function stepTitled(title: string) {
  // 단계의 제목은 굵은 글씨(b)다. 확인 결과 줄(같은 listitem)과 구분한다.
  return within(card())
    .getAllByRole('listitem')
    .find((item) => item.querySelector(':scope > div > b')?.textContent?.startsWith(title))
}

async function fillHolder(user: ReturnType<typeof userEvent.setup>, name = '김하윤') {
  await user.type(studentName(), name)
  await user.type(guardianPhone(), MOTHER_PHONE)
}

test('이름과 학부모 번호를 적기 전에는 본인 확인을 막고 까닭을 알린다', async () => {
  const user = await openForm()

  // 학생 이름은 미리 채우지 않는다(확인 응답의 이름은 가려져 있다).
  expect(studentName()).toHaveValue('')
  expect(checkButton()).toBeDisabled()
  expect(checkButton()).toHaveAccessibleDescription('학생 이름을 적어 주세요.')

  await user.type(studentName(), '김하윤')
  expect(checkButton()).toHaveAccessibleDescription('학부모 휴대전화 번호를 적어 주세요.')

  await user.type(guardianPhone(), '010-12')
  expect(checkButton()).toHaveAccessibleDescription('학부모 휴대전화 번호를 모두 맞게 적어 주세요.')

  await user.clear(guardianPhone())
  await user.type(guardianPhone(), MOTHER_PHONE)
  expect(checkButton()).toBeEnabled()
  expect(requests()).not.toContain(HOLDER_CHECK)
})

test('학부모 줄이 둘인데 한 줄의 번호가 비었으면 막는다(등록할 번호와 확인한 번호가 같아야 한다)', async () => {
  const user = await openForm()
  await fillHolder(user)

  await user.click(screen.getByRole('button', { name: '학부모 추가' }))

  expect(checkButton()).toBeDisabled()
  expect(checkButton()).toHaveAccessibleDescription('학부모 휴대전화 번호를 모두 맞게 적어 주세요.')
})

test('본인 확인: 이름과 모든 학부모 번호를 본문으로 보내고, 둘 다 맞으면 ②를 끝내고 ③으로 넘어간다', async () => {
  mockApi({ [HOLDER_CHECK]: () => jsonResponse({ nameMatches: true, phoneMatches: true }) })
  const user = await openForm()
  await fillHolder(user, '  김하윤 ')
  await user.click(screen.getByRole('button', { name: '학부모 추가' }))
  await user.type(guardianPhone(2), FATHER_PHONE)

  await user.click(checkButton()!)

  const done = await within(card()).findByText(
    '본인 확인을 마쳤어요. 학생 등록과 패스 사용 처리는 준비 중이에요.',
  )
  expect(requestOf(HOLDER_CHECK).body).toEqual({
    studentName: '김하윤',
    guardianPhones: ['01012345678', '01098765432'],
  })
  // 바꾸는 것이 없어 멱등 키를 보내지 않는다. 이름과 번호는 주소에 싣지 않는다.
  expect(requestOf(HOLDER_CHECK).headers.has('Idempotency-Key')).toBe(false)
  expect(requests().filter((key) => key.includes('holder-check'))).toEqual([HOLDER_CHECK])

  expect(within(card()).getByText('학생 이름 맞음')).toBeInTheDocument()
  expect(within(card()).getByText('학부모 번호 맞음')).toBeInTheDocument()
  expect(stepTitled('본인 확인')).toHaveTextContent('본인 확인 (끝남)')
  expect(currentStep()).toHaveTextContent('학생 등록')
  expect(within(card()).getByRole('status')).toHaveTextContent(
    '본인 확인 결과: 학생 이름 맞음, 학부모 번호 맞음',
  )
  // 누른 버튼이 사라지므로 끝났다는 글로 포커스를 옮긴다.
  expect(checkButton()).not.toBeInTheDocument()
  await waitFor(() => expect(done).toHaveFocus())
})

test('맞지 않는 칸은 무엇을 할지와 함께 보여 주고, 고쳐서 다시 확인할 수 있다', async () => {
  let call = 0
  mockApi({
    [HOLDER_CHECK]: () =>
      jsonResponse(
        ++call === 1
          ? { nameMatches: false, phoneMatches: true }
          : { nameMatches: true, phoneMatches: true },
      ),
  })
  const user = await openForm()
  await fillHolder(user, '김하연')

  await user.click(checkButton()!)

  expect(await within(card()).findByText('학생 이름 맞지 않음')).toBeInTheDocument()
  expect(card()).toHaveTextContent(
    '등록 폼의 이름을 확인해 주세요. 패스의 이름이 틀렸다면 발급한 학원에 다시 발급을 요청해 주세요.',
  )
  expect(within(card()).getByText('학부모 번호 맞음')).toBeInTheDocument()
  expect(stepTitled('본인 확인')).toHaveTextContent('본인 확인 (확인 필요)')
  expect(stepTitled('학생 등록')).toHaveTextContent('학생 등록 (남음)')

  // 이름을 고치면 앞의 결과는 지금 입력에 대한 것이 아니다. 지우고 ②로 돌아간다.
  await user.clear(studentName())
  await user.type(studentName(), '김하윤')
  expect(within(card()).queryByText('학생 이름 맞지 않음')).not.toBeInTheDocument()
  expect(currentStep()).toHaveTextContent('본인 확인')

  await user.click(checkButton()!)

  expect(await within(card()).findByText('학생 이름 맞음')).toBeInTheDocument()
  expect(requestOf(HOLDER_CHECK).body).toEqual({
    studentName: '김하윤',
    guardianPhones: ['01012345678'],
  })
})

test('번호가 맞지 않으면 패스를 받을 때 알려 준 번호를 더하라고 안내한다', async () => {
  mockApi({ [HOLDER_CHECK]: () => jsonResponse({ nameMatches: true, phoneMatches: false }) })
  const user = await openForm()
  await fillHolder(user)

  await user.click(checkButton()!)

  expect(await within(card()).findByText('학부모 번호 맞지 않음')).toBeInTheDocument()
  expect(card()).toHaveTextContent('패스를 받을 때 알려 준 학부모 번호를 등록 폼에 더해 주세요.')
  // 번호를 하나 더하면(아직 비어 있어) 다시 막히고, 앞의 결과는 지운다.
  await user.click(screen.getByRole('button', { name: '학부모 추가' }))
  expect(within(card()).queryByText('학부모 번호 맞지 않음')).not.toBeInTheDocument()
})

// 실제 브라우저는 폼 안에서 Enter를 누르면 form 속성으로 이어 둔 진행 카드의 버튼을 누른 것으로 친다(Chrome에서 확인).
// user-event는 폼 안의 제출 버튼만 찾아서, 여기서는 폼 제출로 대신한다.
test('폼을 제출하면(칸에서 Enter) 본인 확인을 한다', async () => {
  mockApi({ [HOLDER_CHECK]: () => jsonResponse({ nameMatches: true, phoneMatches: true }) })
  const user = await openForm()
  await fillHolder(user)

  fireEvent.submit(screen.getByRole('form', { name: '신규 등록 정보' }))

  expect(await within(card()).findByText('학생 이름 맞음')).toBeInTheDocument()
})

test('확인하는 동안 폼을 잠그고, 다시 눌러도 한 번만 보낸다', async () => {
  let answer: (response: Response) => void = () => {}
  mockApi({ [HOLDER_CHECK]: () => new Promise<Response>((resolve) => (answer = resolve)) })
  const user = await openForm()
  await fillHolder(user)

  await user.click(checkButton()!)

  expect(checkButton()).toHaveTextContent('확인하는 중')
  expect(studentName()).toBeDisabled()
  await user.click(checkButton()!)
  expect(requests().filter((key) => key === HOLDER_CHECK)).toHaveLength(1)

  answer(jsonResponse({ nameMatches: false, phoneMatches: false }))
  expect(await within(card()).findByText('학생 이름 맞지 않음')).toBeInTheDocument()
  expect(studentName()).toBeEnabled()
})

test('확인하는 사이 패스를 쓸 수 없게 됐으면(409) 그 상태를 보여 주고 폼을 거둔다', async () => {
  mockApi({
    [HOLDER_CHECK]: () =>
      problemResponse(409, {
        code: 'DONGTANPASS_PASS_ALREADY_REDEEMED',
        detail: '이미 사용한 패스입니다.',
      }),
  })
  const user = await openForm()
  await fillHolder(user)

  await user.click(checkButton()!)

  expect(await screen.findByText('이미 사용한 패스예요')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: '패스 확인 결과' })).toHaveTextContent(
    '이미 사용한 패스입니다.',
  )
  expect(screen.queryByRole('form', { name: '신규 등록 정보' })).not.toBeInTheDocument()
  expect(screen.queryByRole('complementary', { name: '처리 순서' })).not.toBeInTheDocument()

  // 폼이 없으니 지울지 묻지 않고 바로 처음으로 돌아간다.
  await user.click(screen.getByRole('button', { name: '다음 패스 확인하기' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '패스 번호' })).toHaveFocus()
})

test.each([
  [
    '횟수 초과(429)',
    () => tooManyRequests({ code: 'DONGTANPASS_HOLDER_CHECK_LIMITED' }, '600'),
    '본인 확인을 여러 번 했어요. 약 10분 뒤에 다시 해 주세요.',
  ],
  [
    '없는 패스(404)',
    () => problemResponse(404, { code: 'DONGTANPASS_PASS_NOT_FOUND' }),
    '패스를 찾지 못했어요. 다음 패스 확인하기를 눌러 처음부터 다시 확인해 주세요.',
  ],
  [
    '패스를 받지 않는 지점(403)',
    () => problemResponse(403, { code: 'DONGTANPASS_CAMPUS_NOT_PROVIDING' }),
    '이 지점은 동탄고 패스를 받지 않아요. 패스를 받는 지점에서 확인해 주세요.',
  ],
  [
    '응답을 놓침',
    () => unreadableResponse('req-holder-1'),
    '본인 확인 결과를 받지 못했어요. 다시 해 주세요.',
  ],
])(
  '본인 확인 실패: %s는 진행 카드 안에 안내하고 다시 할 수 있게 둔다',
  async (_name, respond, message) => {
    mockApi({ [HOLDER_CHECK]: respond })
    const user = await openForm()
    await fillHolder(user)

    await user.click(checkButton()!)

    expect(await within(card()).findByRole('alert')).toHaveTextContent(message)
    expect(currentStep()).toHaveTextContent('본인 확인')
    expect(checkButton()).toBeEnabled()
    // 폼은 그대로다.
    expect(studentName()).toHaveValue('김하윤')
  },
)

test('적은 것이 있으면 다음 패스로 가기 전에 지울지 묻는다', async () => {
  const user = await openForm()
  await user.type(studentName(), '김하윤')

  await user.click(screen.getByRole('button', { name: '다음 패스 확인하기' }))
  const dialog = screen.getByRole('dialog', { name: '입력한 내용을 지울까요?' })

  await user.click(within(dialog).getByRole('button', { name: '계속 입력' }))
  expect(studentName()).toHaveValue('김하윤')

  await user.click(screen.getByRole('button', { name: '다음 패스 확인하기' }))
  await user.click(screen.getByRole('button', { name: '지우고 다음 패스' }))

  expect(screen.queryByRole('form', { name: '신규 등록 정보' })).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '패스 번호' })).toHaveFocus()
})

test('아무것도 적지 않았으면 묻지 않고 바로 다음 패스로 간다', async () => {
  const user = await openForm()

  await user.click(screen.getByRole('button', { name: '다음 패스 확인하기' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('form', { name: '신규 등록 정보' })).not.toBeInTheDocument()
})

test('다른 패스를 확인하면 폼과 확인 결과를 비운다', async () => {
  mockApi({ [HOLDER_CHECK]: () => jsonResponse({ nameMatches: true, phoneMatches: true }) })
  const user = await openForm()
  await fillHolder(user)
  await user.click(checkButton()!)
  await within(card()).findByText('학생 이름 맞음')

  const search = screen.getByRole('textbox', { name: '패스 번호' })
  await user.clear(search)
  await user.type(search, 'DT-XYZ789{Enter}')

  await waitFor(() => expect(requestOf(VERIFY).body).toEqual({ passNo: 'DT-XYZ789' }))
  await waitFor(() => expect(studentName()).toHaveValue(''))
  expect(within(card()).queryByText('학생 이름 맞음')).not.toBeInTheDocument()
  expect(currentStep()).toHaveTextContent('본인 확인')
})
