import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { Student, StudentCreateRequest } from '@/features/students/api'
import { setupDialog } from '@/test/dialog'
import {
  jsonResponse,
  mockApi,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
  tooManyRequests,
} from '@/test/mockApi'
import { renderApp, staff } from '@/test/renderApp'
import { HOLDER_CHECK, mockLookups, pass, VERIFY } from './deskTestData'

// 데스크 결과의 ③ 학생 등록과 ④ 패스 사용 처리, 완료 화면.
setupMockApi()
setupDialog()

const REGISTER = 'POST /api/v1/students'
const REDEEM = 'POST /api/v1/dongtanpass/passes/42/redeem'
const STUDENT_ID = 7
// 화면에 넣는 번호. 가짜 번호다.
const MOTHER_PHONE = '010-1234-5678'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

let app: ReturnType<typeof renderApp>

/** 서버가 돌려주는 등록 결과. 전화번호는 가운데를 가려서 준다. */
function registeredStudent(body: StudentCreateRequest): Student {
  return {
    id: STUDENT_ID,
    campusId: body.campusId,
    classId: body.classId ?? null,
    name: body.name,
    grade: body.grade,
    school: body.school ?? null,
    phone: null,
    status: 'ENROLLED',
    registeredAt: body.registeredAt ?? '2026-10-18',
    guardians: (body.guardians ?? []).map((guardian, index) => ({
      id: 100 + index,
      name: guardian.name,
      relation: guardian.relation,
      phone: `010-****-${guardian.phone.slice(-4)}`,
      linkedToExisting: false,
    })),
    primaryContact: { name: '이영희', relation: 'MOTHER', phone: '010-****-5678' },
    siblings: [],
  }
}

const redeemed = {
  redemptionId: 300,
  passId: 42,
  studentId: STUDENT_ID,
  redeemedAt: '2026-10-18T05:32:10Z',
}

function mockRegister() {
  mockApi({
    [REGISTER]: ({ body }) => jsonResponse(registeredStudent(body as StudentCreateRequest), 201),
  })
}

/** 패스를 확인하고, 등록 폼을 채우고, 본인 확인이 맞은 데까지. */
async function readyToRegister({ withClass = true } = {}) {
  const user = userEvent.setup()
  mockApi({
    [VERIFY]: () => jsonResponse(pass),
    [HOLDER_CHECK]: () => jsonResponse({ nameMatches: true, phoneMatches: true }),
  })
  mockLookups()
  app = renderApp('/desk/dongtanpass', { me: staff })
  await user.type(await screen.findByRole('textbox', { name: '패스 번호' }), 'DT-ABC234{Enter}')
  await screen.findByRole('form', { name: '신규 등록 정보' })
  await waitFor(() => expect(field('학생', '지점')).toHaveValue('1'))

  await user.type(field('학생', '이름'), '김하윤')
  await user.selectOptions(field('학생', '학년'), '중1')
  if (withClass) await user.selectOptions(field('학생', '반'), '중1 정규')
  await user.type(field('학부모 1', '이름'), '이영희')
  await user.type(field('학부모 1', '휴대전화'), MOTHER_PHONE)
  await user.click(within(card()).getByRole('button', { name: '본인 확인하기' }))
  await within(card()).findByRole('button', { name: '등록하고 패스 사용하기' })
  return user
}

function field(group: string, label: string) {
  return within(screen.getByRole('group', { name: group })).getByLabelText(label)
}

function card() {
  return screen.getByRole('complementary', { name: '처리 순서' })
}

