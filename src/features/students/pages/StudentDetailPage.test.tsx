import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { setupDialog } from '@/test/dialog'
import {
  jsonResponse,
  mockApi,
  noContent,
  problemResponse,
  requests,
  setupMockApi,
  unreadableResponse,
} from '@/test/mockApi'
import { partner, renderApp, staff } from '@/test/renderApp'
import type { Student } from '../api'
import {
  campuses,
  count,
  DETAIL,
  doyun as baseDoyun,
  mockDetail as mockDetailOf,
  mockLookups,
  PATH,
} from './studentDetailFixtures'

setupMockApi()
setupDialog()

// 반·학교·본인 번호·형제가 모두 있다. 전화번호는 서버가 가운데를 가려서 준다.
const doyun: Student = {
  ...baseDoyun,
  classId: 10,
  school: '동탄중',
  phone: '010-****-0000',
  siblings: [
    { id: 2, name: '김서연', status: 'ENROLLED' },
    { id: 3, name: '김민준', status: 'WITHDRAWN' },
  ],
}

function mockDetail(student: Student = doyun) {
  mockDetailOf(student)
}

afterEach(() => {
  vi.restoreAllMocks()
})

const LIST = '/desk/students'
const REMOVE_PHONE = 'DELETE /api/v1/students/1/phone'

// 반·학교·학부모·형제가 없고 본인 번호만 있다.
const alone: Student = {
  ...doyun,
  classId: null,
  school: null,
  guardians: [],
  primaryContact: { name: '김도윤', relation: null, phone: '010-****-0000' },
  siblings: [],
}

/** 이름표 옆의 값(dt 다음의 dd). */
function valueOf(label: string) {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement
}

function section(title: string) {
  return screen.getByRole('heading', { level: 2, name: title }).parentElement as HTMLElement
}

// ── 보기 ─────────────────────────────────────────────────

test('학생의 기본 정보, 대표 연락처, 학부모, 형제를 보여준다', async () => {
  mockDetail()
  renderApp(PATH, { me: staff })

  const heading = await screen.findByRole('heading', { level: 1, name: '김도윤' })
  // 이름 옆의 상태. 형제의 상태와 구분해서 본다.
  expect(within(heading.parentElement!).getByText('재원')).toBeInTheDocument()
  expect(valueOf('학년')).toHaveTextContent('중1')
  expect(valueOf('학교')).toHaveTextContent('동탄중')
  expect(valueOf('등록일')).toHaveTextContent('2026.09.01')
  expect(valueOf('본인 번호')).toHaveTextContent('010-****-0000')
  // 지점과 반의 이름은 따로 받아 붙인다.
  await waitFor(() => expect(valueOf('지점')).toHaveTextContent('동탄관'))
  expect(valueOf('반')).toHaveTextContent('중1 정규')

  expect(section('대표 연락처')).toHaveTextContent('어머니이영희010-****-5678')
  const guardians = within(section('학부모')).getAllByRole('listitem')
  // 줄마다 관계, 이름, 가린 번호가 있다(뒤에 줄의 버튼이 이어진다).
  expect(guardians.map((item) => item.textContent)).toEqual([
    expect.stringMatching(/^어머니이영희010-\*{4}-5678/),
    expect.stringMatching(/^아버지김철수010-\*{4}-5432/),
  ])
  // 퇴원한 형제도 보여주고 상태로 구분한다.
  const siblings = within(section('형제')).getAllByRole('listitem')
  expect(siblings.map((item) => item.textContent)).toEqual(['김서연재원', '김민준퇴원'])
  // 학생 탭이 선택된 채로 남는다.
  expect(screen.getByRole('link', { name: '학생' })).toHaveAttribute('aria-current', 'page')
})

