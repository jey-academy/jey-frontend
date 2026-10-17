import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { createQrDetector } from '@/shared/lib/qrDecoder'
import { fakeStream, setupCamera } from '@/test/camera'
import { setupDialog } from '@/test/dialog'
import {
  jsonResponse,
  mockApi,
  problemResponse,
  requestOf,
  requests,
  setupMockApi,
} from '@/test/mockApi'
import { renderApp, staff } from '@/test/renderApp'
import { mockLookups, pass, VERIFY } from './deskTestData'

// 카메라가 있는 기기에서의 데스크 화면. 카메라가 없는 경우(버튼 숨김)는 DeskPassPage.test.tsx가 본다.
vi.mock('@/shared/lib/qrDecoder', () => ({ createQrDetector: vi.fn() }))

setupMockApi()
setupDialog()
const camera = setupCamera()

const QR =
  '1.AAAAAAAAAAcAAAAAatNJoTcfNKxr3sIz9P612HOaGDM.Gywo-FdT56dQgng3rLPEmp2HxnE8hawu6zn3463GHMw'

async function scanWithCamera(text: string) {
  const user = userEvent.setup()
  camera.getUserMedia.mockResolvedValue(fakeStream().stream)
  vi.mocked(createQrDetector).mockResolvedValue({ detect: vi.fn(async () => text) })
  mockLookups()
  renderApp('/desk/dongtanpass', { me: staff })
  await user.click(await screen.findByRole('button', { name: 'QR 찍기' }))
  return user
}

test('QR 찍기로 읽은 글자를 바로 QR로 확인하고, 창을 닫고 칸에 포커스를 돌린다', async () => {
  mockApi({ [VERIFY]: () => jsonResponse(pass) })
  await scanWithCamera(` ${QR} `)

  expect(await screen.findByRole('region', { name: '패스 확인 결과' })).toHaveTextContent(
    '사용할 수 있는 패스예요',
  )
  expect(requestOf(VERIFY).body).toEqual({ qrToken: QR })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  const input = screen.getByRole('textbox', { name: '패스 번호' })
  await waitFor(() => expect(input).toHaveFocus())
  expect(input).toHaveValue('')
})

test('카메라로 읽은 QR이 이미 쓴 것이면 새 QR을 받으라고 안내한다', async () => {
  mockApi({ [VERIFY]: () => problemResponse(400, { code: 'DONGTANPASS_QR_INVALID' }) })
  await scanWithCamera(QR)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'QR을 확인하지 못했어요. 학부모 화면에서 QR을 새로 받아 다시 찍어 주세요.',
  )
})

test('패스 번호를 치다가 QR을 찍으면, 친 글자에 잇지 않고 QR만 확인한다', async () => {
  mockApi({ [VERIFY]: () => jsonResponse(pass) })
  const user = userEvent.setup()
  camera.getUserMedia.mockResolvedValue(fakeStream().stream)
  vi.mocked(createQrDetector).mockResolvedValue({ detect: vi.fn(async () => QR) })
  mockLookups()
  renderApp('/desk/dongtanpass', { me: staff })
  const input = await screen.findByRole('textbox', { name: '패스 번호' })
  await user.type(input, 'DT-AB')

  await user.click(screen.getByRole('button', { name: 'QR 찍기' }))

  await screen.findByRole('region', { name: '패스 확인 결과' })
  expect(requestOf(VERIFY).body).toEqual({ qrToken: QR })
  expect(input).toHaveValue('')
})

test('한 학생을 찍고 나서 다시 QR 찍기로 다음 학생을 찍을 수 있다', async () => {
  mockApi({ [VERIFY]: () => jsonResponse(pass) })
  const user = await scanWithCamera(QR)
  await screen.findByRole('region', { name: '패스 확인 결과' })

  await user.click(screen.getByRole('button', { name: 'QR 찍기' }))

  await waitFor(() => expect(requests().filter((key) => key === VERIFY)).toHaveLength(2))
  expect(camera.getUserMedia).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('QR 찍기 창을 그냥 닫으면 확인하지 않고, 스캐너로 바로 찍을 수 있게 칸에 포커스를 돌린다', async () => {
  const user = userEvent.setup()
  camera.getUserMedia.mockResolvedValue(fakeStream().stream)
  vi.mocked(createQrDetector).mockResolvedValue({ detect: vi.fn(async () => null) })
  mockLookups()
  renderApp('/desk/dongtanpass', { me: staff })
  await user.click(await screen.findByRole('button', { name: 'QR 찍기' }))
  // 카메라가 켜져 화면을 읽기 시작할 때까지 기다린다.
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())

  await user.click(screen.getByRole('button', { name: '닫기' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '패스 번호' })).toHaveFocus()
  await new Promise((resolve) => setTimeout(resolve, 400))
  expect(() => requestOf(VERIFY)).toThrow()
})