function stepTitled(title: string) {
  return within(card())
    .getAllByRole('listitem')
    .find((item) => item.textContent?.includes(`${title} (`))
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

/** 응답을 붙잡아 두었다가 `release`로 보낸다. 보내는 중의 화면을 볼 때 쓴다. */
function held() {
  let release: (response: Response) => void = () => {}
  const response = new Promise<Response>((resolve) => {
    release = resolve
  })
  return { response: () => response, release: (value: Response) => release(value) }
}

test('등록하고 패스 사용하기: 학생을 등록하고 받은 학생 ID로 사용 처리한 뒤 완료 화면을 보여 준다', async () => {
  mockRegister()
  mockApi({ [REDEEM]: () => jsonResponse(redeemed) })
  const user = await readyToRegister()

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

  const title = await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })
  // 등록 → 사용 처리 순서로 한 번씩.
  expect(requests().filter((key) => key === REGISTER || key === REDEEM)).toEqual([REGISTER, REDEEM])
  expect(requestOf(REGISTER).body).toMatchObject({
    name: '김하윤',
    grade: 'MIDDLE_1',
    campusId: 1,
    classId: 10,
    guardians: [{ relation: 'MOTHER', name: '이영희', phone: MOTHER_PHONE }],
  })
  // 사용 처리 본문은 학생 ID 하나다. 같은 처리가 두 번 되지 않게 멱등 키를 싣는다.
  expect(requestOf(REDEEM).body).toEqual({ studentId: STUDENT_ID })
  expect(requestOf(REDEEM).headers.get('Idempotency-Key')).toMatch(UUID)

  // 완료 화면: 폼과 진행 카드 대신. 끝났다는 제목으로 포커스를 옮긴다.
  const done = title.closest('section')!
  expect(title).toHaveFocus()
  expect(done).toHaveTextContent('김하윤 학생을 등록하고 패스를 사용 처리했어요.')
  const rows = within(done).getAllByRole('definition')
  expect(rows.map((row) => row.textContent)).toEqual([
    '김하윤',
    '중1 정규',
    'DT-ABC234 사용 완료',
    // 서버 시각(UTC)을 한국 시각으로
    '2026.10.18 14:32',
  ])
  expect(within(done).getByRole('link', { name: '학생 정보 보기' })).toHaveAttribute(
    'href',
    `/desk/students/${STUDENT_ID}`,
  )
  // 다음 할 일은 수강료 청구다. 사용 처리 응답의 사용 기록으로 연다(학생은 청구 화면이 사용 기록에서 읽는다).
  expect(within(done).getByRole('link', { name: '수강료 청구 만들기' })).toHaveAttribute(
    'href',
    '/desk/billing/new?redemptionId=300',
  )
  expect(screen.queryByRole('form', { name: '신규 등록 정보' })).not.toBeInTheDocument()
  expect(screen.queryByRole('complementary', { name: '처리 순서' })).not.toBeInTheDocument()

  // 다음 패스: 완료 화면을 거두고 검색 칸으로. 묻지 않는다(지울 것이 없다).
  await user.click(within(done).getByRole('button', { name: '다음 패스 확인하기' }))
  expect(screen.queryByRole('heading', { name: '패스를 사용 처리했어요' })).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '패스 번호' })).toHaveFocus()
})

test('반을 고르지 않았으면 완료 화면의 반은 "정하지 않음"이다', async () => {
  mockRegister()
  mockApi({ [REDEEM]: () => jsonResponse(redeemed) })
  const user = await readyToRegister({ withClass: false })

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

  const done = (await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })).closest(
    'section',
  )!
  expect(within(done).getAllByRole('definition')[1]).toHaveTextContent('정하지 않음')
})

test('완료 화면에서 바로 다른 패스를 확인해도 묻지 않는다', async () => {
  mockRegister()
  mockApi({ [REDEEM]: () => jsonResponse(redeemed) })
  const user = await readyToRegister()
  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))
  await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })

  const search = screen.getByRole('textbox', { name: '패스 번호' })
  await user.clear(search)
  await user.type(search, 'DT-ABC234{Enter}')

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(count(VERIFY)).toBe(2))
  // 새 패스의 폼이 비어 있는 채로 뜬다.
  await screen.findByRole('form', { name: '신규 등록 정보' })
  expect(screen.queryByRole('heading', { name: '패스를 사용 처리했어요' })).not.toBeInTheDocument()
  expect(field('학생', '이름')).toHaveValue('')
})

