import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { canUseCamera } from '@/shared/lib/camera'
import { createQrDetector, type QrDetector } from '@/shared/lib/qrDecoder'
import { fakeStream, setupCamera } from '@/test/camera'
import { setupDialog } from '@/test/dialog'
import { QrScanner } from './QrScanner'

vi.mock('@/shared/lib/qrDecoder', () => ({ createQrDetector: vi.fn() }))

setupDialog()
const camera = setupCamera()

/** 읽을 때마다 차례로 값을 돌려주는 가짜 판독기. 다 쓰면 계속 null(QR 없음). */
function detectorReading(...values: (string | null | Error)[]): QrDetector {
  const queue = [...values]
  return {
    detect: vi.fn(async () => {
      const next = queue.shift() ?? null
      if (next instanceof Error) throw next
      return next
    }),
  }
}

function Harness({ onScan = () => {} }: { onScan?: (text: string) => void }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        열기
      </button>
      <QrScanner
        open={open}
        onClose={() => setOpen(false)}
        onScan={(text) => {
          setOpen(false)
          onScan(text)
        }}
      />
    </>
  )
}

test('canUseCamera: 카메라 기능이 있는 브라우저에서만 참이다', () => {
  expect(canUseCamera()).toBe(true)
  Reflect.deleteProperty(navigator, 'mediaDevices')
  expect(canUseCamera()).toBe(false)
})

test('열면 후면 카메라를 켜고, QR을 읽으면 카메라를 끄고 읽은 글자를 넘긴다', async () => {
  const { stream, track } = fakeStream()
  camera.getUserMedia.mockResolvedValue(stream)
  vi.mocked(createQrDetector).mockResolvedValue(detectorReading(null, null, 'QR-글자'))
  const onScan = vi.fn()
  render(<Harness onScan={onScan} />)

  expect(screen.getByRole('dialog', { name: 'QR 찍기' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('카메라를 켜고 있어요.')
  expect(camera.getUserMedia).toHaveBeenCalledWith({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  })

  await waitFor(() => expect(onScan).toHaveBeenCalledWith('QR-글자'))
  expect(onScan).toHaveBeenCalledOnce()
  expect(track.stop).toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('한 장을 읽다 실패해도 다음 장을 계속 읽는다', async () => {
  camera.getUserMedia.mockResolvedValue(fakeStream().stream)
  vi.mocked(createQrDetector).mockResolvedValue(detectorReading(new Error('흔들림'), 'QR-글자'))
  const onScan = vi.fn()
  render(<Harness onScan={onScan} />)

  await waitFor(() => expect(onScan).toHaveBeenCalledWith('QR-글자'))
})

test('닫기를 누르면 창을 닫고 카메라를 끈다', async () => {
  const user = userEvent.setup()
  const { stream, track } = fakeStream()
  camera.getUserMedia.mockResolvedValue(stream)
  vi.mocked(createQrDetector).mockResolvedValue(detectorReading())
  render(<Harness />)
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  expect(track.stop).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: '닫기' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(track.stop).toHaveBeenCalled()
})

test('카메라가 늦게 켜져도 그 사이 창을 닫았으면 켜진 카메라를 바로 끈다', async () => {
  const user = userEvent.setup()
  const { stream, track } = fakeStream()
  let grant: (stream: MediaStream) => void = () => {}
  camera.getUserMedia.mockImplementation(() => new Promise((resolve) => (grant = resolve)))
  render(<Harness />)

  await user.click(screen.getByRole('button', { name: '닫기' }))
  grant(stream)

  await waitFor(() => expect(track.stop).toHaveBeenCalled())
  expect(createQrDetector).not.toHaveBeenCalled()
})

test.each([
  [
    'NotAllowedError',
    '카메라를 쓸 수 없어요. 브라우저 설정에서 카메라를 허용하거나, 창을 닫고 패스 번호로 확인해 주세요.',
  ],
  ['SecurityError', '카메라를 쓸 수 없어요.'],
  ['NotFoundError', '이 기기에서 카메라를 찾지 못했어요. 창을 닫고 패스 번호로 확인해 주세요.'],
  ['OverconstrainedError', '이 기기에서 카메라를 찾지 못했어요.'],
  [
    'NotReadableError',
    '카메라를 켜지 못했어요. 창을 닫았다가 다시 해 보거나, 패스 번호로 확인해 주세요.',
  ],
])('카메라를 켜지 못하면(%s) 패스 번호로 확인하라고 안내한다', async (name, message) => {
  camera.getUserMedia.mockRejectedValue(new DOMException('카메라', name))
  render(<Harness />)

  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('판독기를 받지 못하면 켠 카메라를 끄고 안내한다', async () => {
  const { stream, track } = fakeStream()
  camera.getUserMedia.mockResolvedValue(stream)
  vi.mocked(createQrDetector).mockRejectedValue(new TypeError('Failed to fetch'))
  render(<Harness />)

  expect(await screen.findByRole('alert')).toHaveTextContent('카메라를 켜지 못했어요.')
  expect(track.stop).toHaveBeenCalled()
})