test('없는 값은 "-"로 보여주고, 본인 번호가 대표 연락처면 본인이라고 적는다', async () => {
  mockDetail(alone)
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  expect(valueOf('학교')).toHaveTextContent('-')
  expect(valueOf('반')).toHaveTextContent('-')
  expect(section('대표 연락처')).toHaveTextContent('본인김도윤010-****-0000')
  expect(section('학부모')).toHaveTextContent('연결된 학부모가 없어요.')
  expect(screen.queryByRole('heading', { level: 2, name: '형제' })).not.toBeInTheDocument()
})

test('대표 연락처가 없는 학생도 보여주고, 연락처를 넣는 방법을 알린다', async () => {
  // 학부모도 본인 번호도 없는 학생. 서버는 대표 연락처를 null로 준다.
  mockDetail({ ...alone, phone: null, primaryContact: null })
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  expect(section('대표 연락처')).toHaveTextContent('연락처 없음')
  expect(section('대표 연락처')).toHaveTextContent(
    '학부모를 추가하거나, 정보 수정에서 학생 본인 번호를 넣어 주세요.',
  )
  // 대표 연락처를 정하는 규칙은 연락처가 있을 때의 설명이다.
  expect(section('대표 연락처')).not.toHaveTextContent('순으로 정해져요')
  // 나머지 화면은 그대로 쓸 수 있다. 이 화면에서 고친다.
  expect(valueOf('학년')).toHaveTextContent('중1')
  expect(screen.getByRole('button', { name: '학부모 추가' })).toBeEnabled()
  expect(screen.getByRole('link', { name: '정보 수정' })).toHaveAttribute('href', `${PATH}/edit`)
})

test('본인 번호가 없으면 번호 지우기를 보여주지 않는다', async () => {
  mockDetail({ ...doyun, phone: null })
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  expect(valueOf('본인 번호')).toHaveTextContent('-')
  expect(screen.queryByRole('button', { name: '번호 지우기' })).not.toBeInTheDocument()
})

test('운영하지 않는 반에 속해 있으면 목록에 없는 반이라고 보여준다', async () => {
  mockDetail({ ...doyun, classId: 99 })
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  await waitFor(() => expect(valueOf('반')).toHaveTextContent('목록에 없는 반'))
})

test('퇴원한 학생은 퇴원이라고 보여준다', async () => {
  mockDetail({ ...doyun, status: 'WITHDRAWN', siblings: [] })
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  expect(screen.getByText('퇴원')).toBeInTheDocument()
})

// ── 이동 ─────────────────────────────────────────────────

