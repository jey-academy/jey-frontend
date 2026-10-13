import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { setupDialog } from '@/test/dialog'
import {
  jsonResponse,
  mockApi,
  noContent,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
} from '@/test/mockApi'
import { renderApp, staff } from '@/test/renderApp'
import type { Guardian, Student } from '../api'

// 학생 상세에서 학부모를 추가하고, 고치고, 연결을 끊는 흐름. 보기는 StudentDetailPage.test.tsx에 있다.

setupMockApi()
setupDialog()

const PATH = '/desk/students/1'
const DETAIL = 'GET /api/v1/students/1'
const ADD = 'POST /api/v1/students/1/guardians'
const RELATION = 'PUT /api/v1/students/1/guardians/7'
const PROFILE = 'PUT /api/v1/guardians/7'
const UNLINK = 'DELETE /api/v1/students/1/guardians/7'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

// 전화번호는 서버가 가운데를 가려서 준다.
const mother: Guardian = {
  id: 7,
  relation: 'MOTHER',
  name: '이영희',
  phone: '010-****-5678',
  linkedToExisting: false,
}
const father: Guardian = {
  id: 8,
  relation: 'FATHER',
  name: '김철수',
  phone: '010-****-5432',
  linkedToExisting: false,
}
const doyun: Student = {
  id: 1,
  campusId: 1,
  classId: null,
  name: '김도윤',
  grade: 'MIDDLE_1',
  school: null,
  phone: null,
  status: 'ENROLLED',
  registeredAt: '2026-09-01',
  guardians: [mother, father],
  primaryContact: { name: '이영희', relation: 'MOTHER', phone: '010-****-5678' },
  siblings: [],
}

/** 상세 조회를 흉내 낸다. 호출할 때마다 `server.student`의 지금 값을 돌려준다. */
function mockDetail(student: Student = doyun) {
  const server = { student }
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse([{ id: 1, name: '동탄관' }]),
    'GET /api/v1/classes': () => jsonResponse([]),
    [DETAIL]: () => jsonResponse(server.student),
  })
  return server
}

function count(key: string) {
  return requests().filter((request) => request === key).length
}

function guardianRows() {
  const card = screen.getByRole('heading', { level: 2, name: '학부모' }).parentElement!
  return (
    within(card)
      .queryAllByRole('listitem')
      // 줄의 버튼은 빼고 관계·이름·번호만 본다.
      .map((item) => {
        const row = item.cloneNode(true) as HTMLElement
        row.querySelectorAll('button').forEach((button) => button.remove())
        return row.textContent
      })
  )
}

async function open(button: string, dialogName: string) {
  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  await userEvent.click(screen.getByRole('button', { name: button }))
  return screen.findByRole('dialog', { name: dialogName })
}

async function fill(dialog: HTMLElement, label: string, value: string) {
  const input = within(dialog).getByLabelText(label)
  await userEvent.clear(input)
  if (value) await userEvent.type(input, value)
}

function press(dialog: HTMLElement, name: string) {
  return userEvent.click(within(dialog).getByRole('button', { name }))
}