test('보내는 동안: 등록 중이면 ③, 사용 처리 중이면 ④가 지금 단계이고 폼이 잠긴다', async () => {
  const registering = held()
  const redeeming = held()
  mockApi({ [REGISTER]: registering.response, [REDEEM]: redeeming.response })
  const user = await readyToRegister()
  const form = screen.getByRole('form', { name: '신규 등록 정보' })

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))
  expect(within(card()).getByRole('button', { name: '등록하는 중' })).toBeInTheDocument()
  expect(stepTitled('학생 등록')).toHaveTextContent('학생 등록 (지금 단계)')
  expect(within(form).getByRole('group', { name: '학생' })).toBeDisabled()

  registering.release(
    jsonResponse(registeredStudent(requestOf(REGISTER).body as StudentCreateRequest), 201),
  )
  await within(card()).findByRole('button', { name: '사용 처리하는 중' })
  expect(stepTitled('학생 등록')).toHaveTextContent('학생 등록 (끝남)')
  expect(stepTitled('학생 등록')).toHaveTextContent('김하윤 학생을 등록했어요.')
  expect(stepTitled('패스 사용 처리')).toHaveTextContent('패스 사용 처리 (지금 단계)')
  expect(within(form).getByRole('group', { name: '학생' })).toBeDisabled()

  // 보내는 중에 다시 눌러도(Enter) 더 보내지 않는다.
  await user.click(within(card()).getByRole('button', { name: '사용 처리하는 중' }))
  expect(count(REGISTER)).toBe(1)
  expect(count(REDEEM)).toBe(1)

  redeeming.release(jsonResponse(redeemed))
  await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })
})

test('학생 등록이 칸 검사에 걸리면 보내지 않고, 사용 처리도 하지 않는다', async () => {
  const user = await readyToRegister()
  // 학년을 비운다(본인 확인과는 상관없는 칸).
  await user.selectOptions(field('학생', '학년'), '')

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

  expect(await screen.findByText('학년을 골라 주세요.')).toBeInTheDocument()
  expect(count(REGISTER)).toBe(0)
  expect(count(REDEEM)).toBe(0)
  expect(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' })).toBeEnabled()
  expect(stepTitled('학생 등록')).toHaveTextContent('학생 등록 (지금 단계)')
})

test('학생 등록이 서버에서 막히면 진행 카드에 알리고 사용 처리하지 않는다', async () => {
  mockApi({
    [REGISTER]: () =>
      problemResponse(
        500,
        { detail: 'Internal Server Error' },
        { 'X-Request-Id': 'req-register-1' },
      ),
  })
  const user = await readyToRegister()

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

  const alert = await within(card()).findByRole('alert')
  // 응답을 받지 못했다. 그대로 다시 누르면 같은 키가 나가 두 번 등록되지 않는다.
  expect(alert).toHaveTextContent('내용은 그대로 두고 다시 눌러 주세요. 두 번 저장되지 않아요.')
  expect(count(REDEEM)).toBe(0)
  const key = requestOf(REGISTER).headers.get('Idempotency-Key')

  mockRegister()
  mockApi({ [REDEEM]: () => jsonResponse(redeemed) })
  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))
  await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })
  expect(requestOf(REGISTER).headers.get('Idempotency-Key')).toBe(key)
})

