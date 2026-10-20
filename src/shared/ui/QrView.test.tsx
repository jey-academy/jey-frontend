import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { QrCode } from './QrCode'
import { QrView } from './QrView'

const passNumber = 'DT-7KQ4MX'

test('불러오는 중에는 QR 자리만 두고 번호는 보인다', () => {
  render(<QrView state="loading" passNumber={passNumber} />)

  expect(screen.queryByRole('img', { name: '패스 QR' })).not.toBeInTheDocument()
  expect(screen.getByText('QR을 불러오고 있어요')).toBeInTheDocument()
  expect(screen.queryByText('화면 밝기를 올리면 더 잘 찍혀요')).not.toBeInTheDocument()
  expect(screen.queryByText(/패스 번호로도 확인할 수 있어요/)).not.toBeInTheDocument()
  expect(screen.getByText(passNumber)).toBeVisible()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('불러오는 중에 값이 있어도 QR을 그리지 않는다', () => {
  render(<QrView state="loading" value="token-1" passNumber={passNumber} />)

  expect(screen.queryByRole('img', { name: '패스 QR' })).not.toBeInTheDocument()
})

test('보이는 상태에서는 QR을 선명하게 그리고 안내를 보여준다', () => {
  render(<QrView state="shown" value="token-1" passNumber={passNumber} />)

  expect(screen.getByRole('img', { name: '패스 QR' })).not.toHaveClass('opacity-30')
  expect(screen.getByText('데스크에 이 QR을 보여 주세요')).toBeInTheDocument()
  expect(screen.getByText('화면 밝기를 올리면 더 잘 찍혀요')).toBeInTheDocument()
  expect(screen.getByText(passNumber)).toBeVisible()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('보여 줄 곳을 주면 안내에 그곳을 쓴다', () => {
  render(<QrView state="shown" value="token-1" passNumber={passNumber} place="연계 학원" />)

  expect(screen.getByText('연계 학원에 이 QR을 보여 주세요')).toBeInTheDocument()
})

test('받지 못하면 마지막 QR을 흐리게 두고 다시 불러오기를 보여준다', async () => {
  const onRetry = vi.fn()
  render(<QrView state="failed" value="token-1" passNumber={passNumber} onRetry={onRetry} />)

  expect(screen.getByRole('img', { name: '패스 QR' })).toHaveClass('opacity-30')
  expect(screen.getByText('QR을 새로 받지 못했어요')).toBeInTheDocument()
  expect(
    screen.getByText('인터넷 연결을 확인해 주세요. 패스 번호로도 확인할 수 있어요'),
  ).toBeInTheDocument()
  expect(screen.getByText(passNumber)).toBeVisible()

  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
  expect(onRetry).toHaveBeenCalledOnce()
})

test('받지 못함 상태는 누르면 할 일(onRetry)이 꼭 있어야 한다', () => {
  // 타입 검사(npm run build)에서 확인한다. onRetry를 필수에서 빼면 아래 줄의 @ts-expect-error가 오류가 된다.
  // @ts-expect-error onRetry가 없다
  const withoutRetry = <QrView state="failed" passNumber={passNumber} />

  expect(withoutRetry).toBeTruthy()
})

test('한 번도 받지 못했으면 QR 없이 자리만 둔다', () => {
  render(<QrView state="failed" passNumber={passNumber} onRetry={() => {}} />)

  expect(screen.queryByRole('img', { name: '패스 QR' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeInTheDocument()
})

test('상태가 바뀌면 안내를 화면 낭독기가 읽도록 같은 영역의 내용만 바뀐다', () => {
  const { rerender } = render(<QrView state="loading" passNumber={passNumber} />)
  const live = screen.getByText('QR을 불러오고 있어요').parentElement

  expect(live).toHaveAttribute('aria-live', 'polite')
  rerender(<QrView state="shown" value="token-1" passNumber={passNumber} />)
  expect(live).toHaveTextContent('데스크에 이 QR을 보여 주세요')
  rerender(<QrView state="failed" value="token-1" passNumber={passNumber} onRetry={() => {}} />)
  expect(live).toHaveTextContent('QR을 새로 받지 못했어요')
})

test('보이는 중에 새 값을 받으면 QR을 다시 그린다', () => {
  const { rerender } = render(<QrView state="shown" value="token-1" passNumber={passNumber} />)
  const qrPath = () =>
    screen.getByRole('img', { name: '패스 QR' }).querySelector('path')?.getAttribute('d')
  const before = qrPath()

  rerender(<QrView state="shown" value="token-2" passNumber={passNumber} />)
  expect(qrPath()).not.toBe(before)
})

test('번호 칩은 화면 낭독기에 "패스 번호"로 읽힌다', () => {
  render(<QrView state="shown" value="token-1" passNumber={passNumber} />)

  expect(screen.getByText(passNumber)).toHaveTextContent(`패스 번호 ${passNumber}`)
})

test('QrCode: 값이 다르면 다른 그림을 그린다', () => {
  const { container: a } = render(<QrCode value="token-1" label="QR 1" />)
  const { container: b } = render(<QrCode value="token-2" label="QR 2" />)

  const pathA = a.querySelector('path')?.getAttribute('d')
  const pathB = b.querySelector('path')?.getAttribute('d')
  expect(pathA).toBeTruthy()
  expect(pathA).not.toBe(pathB)
})
