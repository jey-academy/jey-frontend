import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { createQrDetector } from '@/shared/lib/qrDecoder'
import { fakeStream, setupCamera } from '@/test/camera'
import { setupDialog } from '@/test/dialog'
import { jsonResponse, mockApi, problemResponse, requestOf, setupMockApi } from '@/test/mockApi'
import { renderApp, staff } from '@/test/renderApp'
import type { VerifiedPass } from '../api'

// 카메라가 있는 기기에서의 데스크 화면. 카메라가 없는 경우(버튼 숨김)는 DeskPassPage.test.tsx가 본다.
vi.mock('@/shared/lib/qrDecoder', () => ({ createQrDetector: vi.fn() }))

setupMockApi()
setupDialog()
const camera = setupCamera()

const VERIFY = 'POST /api/v1/dongtanpass/passes/verify'
const QR =
  '1.AAAAAAAAAAcAAAAAatNJoTcfNKxr3sIz9P612HOaGDM.Gywo-FdT56dQgng3rLPEmp2HxnE8hawu6zn3463GHMw'

const pass: VerifiedPass = {
  passId: 42,
  passNo: 'DT-ABC234',
  partnerName: '햇살수학',
  studentName: '김*윤',
  issuedOn: '2026-10-16',
  expiresOn: '2026-11-16',
  discountRate: 0.05,
}

async function scanWithCamera(text: string) {
  const user = userEvent.setup()
  camera.getUserMedia.mockResolvedValue(fakeStream().stream)
  vi.mocked(createQrDetector).mockResolvedValue({ detect: vi.fn(async () => text) })
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

test('QR 찍기 창을 닫으면 확인하지 않는다', async () => {
  const user = userEvent.setup()
  renderApp('/desk/dongtanpass', { me: staff })
  await user.click(await screen.findByRole('button', { name: 'QR 찍기' }))
  expect(screen.getByRole('dialog', { name: 'QR 찍기' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '닫기' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(() => requestOf(VERIFY)).toThrow()
})