test('사용 처리만 실패하면 폼을 잠근 채 ④를 확인 필요로 두고, 다시 하면 학생을 다시 등록하지 않는다', async () => {
  mockRegister()
  let call = 0
  mockApi({
    [REDEEM]: () => {
      call += 1
      return call === 1
        ? problemResponse(409, {
            code: 'DONGTANPASS_DISCOUNT_INACTIVE',
            detail: '동탄고 패스 할인이 꺼져 있습니다.',
          })
        : jsonResponse(redeemed)
    },
  })
  const user = await readyToRegister()

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

  expect(await within(card()).findByRole('alert')).toHaveTextContent(
    '패스 할인이 꺼져 있어요. 관리자에게 켜 달라고 한 뒤 다시 해 주세요.',
  )
  expect(stepTitled('학생 등록')).toHaveTextContent('학생 등록 (끝남)')
  expect(stepTitled('패스 사용 처리')).toHaveTextContent('패스 사용 처리 (확인 필요)')
  // 이미 등록한 학생이라 고쳐도 소용없다. 폼을 잠근다.
  expect(screen.getByRole('group', { name: '학생' })).toBeDisabled()

  await user.click(within(card()).getByRole('button', { name: '사용 처리 다시 하기' }))

  await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })
  expect(count(REGISTER)).toBe(1)
  expect(count(REDEEM)).toBe(2)
  expect(requestOf(REDEEM).body).toEqual({ studentId: STUDENT_ID })
})

test('사용 처리의 응답을 받지 못했으면, 다시 할 때 같은 키를 보낸다(두 번 처리되지 않는다)', async () => {
  mockRegister()
  let call = 0
  const keys: (string | null)[] = []
  mockApi({
    [REDEEM]: () => {
      call += 1
      return call === 1
        ? problemResponse(503, { detail: 'Service Unavailable' })
        : jsonResponse(redeemed)
    },
  })
  const user = await readyToRegister()

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))
  expect(await within(card()).findByRole('alert')).toHaveTextContent(
    '사용 처리 결과를 받지 못했어요. 그대로 다시 해 주세요. 두 번 처리되지 않아요.',
  )
  keys.push(requestOf(REDEEM).headers.get('Idempotency-Key'))

  await user.click(within(card()).getByRole('button', { name: '사용 처리 다시 하기' }))
  await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })
  keys.push(requestOf(REDEEM).headers.get('Idempotency-Key'))

  expect(keys[0]).toMatch(UUID)
  expect(keys[1]).toBe(keys[0])
})

test.each([
  [
    'DONGTANPASS_STUDENT_NOT_AT_PROVIDING_CAMPUS',
    '학생의 지점이 패스를 받는 지점이 아니에요. 학생 정보에서 지점을 고친 뒤 다시 해 주세요.',
    { name: '학생 정보 고치기 (새 탭)', href: `/desk/students/${STUDENT_ID}/edit` },
  ],
  [
    'DONGTANPASS_HOLDER_NAME_MISMATCH',
    '학생 이름이 패스와 달라요. 학생 정보의 이름을 확인해 주세요. 패스의 이름이 틀렸다면 발급한 학원에 다시 발급을 요청해 주세요.',
    { name: '학생 정보 고치기 (새 탭)', href: `/desk/students/${STUDENT_ID}/edit` },
  ],
  [
    'DONGTANPASS_HOLDER_PHONE_MISMATCH',
    '패스를 받을 때 알려 준 학부모 번호가 학생 정보에 없어요. 학생 정보에서 학부모 번호를 더한 뒤 다시 해 주세요.',
    { name: '학생 정보 열기 (새 탭)', href: `/desk/students/${STUDENT_ID}` },
  ],
  ['DONGTANPASS_PASS_CHANGED_CONCURRENTLY', '다른 처리와 겹쳤어요. 다시 해 주세요.', null],
] as const)(
  '사용 처리 오류 %s: 진행 카드에 안내하고 다시 할 수 있다',
  async (code, message, link) => {
    mockRegister()
    mockApi({ [REDEEM]: () => problemResponse(409, { code, detail: 'server says' }) })
    const user = await readyToRegister()

    await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

    const alert = await within(card()).findByRole('alert')
    expect(alert).toHaveTextContent(message)
    expect(alert).not.toHaveTextContent('server says')
    if (link) {
      // 이 화면을 떠나면 사용 처리를 다시 할 수 없어, 고칠 화면은 새 탭으로 연다.
      const anchor = within(alert).getByRole('link', { name: link.name })
      expect(anchor).toHaveAttribute('href', link.href)
      expect(anchor).toHaveAttribute('target', '_blank')
    } else {
      expect(within(alert).queryByRole('link')).not.toBeInTheDocument()
    }
    expect(within(card()).getByRole('button', { name: '사용 처리 다시 하기' })).toBeEnabled()
  },
)

