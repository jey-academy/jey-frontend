import { screen, waitFor, within } from '@testing-library/react'
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
  unreadableResponse,
} from '@/test/mockApi'
import { admin, renderApp } from '@/test/renderApp'

setupMockApi()
setupDialog()

// 연계 학원 화면 아래의 JEY 발급 패스 할인율 칸
const PATH = '/admin/settings/partners'
const BENEFIT = 'GET /api/v1/dongtanpass/campus-benefit'
const CHANGE = 'PUT /api/v1/dongtanpass/campus-benefit'

function mockPage(rate = 0.05) {
  const server = { rate }
  mockApi({
    'GET /api/v1/dongtanpass/partners': () => jsonResponse([]),
    [BENEFIT]: () => jsonResponse({ discountRate: server.rate }),
  })
  return server
}

function section() {
  return screen.getByRole('region', { name: 'JEY 발급 패스 할인율' })
}

async function openDialog() {
  renderApp(PATH, { me: admin })
  await screen.findByText('5%')
  await userEvent.click(within(section()).getByRole('button', { name: '바꾸기' }))
  return screen.findByRole('dialog', { name: '할인율 바꾸기' })
}

test('지금 할인율을 퍼센트로 보여 주고, 바꿔도 발급한 패스는 그대로라고 알린다', async () => {
  mockPage()
  renderApp(PATH, { me: admin })

  expect(await screen.findByText('5%')).toBeInTheDocument()
  expect(section()).toHaveTextContent('바꿔도 이미 발급한 패스는 그대로예요.')
})

test('퍼센트로 적은 값을 비율로 보내고, 바꾼 값과 안내를 보여 준다', async () => {
  const server = mockPage()
  mockApi({
    [CHANGE]: ({ body }) => {
      server.rate = (body as { discountRate: number }).discountRate
      return jsonResponse({ discountRate: server.rate })
    },
  })
  const dialog = await openDialog()
  const input = within(dialog).getByLabelText('할인율 (%)')
  expect(input).toHaveValue('5')
  expect(dialog).toHaveTextContent('이미 발급한 패스는 그대로예요.')

  await userEvent.clear(input)
  await userEvent.type(input, '7.5')
  expect(within(dialog).getByText('7.5% 할인')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: '저장' }))

  expect(
    await screen.findByText('할인율을 7.5%로 바꿨어요. 이미 발급한 패스의 할인율은 그대로예요.'),
  ).toBeInTheDocument()
  expect(requestOf(CHANGE).body).toEqual({ discountRate: 0.075 })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(within(section()).getByText('7.5%')).toBeInTheDocument()
})

test('범위 밖이거나 숫자가 아니면 알리고 보내지 않는다', async () => {
  mockPage()
  const dialog = await openDialog()
  const input = within(dialog).getByLabelText('할인율 (%)')

  await userEvent.clear(input)
  await userEvent.type(input, '0')
  await userEvent.click(within(dialog).getByRole('button', { name: '저장' }))
  expect(within(dialog).getByText('0보다 크고 100 이하로 입력해 주세요.')).toBeInTheDocument()

  await userEvent.clear(input)
  await userEvent.type(input, '오')
  await userEvent.click(within(dialog).getByRole('button', { name: '저장' }))
  expect(within(dialog).getByText(/퍼센트 숫자로 입력해 주세요/)).toBeInTheDocument()
  expect(requests()).not.toContain(CHANGE)
})

test('서버가 거부하면 창 안에 알린다', async () => {
  mockPage()
  mockApi({
    [CHANGE]: () =>
      problemResponse(400, {
        code: 'COMMON_VALIDATION_FAILED',
        detail: '입력값을 확인해 주세요.',
        errors: [{ field: 'discountRate', message: '소수 넷째 자리까지 입력할 수 있습니다.' }],
      }),
  })
  const dialog = await openDialog()
  const input = within(dialog).getByLabelText('할인율 (%)')
  await userEvent.clear(input)
  await userEvent.type(input, '6')
  await userEvent.click(within(dialog).getByRole('button', { name: '저장' }))

  expect(
    await within(dialog).findByText('소수 넷째 자리까지 입력할 수 있습니다.'),
  ).toBeInTheDocument()
  expect(screen.getByRole('dialog', { name: '할인율 바꾸기' })).toBeInTheDocument()
})

test('응답을 받지 못하면 그대로 다시 저장하게 하고 지금 값을 다시 받는다', async () => {
  mockPage()
  mockApi({ [CHANGE]: () => unreadableResponse() })
  const dialog = await openDialog()
  const before = requests().filter((request) => request === BENEFIT).length
  await userEvent.click(within(dialog).getByRole('button', { name: '저장' }))

  expect(await within(dialog).findByText(/그대로 다시 저장해도 돼요/)).toBeInTheDocument()
  await waitFor(() =>
    expect(requests().filter((request) => request === BENEFIT).length).toBeGreaterThan(before),
  )
})

test('할인율을 받지 못하면 알리고 바꾸기를 막으며, 다시 불러올 수 있다', async () => {
  let fail = true
  mockApi({
    'GET /api/v1/dongtanpass/partners': () => jsonResponse([]),
    [BENEFIT]: () => (fail ? unreadableResponse() : jsonResponse({ discountRate: 0.05 })),
  })
  renderApp(PATH, { me: admin })

  const retry = await screen.findByRole('button', { name: '다시 불러오기' })
  expect(within(section()).getByRole('button', { name: '바꾸기' })).toBeDisabled()

  fail = false
  await userEvent.click(retry)
  expect(await screen.findByText('5%')).toBeInTheDocument()
  expect(within(section()).getByRole('button', { name: '바꾸기' })).toBeEnabled()
})