test('목록에서 이름을 누르면 그 학생의 상세로 간다', async () => {
  mockDetail()
  mockApi({
    'POST /api/v1/students/search': () =>
      jsonResponse({
        items: [
          {
            id: 1,
            campusId: 1,
            classId: 10,
            name: '김도윤',
            grade: 'MIDDLE_1',
            school: '동탄중',
            status: 'ENROLLED',
            primaryContact: doyun.primaryContact,
          },
        ],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      }),
  })
  const { router } = renderApp(LIST, { me: staff })

  await userEvent.click(await screen.findByRole('link', { name: '김도윤' }))

  expect(await screen.findByRole('heading', { level: 1, name: '김도윤' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe(PATH)
})

test('형제를 누르면 그 학생의 상세로 간다', async () => {
  mockDetail()
  mockApi({
    'GET /api/v1/students/2': () =>
      jsonResponse({
        ...alone,
        id: 2,
        name: '김서연',
        siblings: [{ id: 1, name: '김도윤', status: 'ENROLLED' }],
      }),
  })
  const { router } = renderApp(PATH, { me: staff })

  await userEvent.click(await screen.findByRole('link', { name: '김서연' }))

  expect(await screen.findByRole('heading', { level: 1, name: '김서연' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/desk/students/2')
  expect(screen.getByRole('link', { name: '김도윤' })).toBeInTheDocument()
})

test('정보 수정과 학생 목록으로 가는 길이 있다', async () => {
  mockDetail()
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  expect(screen.getByRole('link', { name: '정보 수정' })).toHaveAttribute('href', `${PATH}/edit`)
  expect(screen.getByRole('link', { name: '학생 목록' })).toHaveAttribute('href', LIST)
})

// ── 받지 못할 때 ─────────────────────────────────────────

test('없는 학생이면 알리고 목록으로 가는 길을 준다', async () => {
  mockLookups()
  mockApi({
    [DETAIL]: () =>
      problemResponse(404, { detail: '없는 학생입니다.', code: 'MEMBER_STUDENT_NOT_FOUND' }),
  })
  renderApp(PATH, { me: staff })

  expect(await screen.findByRole('heading', { level: 1, name: '없는 학생이에요' })).toBeVisible()
  expect(screen.getByRole('link', { name: '학생 목록으로' })).toHaveAttribute('href', LIST)
  // 없는 학생은 다시 물어도 없다.
  expect(count(DETAIL)).toBe(1)
})

test.each(['abc', '0', '1e3', '-1', '1.5'])(
  '주소의 id가 1 이상의 정수가 아니면(%s) 서버에 묻지 않고 없는 학생으로 알린다',
  async (id) => {
    renderApp(`${LIST}/${id}`, { me: staff })

    expect(await screen.findByRole('heading', { level: 1, name: '없는 학생이에요' })).toBeVisible()
    expect(requests().filter((request) => request.includes('/students/'))).toEqual([])
  },
)

test('학생을 받지 못하면 알리고, 다시 불러오면 보여준다', async () => {
  mockLookups()
  // 다시 시도하지 않는 오류로 답한다.
  mockApi({ [DETAIL]: () => problemResponse(403, { detail: '권한이 없습니다.' }) })
  renderApp(PATH, { me: staff })

  expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다.')

  mockApi({ [DETAIL]: () => jsonResponse(doyun) })
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))

  expect(await screen.findByRole('heading', { level: 1, name: '김도윤' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('연계 학원은 이 화면을 볼 수 없다', async () => {
  renderApp(PATH, { me: partner })

  expect(
    await screen.findByRole('heading', { name: '이 화면을 볼 권한이 없어요' }),
  ).toBeInTheDocument()
  expect(requests()).toEqual([])
})

// ── 본인 번호 지우기 ─────────────────────────────────────

test('번호 지우기는 한 번 묻고, 지우면 상세를 다시 받아 보여준다', async () => {
  let removed = false
  mockLookups()
  mockApi({
    [DETAIL]: () => jsonResponse(removed ? { ...doyun, phone: null } : doyun),
    [REMOVE_PHONE]: () => {
      removed = true
      return noContent()
    },
  })
  renderApp(PATH, { me: staff })
  await userEvent.click(await screen.findByRole('button', { name: '번호 지우기' }))

  const dialog = await screen.findByRole('dialog', { name: '본인 번호를 지울까요?' })
  // 어느 번호를 지우는지 가린 번호로 보여준다.
  expect(dialog).toHaveTextContent('010-****-0000')
  expect(count(REMOVE_PHONE)).toBe(0)
  await userEvent.click(within(dialog).getByRole('button', { name: '지우기' }))

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(valueOf('본인 번호')).toHaveTextContent('-'))
  expect(screen.getByRole('status')).toHaveTextContent('본인 번호를 지웠어요.')
  expect(screen.queryByRole('button', { name: '번호 지우기' })).not.toBeInTheDocument()
  expect(count(REMOVE_PHONE)).toBe(1)
})

test('번호 지우기: CSRF 토큰을 받지 못해 보내지 않았으면 지워졌을 수도 있다고 하지 않는다', async () => {
  mockDetail({ ...doyun, phone: '010-****-0000' })
  mockApi({ 'GET /api/v1/auth/csrf': () => problemResponse(503, { detail: '점검 중이에요.' }) })
  renderApp(PATH, { me: staff })
  await userEvent.click(await screen.findByRole('button', { name: '번호 지우기' }))
  const dialog = await screen.findByRole('dialog', { name: '본인 번호를 지울까요?' })
  // 화면을 열어 둔 사이 토큰 쿠키만 사라졌다.
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'

  await userEvent.click(within(dialog).getByRole('button', { name: '지우기' }))

  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent('점검 중이에요.')
  expect(alert).not.toHaveTextContent('지워졌을 수도')
  expect(count(REMOVE_PHONE)).toBe(0)
})

test('번호 지우기: 서버에서는 지워졌는데 화면 코드에서 문제가 나면, 지우지 못했다고 하지 않고 콘솔에 남긴다', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  // 다시 받은 학생에 번호가 그대로다(다시 받기가 늦거나 낡은 값이 온 경우).
  mockDetail()
  mockApi({ [REMOVE_PHONE]: () => noContent() })
  const { queryClient } = renderApp(PATH, { me: staff })
  await userEvent.click(await screen.findByRole('button', { name: '번호 지우기' }))
  const dialog = await screen.findByRole('dialog', { name: '본인 번호를 지울까요?' })
  // 응답을 받은 뒤 화면 코드(받아 둔 상세를 고치는 자리)에서 예외가 난다.
  const bug = new TypeError('x is not a function')
  vi.spyOn(queryClient, 'setQueryData').mockImplementation(() => {
    throw bug
  })

  await userEvent.click(within(dialog).getByRole('button', { name: '지우기' }))

  // "지우지 못했어요. 잠시 후 다시"가 아니다. 서버에서는 이미 지워졌다.
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '화면에서 문제가 생겼어요. 처리됐을 수도 있으니, 다시 누르지 말고 새로 고친 뒤 확인해 주세요.',
  )
  expect(count(REMOVE_PHONE)).toBe(1)
  // 화면에는 일반 문구뿐이다. 원인은 콘솔에서 찾는다(테스트는 개발 서버와 같이 에러를 그대로 남긴다).
  expect(consoleError).toHaveBeenCalledWith(bug)
})

test('묻는 창에서 닫기를 누르면 지우지 않는다', async () => {
  mockDetail()
  renderApp(PATH, { me: staff })
  await userEvent.click(await screen.findByRole('button', { name: '번호 지우기' }))

  const dialog = await screen.findByRole('dialog')
  await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(valueOf('본인 번호')).toHaveTextContent('010-****-0000')
  expect(count(REMOVE_PHONE)).toBe(0)
})

test('하나 남은 연락처면 지울 수 없다고 알리고 창을 그대로 둔다', async () => {
  mockDetail(alone)
  mockApi({
    [REMOVE_PHONE]: () =>
      problemResponse(409, {
        detail: '마지막 연락처는 지울 수 없습니다.',
        code: 'MEMBER_LAST_CONTACT',
      }),
  })
  renderApp(PATH, { me: staff })
  await userEvent.click(await screen.findByRole('button', { name: '번호 지우기' }))
  const dialog = await screen.findByRole('dialog')

  await userEvent.click(within(dialog).getByRole('button', { name: '지우기' }))

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '하나 남은 연락처라 지울 수 없어요. 다른 연락처를 먼저 넣어 주세요.',
  )
  expect(valueOf('본인 번호')).toHaveTextContent('010-****-0000')

  // 닫았다 다시 열면 지난 안내는 남아 있지 않다.
  await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
  await userEvent.click(screen.getByRole('button', { name: '번호 지우기' }))
  expect(within(await screen.findByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument()
})

test('지우기 응답을 받지 못하면 지워졌을 수 있다고 알리고 상세를 다시 받는다', async () => {
  mockDetail()
  mockApi({
    [REMOVE_PHONE]: () => {
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: staff })
  await userEvent.click(await screen.findByRole('button', { name: '번호 지우기' }))
  const dialog = await screen.findByRole('dialog')

  await userEvent.click(within(dialog).getByRole('button', { name: '지우기' }))

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('지워졌을 수도 있어요.')
  // 알아서 다시 보내지 않고, 지금 상태를 다시 받아 온다.
  expect(count(REMOVE_PHONE)).toBe(1)
  await waitFor(() => expect(count(DETAIL)).toBe(2))
})

test('지우는 중에 두 번 눌러도 한 번만 보내고, 창을 닫아도 결과를 화면에서 알린다', async () => {
  let respond!: (response: Response) => void
  mockDetail()
  mockApi({ [REMOVE_PHONE]: () => new Promise<Response>((resolve) => (respond = resolve)) })
  renderApp(PATH, { me: staff })
  await userEvent.click(await screen.findByRole('button', { name: '번호 지우기' }))
  const dialog = await screen.findByRole('dialog')

  await userEvent.dblClick(within(dialog).getByRole('button', { name: '지우기' }))
  expect(within(dialog).getByRole('button', { name: '지우는 중' })).toBeDisabled()
  expect(count(REMOVE_PHONE)).toBe(1)
  // 지우는 중에도 닫아 달라면 닫는다. 결과는 화면의 안내로 남는다.
  await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '지우는 중' })).toBeDisabled()

  respond(
    problemResponse(409, {
      detail: '마지막 연락처는 지울 수 없습니다.',
      code: 'MEMBER_LAST_CONTACT',
    }),
  )

  expect(await screen.findByRole('alert')).toHaveTextContent('하나 남은 연락처라 지울 수 없어요.')
  expect(screen.getByRole('button', { name: '번호 지우기' })).toBeEnabled()
})

test('지웠는데 상세를 다시 받지 못해도 지운 번호를 보여주지 않는다', async () => {
  let removed = false
  mockLookups()
  mockApi({
    // 지운 뒤에는 다시 시도하지 않는 오류로 답한다.
    [DETAIL]: () => (removed ? problemResponse(403, {}) : jsonResponse(doyun)),
    [REMOVE_PHONE]: () => {
      removed = true
      return noContent()
    },
  })
  renderApp(PATH, { me: staff })
  await userEvent.click(await screen.findByRole('button', { name: '번호 지우기' }))
  await userEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: '지우기' }),
  )

  expect(await screen.findByText('본인 번호를 지웠어요.')).toBeInTheDocument()
  expect(valueOf('본인 번호')).toHaveTextContent('-')
  expect(document.body).not.toHaveTextContent('010-****-0000')
})

test('지우기 응답은 못 받았지만 다시 받아 보니 지워졌으면 지웠다고 알린다', async () => {
  let removed = false
  mockLookups()
  mockApi({
    [DETAIL]: () => jsonResponse(removed ? { ...doyun, phone: null } : doyun),
    [REMOVE_PHONE]: () => {
      // 서버는 지웠는데 응답이 끊겼다.
      removed = true
      throw new TypeError('Failed to fetch')
    },
  })
  renderApp(PATH, { me: staff })
  await userEvent.click(await screen.findByRole('button', { name: '번호 지우기' }))
  await userEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: '지우기' }),
  )

  expect(await screen.findByText('본인 번호를 지웠어요.')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(valueOf('본인 번호')).toHaveTextContent('-')
})