test.each([
  [
    'DONGTANPASS_STUDENT_NOT_NEW',
    '신규 등록 학생이 아니라서 패스를 쓸 수 없어요. 이미 패스를 쓴 학생이거나, 등록한 지 7일이 지났거나, 재원 중이 아니에요. 학생 정보를 확인해 주세요.',
  ],
  [
    'DONGTANPASS_PASS_NOT_FOUND',
    '패스를 찾지 못했어요. 학생은 이미 등록됐어요. 다시 등록하지 말고 관리자에게 알려 주세요.',
  ],
  ['DONGTANPASS_STUDENT_NOT_FOUND', '등록한 학생을 찾지 못했어요. 학생 목록에서 확인해 주세요.'],
  [
    'DONGTANPASS_CAMPUS_NOT_PROVIDING',
    '이 지점은 동탄고 패스를 받지 않아요. 패스를 받는 지점에서 확인해 주세요.',
  ],
  [
    'DONGTANPASS_PASS_FOR_PARTNER_USE',
    'JEY 어학원이 발급한 패스라 여기서는 쓸 수 없어요. 연계 학원에서만 쓸 수 있다고 학부모님께 안내해 주세요. 학생은 이미 등록됐어요.',
  ],
] as const)(
  '사용 처리 오류 %s: 다시 해도 같은 답이라 다시 하기를 두지 않고, 넘어갈 때 묻지 않는다',
  async (code, message) => {
    mockRegister()
    mockApi({ [REDEEM]: () => problemResponse(409, { code, detail: 'server says' }) })
    const user = await readyToRegister()

    await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

    expect(await within(card()).findByRole('alert')).toHaveTextContent(message)
    expect(within(card()).queryByRole('button', { name: /사용 처리/ })).not.toBeInTheDocument()
    expect(within(card()).getByRole('link', { name: '학생 정보 보기' })).toHaveAttribute(
      'href',
      `/desk/students/${STUDENT_ID}`,
    )
    // 폼에서 Enter를 쳐도 다시 보내지 않는다(횟수 한도를 아낀다).
    fireEvent.submit(screen.getByRole('form', { name: '신규 등록 정보' }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(count(REDEEM)).toBe(1)

    await user.click(screen.getByRole('button', { name: '다음 패스 확인하기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '패스 번호' })).toHaveFocus()
  },
)

test('처음 보는 오류 코드에도 안내가 비지 않고 다시 할 수 있다', async () => {
  mockRegister()
  mockApi({
    [REDEEM]: () => problemResponse(409, { code: 'DONGTANPASS_SOMETHING_NEW', detail: '' }),
  })
  const user = await readyToRegister()

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

  expect((await within(card()).findByRole('alert')).textContent?.trim()).not.toBe('')
  expect(within(card()).getByRole('button', { name: '사용 처리 다시 하기' })).toBeEnabled()
})

test('사용 처리 횟수를 넘으면(429) 다시 할 수 있는 때를 알린다', async () => {
  mockRegister()
  mockApi({
    [REDEEM]: () => tooManyRequests({ code: 'DONGTANPASS_REDEEM_LIMITED' }, '120'),
  })
  const user = await readyToRegister()

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

  expect(await within(card()).findByRole('alert')).toHaveTextContent(
    /^사용 처리를 여러 번 했어요\. .+에 다시 해 주세요\./,
  )
})

test('사용 처리하려는 사이 패스를 쓸 수 없게 됐으면(409) 그 상태와 함께 학생은 등록됐다고 알린다', async () => {
  mockRegister()
  mockApi({
    [REDEEM]: () =>
      problemResponse(409, {
        code: 'DONGTANPASS_PASS_ALREADY_REDEEMED',
        detail: '이미 사용한 패스입니다.',
      }),
  })
  const user = await readyToRegister()

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

  const panel = await screen.findByRole('region', { name: '패스 확인 결과' })
  await waitFor(() => expect(panel).toHaveFocus())
  expect(panel).toHaveTextContent('이미 사용한 패스예요')
  expect(
    screen.getByText('김하윤 학생은 등록됐어요. 패스는 사용 처리되지 않았어요.'),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '학생 정보 보기' })).toHaveAttribute(
    'href',
    `/desk/students/${STUDENT_ID}`,
  )
  expect(screen.queryByRole('form', { name: '신규 등록 정보' })).not.toBeInTheDocument()

  // 더 할 것이 없어 묻지 않고 넘어간다.
  await user.click(screen.getByRole('button', { name: '다음 패스 확인하기' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '패스 번호' })).toHaveFocus()
})

/** 학생은 등록했는데 사용 처리가 실패한 데까지. */
async function registeredButNotRedeemed() {
  mockRegister()
  mockApi({
    [REDEEM]: () => problemResponse(409, { code: 'DONGTANPASS_DISCOUNT_INACTIVE' }),
  })
  const user = await readyToRegister()
  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))
  await within(card()).findByRole('button', { name: '사용 처리 다시 하기' })
  return user
}

test('학생만 등록하고 넘어가려 하면(다음 패스 확인하기) 사용 처리되지 않는다고 먼저 묻는다', async () => {
  const user = await registeredButNotRedeemed()

  await user.click(screen.getByRole('button', { name: '다음 패스 확인하기' }))

  const dialog = await screen.findByRole('dialog', { name: '패스를 사용하지 않고 넘어갈까요?' })
  expect(dialog).toHaveAccessibleDescription(
    '학생은 이미 등록됐어요. 지금 넘어가면 이 패스는 사용 처리되지 않아요.',
  )
  await user.click(within(dialog).getByRole('button', { name: '돌아가기' }))
  expect(screen.getByRole('form', { name: '신규 등록 정보' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '다음 패스 확인하기' }))
  await user.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: '넘어가기' }),
  )
  await waitFor(() =>
    expect(screen.queryByRole('form', { name: '신규 등록 정보' })).not.toBeInTheDocument(),
  )
  await waitFor(() => expect(screen.getByRole('textbox', { name: '패스 번호' })).toHaveFocus())
})