function closed() {
  return waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

// ── 추가 ─────────────────────────────────────────────────

test('학부모를 추가하면 입력한 값을 멱등 키와 함께 보내고, 응답으로 목록을 바꾸고 알린다', async () => {
  mockDetail({ ...doyun, guardians: [mother] })
  const grandma: Guardian = {
    id: 9,
    relation: 'GRANDPARENT',
    name: '박순자',
    phone: '010-****-1111',
    linkedToExisting: false,
  }
  mockApi({ [ADD]: () => jsonResponse({ ...doyun, guardians: [mother, grandma] }, 201) })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')

  // 어머니가 이미 있으면 아버지가 골라져 있다.
  expect(within(dialog).getByLabelText('관계')).toHaveDisplayValue('아버지')
  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '조부모')
  await fill(dialog, '이름', ' 박순자 ')
  await fill(dialog, '휴대전화', ' 010-2222-1111 ')
  await press(dialog, '추가')

  await closed()
  const request = requestOf(ADD)
  expect(request.body).toEqual({ relation: 'GRANDPARENT', name: '박순자', phone: '010-2222-1111' })
  expect(request.headers.get('Idempotency-Key')).toMatch(UUID)
  expect(screen.getByRole('status')).toHaveTextContent('박순자 학부모를 추가했어요.')
  // 새 줄에서도 번호 보기, 수정, 연결 끊기를 쓸 수 있다.
  for (const name of ['박순자 번호 보기', '박순자 수정', '박순자 연결 끊기']) {
    expect(screen.getByRole('button', { name })).toBeEnabled()
  }
  expect(guardianRows()).toEqual(['어머니이영희010-****-5678', '조부모박순자010-****-1111'])
  // 응답을 상세에 넣었으므로 다시 묻지 않는다.
  expect(count(DETAIL)).toBe(1)
})

test('같은 번호의 학부모가 이미 있어 그 학부모에 연결되면, 저장돼 있던 이름으로 알린다', async () => {
  mockDetail({ ...doyun, guardians: [mother] })
  const existing: Guardian = {
    id: 20,
    relation: 'FATHER',
    name: '박다른',
    phone: '010-****-9999',
    linkedToExisting: true,
  }
  mockApi({ [ADD]: () => jsonResponse({ ...doyun, guardians: [mother, existing] }, 201) })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')

  await fill(dialog, '이름', '김철수')
  await fill(dialog, '휴대전화', '010-3333-9999')
  await press(dialog, '추가')

  await closed()
  const notice = screen.getByRole('status')
  expect(notice).toHaveTextContent('이미 등록된 학부모(박다른, 010-****-9999)에 연결했어요.')
  expect(notice).toHaveTextContent('입력한 이름은 쓰이지 않았어요.')
  expect(notice).not.toHaveTextContent('김철수')
})

test.each([
  ['이름과 번호를 비우면', '', '', '이름을 입력해 주세요.', '휴대전화 번호를 입력해 주세요.'],
  [
    '휴대전화 번호가 아니면',
    '박순자',
    '031-123-4567',
    undefined,
    '휴대전화 번호 형식이 아니에요. 예: 010-1234-5678',
  ],
])('추가: %s 보내지 않고 칸 아래에 알린다', async (_case, name, phone, nameError, phoneError) => {
  mockDetail()
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')

  await fill(dialog, '이름', name)
  await fill(dialog, '휴대전화', phone)
  await press(dialog, '추가')

  if (nameError) {
    expect(within(dialog).getByLabelText('이름')).toHaveAccessibleDescription(nameError)
  }
  expect(within(dialog).getByLabelText('휴대전화')).toHaveAccessibleDescription(phoneError)
  expect(count(ADD)).toBe(0)
})

test('추가: 이미 이 학생에게 연결된 학부모의 번호면 번호 칸 아래에 알린다', async () => {
  mockDetail()
  mockApi({
    [ADD]: () =>
      problemResponse(409, {
        detail: '이미 이 학생에게 연결된 학부모입니다.',
        code: 'MEMBER_GUARDIAN_ALREADY_LINKED',
      }),
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')

  await fill(dialog, '이름', '이영희')
  await fill(dialog, '휴대전화', '010-1234-5678')
  await press(dialog, '추가')

  await waitFor(() =>
    expect(within(dialog).getByLabelText('휴대전화')).toHaveAccessibleDescription(
      '이미 이 학생에게 연결된 학부모입니다.',
    ),
  )
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: '추가' })).toBeEnabled()
})

const third: Guardian = { ...father, id: 10, relation: 'GRANDPARENT', name: '박순자' }
const fourth: Guardian = { ...father, id: 11, relation: 'OTHER', name: '최이모' }