// ── 코드 리뷰에서 나온 경우 ──────────────────────────────

test('창을 연 채 다른 학생으로 넘어가면 창이 따라가지 않는다', async () => {
  mockDetail()
  mockApi({
    'GET /api/v1/students/2': () => jsonResponse({ ...doyun, id: 2, name: '김서연', siblings: [] }),
  })
  // 김서연의 상세를 먼저 봐서 받아 둔다. 받아 둔 학생으로는 불러오는 중 없이 바로 넘어간다(뒤로 가기).
  const { router } = renderApp('/desk/students/2', { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김서연' })
  await router.navigate(PATH)
  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  await userEvent.click(screen.getByRole('button', { name: '번호 지우기' }))
  await screen.findByRole('dialog')

  await router.navigate('/desk/students/2')

  // 따라가면 김도윤의 번호를 지우려던 창이 김서연의 번호를 지우는 창이 된다.
  await screen.findByRole('heading', { level: 1, name: '김서연' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('등록 결과 안내는 그 학생의 상세에서만 뜨고, 다른 학생의 상세가 지우지 않는다', async () => {
  mockDetail()
  mockApi({
    'GET /api/v1/students/2': () => jsonResponse({ ...doyun, id: 2, name: '김서연', siblings: [] }),
  })
  const { router, queryClient } = renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  // 김도윤의 상세를 보는 동안 김서연의 등록이 끝났다.
  queryClient.setQueryData(['students', 'registered-notice'], {
    studentId: 2,
    name: '김서연',
    linkedGuardians: [{ id: 7, relation: 'MOTHER', name: '이영희', phone: '010-****-5678' }],
  })
  expect(screen.queryByText(/학생을 등록했어요/)).not.toBeInTheDocument()

  // 지워지지 않고 남아 있다가 김서연의 상세에서 뜬다.
  await router.navigate('/desk/students/2')
  expect(await screen.findByText('김서연 학생을 등록했어요.')).toBeInTheDocument()
  expect(screen.getByText(/이미 등록된 학부모\(이영희, 010-\*\*\*\*-5678\)/)).toBeInTheDocument()

  // 다른 학생으로 넘어가면 따라가지 않는다.
  await router.navigate(PATH)
  await screen.findByRole('heading', { level: 1, name: '김도윤' })
  expect(screen.queryByText(/학생을 등록했어요/)).not.toBeInTheDocument()
})

test('받아 둔 학생이 있는데 다시 받지 못하면 이전 내용일 수 있다고 알린다', async () => {
  mockDetail()
  const { queryClient } = renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  mockApi({ [DETAIL]: () => problemResponse(403, { detail: '권한이 없습니다.' }) })
  await queryClient.invalidateQueries({ queryKey: ['students'] })

  expect(await screen.findByRole('alert')).toHaveTextContent('최신 내용을 불러오지 못했어요.')
  expect(screen.getByRole('heading', { level: 1, name: '김도윤' })).toBeInTheDocument()

  // 그사이 없어진 학생이면 받아 둔 내용을 더 보여주지 않는다.
  mockApi({
    [DETAIL]: () =>
      problemResponse(404, { detail: '없는 학생입니다.', code: 'MEMBER_STUDENT_NOT_FOUND' }),
  })
  await queryClient.invalidateQueries({ queryKey: ['students'] })
  expect(await screen.findByRole('heading', { level: 1, name: '없는 학생이에요' })).toBeVisible()
})

test('주소가 틀려서 오는 404는 없는 학생이라고 하지 않는다', async () => {
  mockLookups()
  // 학생이 없다는 코드가 아니다(배포가 어긋났거나 중간 서버가 답한 경우).
  mockApi({ [DETAIL]: () => problemResponse(404, { code: 'COMMON_NOT_FOUND' }) })
  renderApp(PATH, { me: staff })

  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '없는 학생이에요' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeInTheDocument()
})

test('지점·반 이름을 받지 못하면 값이 없는 것과 구분해 알리고, 다시 불러올 수 있다', async () => {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    // 다시 시도하지 않는 오류로 답한다.
    'GET /api/v1/classes': () => problemResponse(403, {}),
    [DETAIL]: () => jsonResponse(doyun),
  })
  renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  // "-"로 보이면 반이 없는 학생으로 읽힌다.
  expect(await screen.findByRole('alert')).toHaveTextContent('지점·반 이름을 불러오지 못했어요.')
  expect(valueOf('반')).toHaveTextContent('이름을 불러오지 못했어요')
  expect(valueOf('지점')).toHaveTextContent('동탄관')

  mockLookups()
  await userEvent.click(screen.getByRole('button', { name: '지점·반 다시 불러오기' }))

  await waitFor(() => expect(valueOf('반')).toHaveTextContent('중1 정규'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('등록일을 읽을 수 없어도 화면을 내리지 않고 받은 값 그대로 보여준다', async () => {
  // 연도를 치다 만 값이 저장된 학생. 화면이 통째로 내려가면 수정 화면으로 갈 길도 없어진다.
  mockDetail({ ...doyun, registeredAt: '0026-10-12' })
  renderApp(PATH, { me: staff })

  expect(await screen.findByRole('heading', { level: 1, name: '김도윤' })).toBeInTheDocument()
  expect(valueOf('등록일')).toHaveTextContent('0026-10-12')
  expect(screen.getByRole('link', { name: '정보 수정' })).toBeInTheDocument()
})

// ── 요청 번호 ─────────────────────────────────────────────

const REQUEST_ID = '2d6a6e90a9d04a16bb607aa43840f2d7'
const REQUEST_ID_LINE = `문의할 때 이 번호를 알려 주세요: ${REQUEST_ID}`

test('번호 지우기 중 서버 오류가 나면 창 안에서도, 창을 닫은 뒤에도 요청 번호를 보여준다', async () => {
  mockDetail()
  mockApi({
    [REMOVE_PHONE]: () => problemResponse(500, { detail: '서버 오류', requestId: REQUEST_ID }),
  })
  renderApp(PATH, { me: staff })
  await userEvent.click(await screen.findByRole('button', { name: '번호 지우기' }))
  const dialog = await screen.findByRole('dialog')

  await userEvent.click(within(dialog).getByRole('button', { name: '지우기' }))

  const inDialog = await within(dialog).findByRole('alert')
  expect(inDialog).toHaveTextContent('지워졌을 수도 있어요.')
  expect(inDialog).toHaveTextContent(REQUEST_ID_LINE)

  await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }))

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByRole('alert')).toHaveTextContent(REQUEST_ID_LINE)
})

test('학생을 읽지 못하면 안내 아래에 요청 번호를 보여준다', async () => {
  mockLookups()
  mockApi({ [DETAIL]: () => unreadableResponse(REQUEST_ID) })
  renderApp(PATH, { me: staff })

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('일시적인 문제가 생겼어요.')
  expect(alert).toHaveTextContent(REQUEST_ID_LINE)
})

test('보던 학생을 다시 받지 못하면 이전 내용일 수 있다는 안내 아래에 요청 번호를 보여준다', async () => {
  let unreadable = false
  mockLookups()
  mockApi({ [DETAIL]: () => (unreadable ? unreadableResponse(REQUEST_ID) : jsonResponse(doyun)) })
  const { queryClient } = renderApp(PATH, { me: staff })
  await screen.findByRole('heading', { level: 1, name: '김도윤' })

  unreadable = true
  await queryClient.invalidateQueries({ queryKey: ['students'] })

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('최신 내용을 불러오지 못했어요. 아래는 이전 내용일 수 있어요.')
  expect(alert).toHaveTextContent(REQUEST_ID_LINE)
})

test.each([
  ['반만 읽지 못하면 반 쪽의', 'ok', '9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a49'],
  [
    '둘 다 읽지 못하면 지점 쪽의',
    '4b1d6c0e2f3a4b5c6d7e8f9012345678',
    '4b1d6c0e2f3a4b5c6d7e8f9012345678',
  ],
])('지점·반 이름을 %s 요청 번호를 보여준다', async (_case, campusId, shown) => {
  mockDetail()
  mockApi({
    'GET /api/v1/campuses': () =>
      campusId === 'ok' ? jsonResponse(campuses) : unreadableResponse(campusId),
    'GET /api/v1/classes': () => unreadableResponse('9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a49'),
  })
  renderApp(PATH, { me: staff })

  const notice = await screen.findByText('지점·반 이름을 불러오지 못했어요.')
  expect(notice.closest('[role="alert"]')).toHaveTextContent(
    `문의할 때 이 번호를 알려 주세요: ${shown}`,
  )
})