test('학생만 등록한 채 다른 패스를 확인하려 해도 먼저 묻는다', async () => {
  const user = await registeredButNotRedeemed()
  const search = screen.getByRole('textbox', { name: '패스 번호' })
  await user.clear(search)
  await user.type(search, 'DT-XYZ789{Enter}')

  const dialog = await screen.findByRole('dialog', { name: '패스를 사용하지 않고 넘어갈까요?' })
  expect(count(VERIFY)).toBe(1)
  await user.click(within(dialog).getByRole('button', { name: '넘어가고 확인' }))
  await waitFor(() => expect(count(VERIFY)).toBe(2))
})

test('개인정보: 사용 처리 본문에는 학생 ID만, 주소·콘솔·저장소에는 번호가 없고 끝나면 요청 기록도 지운다', async () => {
  const log = vi.spyOn(console, 'log')
  const error = vi.spyOn(console, 'error')
  const warn = vi.spyOn(console, 'warn')
  mockRegister()
  mockApi({ [REDEEM]: () => jsonResponse(redeemed) })
  const user = await readyToRegister()

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))
  await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })

  const digits = MOTHER_PHONE.replaceAll('-', '')
  const seen = [
    app.router.state.location.pathname + app.router.state.location.search,
    ...requests(),
    JSON.stringify(requestOf(REDEEM).body),
    JSON.stringify([...log.mock.calls, ...error.mock.calls, ...warn.mock.calls]),
    JSON.stringify({ ...localStorage }),
    JSON.stringify({ ...sessionStorage }),
  ].join('\n')
  expect(seen).not.toContain(digits)
  expect(seen).not.toContain(MOTHER_PHONE)
  // 완료 화면에서는 등록 폼이 내려가, 번호 원문이 든 요청 기록(학생 등록, 본인 확인)이 남지 않는다.
  await waitFor(() => {
    const sent = JSON.stringify(
      app.queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.state.variables),
    )
    expect(sent).not.toContain(digits)
    expect(sent).not.toContain(MOTHER_PHONE)
  })
})