// 상한이 생기기 전에 다섯 명이 된 학생이 있을 수 있다.
const fifth: Guardian = { ...father, id: 12, relation: 'OTHER', name: '정고모' }

test.each([
  ['네 명', [mother, father, third, fourth]],
  ['다섯 명', [mother, father, third, fourth, fifth]],
])('학부모가 %s이면 추가를 막고 까닭을 적는다', async (_name, guardians) => {
  mockDetail({ ...doyun, guardians })
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  // 포커스를 받을 수 있게 disabled가 아니라 aria-disabled로 막는다. 까닭은 버튼의 설명으로 읽힌다.
  const add = screen.getByRole('button', { name: '학부모 추가' })
  expect(add).toHaveAttribute('aria-disabled', 'true')
  expect(add).toHaveAccessibleDescription('학부모는 4명까지 연결할 수 있어요.')
  await userEvent.click(add)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(count(ADD)).toBe(0)
  // 있는 학부모를 고치거나 끊는 것은 된다.
  expect(screen.getByRole('button', { name: '최이모 수정' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '최이모 연결 끊기' })).toBeEnabled()
})

test('넷째 학부모를 추가하면 추가 버튼이 막히지만, 창이 닫힌 뒤의 포커스는 받을 수 있다', async () => {
  mockDetail({ ...doyun, guardians: [mother, father, third] })
  mockApi({
    [ADD]: () => jsonResponse({ ...doyun, guardians: [mother, father, third, fourth] }, 201),
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fill(dialog, '이름', '최이모')
  await fill(dialog, '휴대전화', '010-1234-5678')

  await press(dialog, '추가')

  await closed()
  const add = screen.getByRole('button', { name: '학부모 추가' })
  expect(add).toHaveAttribute('aria-disabled', 'true')
  // 브라우저는 창이 닫히면 창을 연 버튼으로 포커스를 돌려준다(jsdom은 흉내 내지 않는다).
  // disabled면 받지 못해 포커스가 갈 곳을 잃는다. 막힌 뒤에도 포커스를 받을 수 있는지를 본다.
  add.focus()
  expect(add).toHaveFocus()
})

test('학부모가 세 명이면 추가할 수 있다', async () => {
  mockDetail({ ...doyun, guardians: [mother, father, third] })
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  expect(screen.getByRole('button', { name: '학부모 추가' })).not.toHaveAttribute('aria-disabled')
  expect(screen.queryByText('학부모는 4명까지 연결할 수 있어요.')).not.toBeInTheDocument()
})

test('추가: 그 사이 학부모가 네 명이 돼 서버가 거부하면 서버의 문구를 폼 아래에 보여준다', async () => {
  // 화면은 세 명일 때 열었다. 다른 직원이 먼저 넷째를 붙였다.
  mockDetail({ ...doyun, guardians: [mother, father, third] })
  mockApi({
    [ADD]: () =>
      problemResponse(409, {
        detail: '학부모는 4명까지 연결할 수 있습니다.',
        code: 'MEMBER_TOO_MANY_GUARDIANS',
        requestId: 'req-too-many',
      }),
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')

  await fill(dialog, '이름', '최이모')
  await fill(dialog, '휴대전화', '010-1234-5678')
  await press(dialog, '추가')

  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent('학부모는 4명까지 연결할 수 있습니다.')
  // 입력이 틀린 것이 아니다. 칸에 표시하지 않는다.
  expect(within(dialog).getByLabelText('휴대전화')).not.toBeInvalid()
  // 문구만으로 할 일을 알 수 있어 요청 번호는 붙이지 않는다.
  expect(alert).not.toHaveTextContent('req-too-many')
})

test('추가: 서버가 번호의 형식을 짚어 거부하면 번호 칸 아래에 보여준다', async () => {
  mockDetail()
  mockApi({
    [ADD]: () =>
      problemResponse(400, {
        detail: '입력값이 올바르지 않습니다.',
        code: 'COMMON_VALIDATION_FAILED',
        errors: [{ field: 'phone', message: '휴대전화 번호 형식이 아닙니다.' }],
      }),
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')

  // 화면의 확인은 통과했는데 서버가 거부한 경우다.
  await fill(dialog, '이름', '최이모')
  await fill(dialog, '휴대전화', '010-1234-5678')
  await press(dialog, '추가')

  await waitFor(() =>
    expect(within(dialog).getByLabelText('휴대전화')).toHaveAccessibleDescription(
      '휴대전화 번호 형식이 아닙니다.',
    ),
  )
  // 칸을 짚었으면 "입력값이 올바르지 않습니다"는 되풀이하지 않는다.
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
})

test('추가: 응답을 받지 못하면 그대로 다시 누르라고 알리고, 다시 누르면 같은 키로 보낸다', async () => {
  let attempts = 0
  mockDetail({ ...doyun, guardians: [mother] })
  mockApi({
    [ADD]: () => {
      attempts += 1
      if (attempts === 1) throw new TypeError('Failed to fetch')
      return jsonResponse({ ...doyun, guardians: [mother, father] }, 201)
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')

  await fill(dialog, '이름', '김철수')
  await fill(dialog, '휴대전화', '010-9876-5432')
  await press(dialog, '추가')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '저장됐을 수도 있어요. 내용은 그대로 두고 다시 눌러 주세요. 두 번 저장되지 않아요.',
  )
  const firstKey = requestOf(ADD).headers.get('Idempotency-Key')
  await press(dialog, '추가')

  await closed()
  expect(count(ADD)).toBe(2)
  expect(firstKey).toMatch(UUID)
  expect(requestOf(ADD).headers.get('Idempotency-Key')).toBe(firstKey)
  expect(screen.getByRole('status')).toHaveTextContent('김철수 학부모를 추가했어요.')
})

// ── 수정 ─────────────────────────────────────────────────

test('수정 창은 지금 관계와 이름으로 채워져 있고, 번호 칸은 비어 있다', async () => {
  mockDetail()
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')

  expect(within(dialog).getByLabelText('관계')).toHaveDisplayValue('어머니')
  expect(within(dialog).getByLabelText('이름')).toHaveValue('이영희')
  // 받은 번호는 가려져 있어 다시 보낼 수 없다.
  expect(within(dialog).getByLabelText('새 휴대전화')).toHaveValue('')
  expect(within(dialog).getByLabelText('새 휴대전화')).toHaveAccessibleDescription(
    '지금 번호: 010-****-5678. 바꿀 때만 입력해요.',
  )
  expect(within(dialog).getByLabelText('이름')).toHaveAccessibleDescription(
    '이름과 번호는 이 학부모에 연결된 형제에게도 함께 바뀌어요.',
  )
})

test('관계만 바꾸면 관계 요청만 보내고, 응답으로 목록을 바꾼다', async () => {
  mockDetail()
  const changed = { ...mother, relation: 'GRANDPARENT' as const }
  mockApi({ [RELATION]: () => jsonResponse({ ...doyun, guardians: [changed, father] }) })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')

  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '조부모')
  await press(dialog, '저장')

  await closed()
  expect(requestOf(RELATION).body).toEqual({ relation: 'GRANDPARENT' })
  expect(requestOf(RELATION).headers.get('Idempotency-Key')).toBeNull()
  expect(count(PROFILE)).toBe(0)
  expect(screen.getByRole('status')).toHaveTextContent('학부모 정보를 고쳤어요.')
  expect(guardianRows()[0]).toBe('조부모이영희010-****-5678')
})

test('이름만 바꾸면 번호 없이 이름만 보내고, 학생을 다시 받는다', async () => {
  const server = mockDetail()
  mockApi({
    [PROFILE]: () => {
      server.student = { ...doyun, guardians: [{ ...mother, name: '이영화' }, father] }
      return jsonResponse({ id: 7, name: '이영화', phone: '010-****-5678' })
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')

  await fill(dialog, '이름', ' 이영화 ')
  await press(dialog, '저장')

  await closed()
  // 번호를 보내지 않으면 서버가 그대로 둔다. 가린 번호를 보내면 거부한다.
  expect(requestOf(PROFILE).body).toEqual({ name: '이영화' })
  expect(count(RELATION)).toBe(0)
  await waitFor(() => expect(guardianRows()[0]).toBe('어머니이영화010-****-5678'))
})

test('새 번호를 입력하면 이름과 함께 보낸다', async () => {
  const server = mockDetail()
  mockApi({
    [PROFILE]: () => {
      server.student = { ...doyun, guardians: [{ ...mother, phone: '010-****-0001' }, father] }
      return jsonResponse({ id: 7, name: '이영희', phone: '010-****-0001' })
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')

  await fill(dialog, '새 휴대전화', ' 010-7777-0001 ')
  await press(dialog, '저장')

  await closed()
  expect(requestOf(PROFILE).body).toEqual({ name: '이영희', phone: '010-7777-0001' })
  await waitFor(() => expect(guardianRows()[0]).toContain('010-****-0001'))
})

test('수정: 바꾼 것이 없으면 보내지 않고 닫는다', async () => {
  mockDetail()
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')

  await press(dialog, '저장')

  await closed()
  expect(count(RELATION)).toBe(0)
  expect(count(PROFILE)).toBe(0)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('수정: 새 번호가 휴대전화 번호가 아니면 보내지 않는다', async () => {
  mockDetail()
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')

  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '조부모')
  await fill(dialog, '새 휴대전화', '010-****-5678')
  await press(dialog, '저장')

  expect(within(dialog).getByLabelText('새 휴대전화')).toHaveAccessibleDescription(
    '휴대전화 번호 형식이 아니에요. 예: 010-1234-5678',
  )
  expect(count(RELATION)).toBe(0)
  expect(count(PROFILE)).toBe(0)
})

test('관계와 번호를 함께 바꿨는데 번호가 거부되면 관계는 저장됐다고 알리고, 고쳐 다시 저장하면 번호만 보낸다', async () => {
  let profileAttempts = 0
  const server = mockDetail()
  const changed = { ...mother, relation: 'GRANDPARENT' as const }
  mockApi({
    [RELATION]: () => {
      server.student = { ...doyun, guardians: [changed, father] }
      return jsonResponse(server.student)
    },
    [PROFILE]: () => {
      profileAttempts += 1
      if (profileAttempts === 1) {
        return problemResponse(409, {
          detail: '다른 학부모가 쓰고 있는 전화번호입니다.',
          code: 'MEMBER_GUARDIAN_PHONE_DUPLICATED',
        })
      }
      return jsonResponse({ id: 7, name: '이영희', phone: '010-****-0002' })
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')

  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '조부모')
  await fill(dialog, '새 휴대전화', '010-9876-5432')
  await press(dialog, '저장')

  expect(await within(dialog).findByRole('status')).toHaveTextContent(
    '관계는 저장됐어요. 이름과 번호는 아직 저장되지 않았어요.',
  )
  const phone = within(dialog).getByLabelText('새 휴대전화')
  expect(phone).toHaveAccessibleDescription(
    '다른 학부모가 쓰고 있는 전화번호입니다. 그 학부모로 바꾸려면 그 번호로 학부모를 추가한 뒤 이 학부모의 연결을 끊어 주세요.',
  )
  // 입력은 그대로 남아 고쳐서 다시 낼 수 있다.
  expect(phone).toHaveValue('010-9876-5432')
  expect(within(dialog).getByLabelText('관계')).toHaveDisplayValue('조부모')

  await fill(dialog, '새 휴대전화', '010-7777-0002')
  await press(dialog, '저장')

  await closed()
  // 관계는 이미 저장됐으므로 다시 보내지 않는다.
  expect(count(RELATION)).toBe(1)
  expect(count(PROFILE)).toBe(2)
  expect(requestOf(PROFILE).body).toEqual({ name: '이영희', phone: '010-7777-0002' })
  expect(screen.getByRole('status')).toHaveTextContent('학부모 정보를 고쳤어요.')
})

test('수정: 관계 저장이 실패하면 이름·번호는 보내지 않는다', async () => {
  mockDetail()
  mockApi({ [RELATION]: () => problemResponse(403, { detail: '권한이 없습니다.' }) })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')

  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '조부모')
  await fill(dialog, '이름', '이영화')
  await press(dialog, '저장')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('권한이 없습니다.')
  expect(within(dialog).queryByRole('status')).not.toBeInTheDocument()
  expect(count(PROFILE)).toBe(0)
  expect(within(dialog).getByLabelText('이름')).toHaveValue('이영화')
})

test('수정: 응답을 받지 못하면 그대로 다시 저장해도 된다고 알린다', async () => {
  mockDetail()
  mockApi({
    [PROFILE]: () => {
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')

  await fill(dialog, '이름', '이영화')
  await press(dialog, '저장')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '연결 상태를 확인해 주세요. 저장됐는지 확인하지 못했어요. 그대로 다시 저장해도 돼요.',
  )
  expect(count(PROFILE)).toBe(1)
  // 저장됐을 수 있으니 학생을 다시 받는다.
  await waitFor(() => expect(count(DETAIL)).toBe(2))
})

test('수정: 그 사이 연결이 끊긴 학부모면 창을 닫고 화면에 알린다', async () => {
  const server = mockDetail()
  mockApi({
    [RELATION]: () => {
      // 다른 직원이 먼저 끊었다.
      server.student = { ...doyun, guardians: [father] }
      return problemResponse(404, {
        detail: '학부모를 찾을 수 없습니다.',
        code: 'MEMBER_GUARDIAN_NOT_FOUND',
      })
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')

  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '조부모')
  await press(dialog, '저장')

  await closed()
  expect(screen.getByRole('alert')).toHaveTextContent('고치려던 학부모는 이미 연결이 끊겼어요.')
  expect(guardianRows()).toEqual(['아버지김철수010-****-5432'])
})

// ── 연결 끊기 ────────────────────────────────────────────

test('연결을 끊으면 누구를 끊는지 묻고, 끊은 뒤 목록에서 빼고 알린다', async () => {
  const server = mockDetail()
  mockApi({
    [UNLINK]: () => {
      server.student = { ...doyun, guardians: [father] }
      return noContent()
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 연결 끊기', '학부모 연결을 끊을까요?')

  expect(dialog).toHaveTextContent(
    '김도윤 학생에게서 어머니 이영희(010-****-5678)의 연결을 끊어요.',
  )
  expect(count(UNLINK)).toBe(0)
  await press(dialog, '연결 끊기')

  await closed()
  expect(screen.getByRole('status')).toHaveTextContent('이영희 학부모의 연결을 끊었어요.')
  expect(guardianRows()).toEqual(['아버지김철수010-****-5432'])
  // 대표 연락처와 형제가 바뀔 수 있어 학생을 다시 받는다.
  await waitFor(() => expect(count(DETAIL)).toBe(2))
})

test('연결 끊기: 닫기를 누르면 끊지 않는다', async () => {
  mockDetail()
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 연결 끊기', '학부모 연결을 끊을까요?')

  await press(dialog, '닫기')

  await closed()
  expect(count(UNLINK)).toBe(0)
  expect(guardianRows()).toHaveLength(2)
})

test('연결 끊기: 하나 남은 연락처면 끊을 수 없다고 알리고 학부모는 그대로 둔다', async () => {
  mockDetail({ ...doyun, guardians: [mother] })
  mockApi({
    [UNLINK]: () =>
      problemResponse(409, {
        detail: '마지막 연락처는 지울 수 없습니다. 다른 연락처를 먼저 넣어 주세요.',
        code: 'MEMBER_LAST_CONTACT',
      }),
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 연결 끊기', '학부모 연결을 끊을까요?')

  await press(dialog, '연결 끊기')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '하나 남은 연락처라 끊을 수 없어요. 다른 연락처를 먼저 넣어 주세요.',
  )
  expect(screen.queryByRole('status')).not.toBeInTheDocument()

  // 창을 닫아도 결과가 화면에 남는다.
  await press(dialog, '닫기')
  await closed()
  expect(screen.getByRole('alert')).toHaveTextContent('하나 남은 연락처라 끊을 수 없어요.')
  expect(guardianRows()).toHaveLength(1)
})

test('연결 끊기: 이미 끊긴 학부모(404)면 끊은 것으로 보고 학생을 다시 받는다', async () => {
  const server = mockDetail()
  mockApi({
    [UNLINK]: () => {
      server.student = { ...doyun, guardians: [father] }
      return problemResponse(404, {
        detail: '학부모를 찾을 수 없습니다.',
        code: 'MEMBER_GUARDIAN_NOT_FOUND',
      })
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 연결 끊기', '학부모 연결을 끊을까요?')

  await press(dialog, '연결 끊기')

  await closed()
  expect(screen.getByRole('status')).toHaveTextContent('이영희 학부모의 연결을 끊었어요.')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await waitFor(() => expect(count(DETAIL)).toBe(2))
  expect(guardianRows()).toEqual(['아버지김철수010-****-5432'])
})

test.each([
  ['끊은 뒤', () => noContent()],
  [
    '이미 끊긴 학부모(404)일 때',
    () =>
      problemResponse(404, {
        detail: '학부모를 찾을 수 없습니다.',
        code: 'MEMBER_GUARDIAN_NOT_FOUND',
      }),
  ],
])('연결 끊기: %s 학생을 다시 받지 못해도 끊은 학부모는 목록에서 뺀다', async (_case, respond) => {
  mockDetail()
  mockApi({
    [UNLINK]: () => {
      // 재시도 대기를 피하려고 재시도하지 않는 상태 코드를 쓴다.
      mockApi({ [DETAIL]: () => problemResponse(403, { detail: '권한이 없습니다.' }) })
      return respond()
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 연결 끊기', '학부모 연결을 끊을까요?')

  await press(dialog, '연결 끊기')

  await closed()
  expect(screen.getByRole('status')).toHaveTextContent('이영희 학부모의 연결을 끊었어요.')
  expect(guardianRows()).toEqual(['아버지김철수010-****-5432'])
  expect(screen.queryByText('학부모를 찾을 수 없습니다.')).not.toBeInTheDocument()
  await waitFor(() => expect(count(DETAIL)).toBe(2))
})

test('연결 끊기: 응답을 받지 못했어도 다시 받은 학생에 그 학부모가 없으면 끊었다고 알린다', async () => {
  const server = mockDetail()
  mockApi({
    [UNLINK]: () => {
      // 서버는 끊었는데 응답이 끊겼다.
      server.student = { ...doyun, guardians: [father] }
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 연결 끊기', '학부모 연결을 끊을까요?')

  await press(dialog, '연결 끊기')

  await closed()
  expect(await screen.findByRole('status')).toHaveTextContent('이영희 학부모의 연결을 끊었어요.')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('연결 끊기: 응답을 받지 못했고 학부모가 그대로면 끊겼을 수도 있다고 알린다', async () => {
  mockDetail()
  mockApi({
    [UNLINK]: () => {
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 연결 끊기', '학부모 연결을 끊을까요?')

  await press(dialog, '연결 끊기')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '연결 상태를 확인해 주세요. 끊겼을 수도 있어요. 학부모가 그대로 보이면 다시 끊어 주세요.',
  )
  expect(count(UNLINK)).toBe(1)
  expect(within(dialog).getByRole('button', { name: '연결 끊기' })).toBeEnabled()
})

test('새 일을 시작하면 지난 안내는 지운다', async () => {
  const server = mockDetail()
  mockApi({
    [UNLINK]: () => {
      server.student = { ...doyun, guardians: [father] }
      return noContent()
    },
  })
  renderApp(PATH, { me: staff })
  await press(await open('이영희 연결 끊기', '학부모 연결을 끊을까요?'), '연결 끊기')
  await closed()
  expect(screen.getByRole('status')).toHaveTextContent('이영희 학부모의 연결을 끊었어요.')

  const dialog = await open('학부모 추가', '학부모 추가')

  expect(screen.queryByText('이영희 학부모의 연결을 끊었어요.')).not.toBeInTheDocument()
  await press(dialog, '취소')
})

// ── 요청 번호 ─────────────────────────────────────────────

const RELATION_ID = 'a'.repeat(32)
const PROFILE_ID = 'b'.repeat(32)
const line = (id: string) => `문의할 때 이 번호를 알려 주세요: ${id}`

test('추가 중 서버 오류가 나면 폼의 안내 아래에 요청 번호를 보여준다', async () => {
  mockDetail()
  mockApi({ [ADD]: () => problemResponse(500, { detail: '서버 오류', requestId: RELATION_ID }) })
  renderApp(PATH, { me: staff })
  const dialog = await open('학부모 추가', '학부모 추가')
  await fill(dialog, '이름', '박순자')
  await fill(dialog, '휴대전화', '010-2222-1111')

  await press(dialog, '추가')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(line(RELATION_ID))
})

test('수정: 관계 저장 중 서버 오류가 나면 그 요청의 번호를 보여준다', async () => {
  mockDetail()
  mockApi({
    [RELATION]: () => problemResponse(500, { detail: '서버 오류', requestId: RELATION_ID }),
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '기타')
  await fill(dialog, '이름', '이영화')

  await press(dialog, '저장')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(line(RELATION_ID))
  expect(count(PROFILE)).toBe(0)
})

test('수정: 관계는 저장되고 이름·번호에서 서버 오류가 나면 이름·번호 요청의 번호를 보여준다', async () => {
  const server = mockDetail()
  mockApi({
    [RELATION]: () => {
      server.student = { ...doyun, guardians: [{ ...mother, relation: 'OTHER' }, father] }
      return jsonResponse(server.student)
    },
    [PROFILE]: () => problemResponse(500, { detail: '서버 오류', requestId: PROFILE_ID }),
  })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 수정', '학부모 수정')
  await userEvent.selectOptions(within(dialog).getByLabelText('관계'), '기타')
  await fill(dialog, '이름', '이영화')

  await press(dialog, '저장')

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(line(PROFILE_ID))
  // 번호는 실패를 알리는 안내에만 붙는다. 관계가 저장됐다는 안내에는 붙지 않는다.
  expect(within(dialog).getByRole('status')).not.toHaveTextContent('문의할 때')
})

test('연결 끊기 중 서버 오류가 나면 창 안에서도, 창을 닫은 뒤에도 요청 번호를 보여준다', async () => {
  mockDetail()
  mockApi({ [UNLINK]: () => problemResponse(500, { detail: '서버 오류', requestId: RELATION_ID }) })
  renderApp(PATH, { me: staff })
  const dialog = await open('이영희 연결 끊기', '학부모 연결을 끊을까요?')

  await press(dialog, '연결 끊기')

  const inDialog = await within(dialog).findByRole('alert')
  expect(inDialog).toHaveTextContent('끊겼을 수도 있어요.')
  expect(inDialog).toHaveTextContent(line(RELATION_ID))

  await press(dialog, '닫기')

  await closed()
  expect(screen.getByRole('alert')).toHaveTextContent(line(RELATION_ID))
})