// ── 보내는 동안, 다른 화면으로 갈 때 ─────────────────────────────

const EMPTY_STUDENTS = () =>
  jsonResponse({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 })

test('학생 등록을 보내는 동안에는 다음 패스로 넘어가지 못하고, 다른 패스 확인은 끝난 뒤 하라고 알린다', async () => {
  const registering = held()
  mockApi({ [REGISTER]: registering.response, [REDEEM]: () => jsonResponse(redeemed) })
  const user = await readyToRegister()

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))
  // 다시 눌러도 한 번만 나간다.
  await user.click(within(card()).getByRole('button', { name: '등록하는 중' }))
  expect(count(REGISTER)).toBe(1)

  expect(screen.getByRole('button', { name: '다음 패스 확인하기' })).toBeDisabled()
  const search = screen.getByRole('textbox', { name: '패스 번호' })
  await user.clear(search)
  await user.type(search, 'DT-XYZ789{Enter}')
  const dialog = await screen.findByRole('dialog', { name: '처리하는 중이에요' })
  expect(dialog).toHaveAccessibleDescription(
    '학생 등록과 패스 사용 처리가 끝난 뒤에 넘어갈 수 있어요.',
  )
  expect(count(VERIFY)).toBe(1)
  await user.click(within(dialog).getByRole('button', { name: '확인' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

  // 등록이 끝나면 사용 처리까지 이어진다(떠나지 않았으므로 답을 받는다).
  registering.release(
    jsonResponse(registeredStudent(requestOf(REGISTER).body as StudentCreateRequest), 201),
  )
  await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })
  expect(count(REDEEM)).toBe(1)
  expect(count(VERIFY)).toBe(1)
})

test('사용 처리를 보내는 동안에도 넘어가지 못한다', async () => {
  const redeeming = held()
  mockRegister()
  mockApi({ [REDEEM]: redeeming.response })
  const user = await readyToRegister()

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))
  await within(card()).findByRole('button', { name: '사용 처리하는 중' })

  expect(screen.getByRole('button', { name: '다음 패스 확인하기' })).toBeDisabled()
  await user.type(screen.getByRole('textbox', { name: '패스 번호' }), '{Enter}')
  expect(await screen.findByRole('dialog', { name: '처리하는 중이에요' })).toBeInTheDocument()
  expect(count(VERIFY)).toBe(1)
})

test('보내는 동안 다른 화면으로 가려 하면 막고, 끝난 뒤에는 완료 화면에 머문다', async () => {
  const redeeming = held()
  mockRegister()
  mockApi({ [REDEEM]: redeeming.response })
  const user = await readyToRegister()
  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))
  await within(card()).findByRole('button', { name: '사용 처리하는 중' })

  await user.click(screen.getByRole('link', { name: '학생' }))

  expect(await screen.findByRole('dialog', { name: '처리하는 중이에요' })).toBeInTheDocument()
  expect(app.router.state.location.pathname).toBe('/desk/dongtanpass')

  redeeming.release(jsonResponse(redeemed))
  await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(app.router.state.location.pathname).toBe('/desk/dongtanpass')
})

test('학생만 등록한 채 다른 화면으로 가려 하면 묻는다(돌아가기 / 넘어가기)', async () => {
  const user = await registeredButNotRedeemed()

  await user.click(screen.getByRole('link', { name: '학생' }))
  const dialog = await screen.findByRole('dialog', { name: '패스를 사용하지 않고 넘어갈까요?' })
  await user.click(within(dialog).getByRole('button', { name: '돌아가기' }))
  expect(app.router.state.location.pathname).toBe('/desk/dongtanpass')
  expect(screen.getByRole('button', { name: '사용 처리 다시 하기' })).toBeInTheDocument()

  mockApi({ 'POST /api/v1/students/search': EMPTY_STUDENTS })
  await user.click(screen.getByRole('link', { name: '학생' }))
  await user.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: '넘어가기' }),
  )
  await waitFor(() => expect(app.router.state.location.pathname).toBe('/desk/students'))
})

test('폼에 적기만 했으면 다른 화면으로 갈 때 묻지 않는다(학생 등록 화면과 같다)', async () => {
  mockApi({ 'POST /api/v1/students/search': EMPTY_STUDENTS })
  const user = await readyToRegister()

  await user.click(screen.getByRole('link', { name: '학생' }))

  await waitFor(() => expect(app.router.state.location.pathname).toBe('/desk/students'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('학생만 등록됐으면 새로 고침·탭 닫기 때 브라우저가 묻게 하고, 끝나면 그만둔다', async () => {
  const user = await registeredButNotRedeemed()
  const unload = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }
  expect(unload()).toBe(true)

  mockApi({ [REDEEM]: () => jsonResponse(redeemed) })
  await user.click(within(card()).getByRole('button', { name: '사용 처리 다시 하기' }))
  await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })
  // 경고는 완료 화면이 뜬 다음 한 번 더 그릴 때 풀린다(흐름이 내려가며 물을 것이 없다고 알린 뒤).
  await waitFor(() => expect(unload()).toBe(false))
})

test('학생 등록의 응답을 받지 못했다는 안내는 이름을 고쳐 본인 확인으로 돌아가도 남는다', async () => {
  mockApi({ [REGISTER]: () => problemResponse(500, { detail: 'Internal Server Error' }) })
  const user = await readyToRegister()
  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))
  await within(card()).findByRole('alert')

  await user.type(field('학생', '이름'), '이')

  expect(within(card()).getByRole('button', { name: '본인 확인하기' })).toBeInTheDocument()
  expect(within(card()).getByRole('alert')).toHaveTextContent('저장됐을 수도 있어요.')
})

test('학생 등록이 칸 오류로 막히면 그 칸 아래에 알리고 사용 처리하지 않는다', async () => {
  mockApi({
    [REGISTER]: () =>
      problemResponse(400, { code: 'MEMBER_INVALID_CLASS', detail: '이 지점의 반이 아니에요.' }),
  })
  const user = await readyToRegister()

  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))

  await waitFor(() =>
    expect(field('학생', '반')).toHaveAccessibleDescription(/이 지점의 반이 아니에요/),
  )
  expect(within(card()).queryByRole('alert')).not.toBeInTheDocument()
  expect(count(REDEEM)).toBe(0)
  expect(stepTitled('학생 등록')).toHaveTextContent('학생 등록 (지금 단계)')
})

test('완료 화면에서 다음 패스로 넘어갈 때 쓴 패스의 등록 폼이 잠깐이라도 다시 그려지지 않는다', async () => {
  mockRegister()
  mockApi({ [REDEEM]: () => jsonResponse(redeemed) })
  const user = await readyToRegister()
  await user.click(within(card()).getByRole('button', { name: '등록하고 패스 사용하기' }))
  const done = (await screen.findByRole('heading', { name: '패스를 사용 처리했어요' })).closest(
    'section',
  )!

  let formSeen = false
  const observer = new MutationObserver(() => {
    if (document.body.textContent?.includes('신규 등록 정보')) formSeen = true
  })
  observer.observe(document.body, { childList: true, subtree: true })
  await user.click(within(done).getByRole('button', { name: '다음 패스 확인하기' }))
  await new Promise((resolve) => setTimeout(resolve, 50))
  observer.disconnect()

  expect(formSeen).toBe(false)
  expect(screen.queryByRole('heading', { name: '패스를 사용 처리했어요' })).not.toBeInTheDocument()
})
