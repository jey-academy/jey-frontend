import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Button } from './Button'
import { Modal } from './Modal'

// jsdom에는 showModal과 close가 없어서 여닫는 동작만 흉내 낸다.
// 포커스 가두기, 뒤 화면 비활성, Esc 키 처리는 브라우저에서 직접 확인한다.
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
})
const close = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute('open')
  this.dispatchEvent(new Event('close'))
})

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = showModal
  HTMLDialogElement.prototype.close = close
})

afterEach(() => {
  showModal.mockClear()
  close.mockClear()
})

function getDialog() {
  return screen.getByRole<HTMLDialogElement>('dialog', { hidden: true })
}

test('open이면 모달로 열고 제목과 설명을 창의 이름과 설명으로 연결한다', () => {
  render(
    <Modal open onClose={() => {}} title="QR 찍기" description="QR을 네모 안에 맞춰 주세요.">
      <Button>닫기</Button>
    </Modal>,
  )

  expect(showModal).toHaveBeenCalledOnce()
  const dialog = screen.getByRole('dialog', { name: 'QR 찍기' })
  expect(dialog).toHaveAttribute('open')
  expect(dialog).toHaveAccessibleDescription('QR을 네모 안에 맞춰 주세요.')
  expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument()
})

test('설명이 없으면 설명을 연결하지 않는다', () => {
  render(<Modal open onClose={() => {}} title="QR 찍기" />)

  expect(getDialog()).not.toHaveAttribute('aria-describedby')
})

test('닫혀 있으면 열지 않고 내용도 그리지 않는다', () => {
  render(
    <Modal open={false} onClose={() => {}} title="QR 찍기">
      <Button>닫기</Button>
    </Modal>,
  )

  expect(showModal).not.toHaveBeenCalled()
  expect(getDialog()).not.toHaveAttribute('open')
  expect(screen.queryByText('QR 찍기')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '닫기', hidden: true })).not.toBeInTheDocument()
})

test('Esc로 닫으려 하면 바로 닫지 않고 onClose로 알린다', () => {
  const onClose = vi.fn()
  render(<Modal open onClose={onClose} title="QR 찍기" />)

  // 브라우저는 Esc를 누르면 dialog에 cancel 이벤트를 보낸다.
  const notPrevented = fireEvent(getDialog(), new Event('cancel', { cancelable: true }))

  expect(onClose).toHaveBeenCalledOnce()
  expect(notPrevented).toBe(false)
  expect(getDialog()).toHaveAttribute('open')
})

test('배경을 누르면 onClose로 알린다', async () => {
  const onClose = vi.fn()
  render(<Modal open onClose={onClose} title="QR 찍기" />)

  await userEvent.click(getDialog())

  expect(onClose).toHaveBeenCalledOnce()
})

test('창 안쪽을 누르면 닫지 않는다', async () => {
  const onClose = vi.fn()
  render(
    <Modal open onClose={onClose} title="QR 찍기" description="QR을 네모 안에 맞춰 주세요.">
      <Button>링크 복사</Button>
    </Modal>,
  )

  await userEvent.click(screen.getByText('QR을 네모 안에 맞춰 주세요.'))
  await userEvent.click(screen.getByRole('button', { name: '링크 복사' }))

  expect(onClose).not.toHaveBeenCalled()
})

test('창 안에서 누른 채 배경으로 끌어 놓으면 닫지 않는다', () => {
  const onClose = vi.fn()
  render(<Modal open onClose={onClose} title="QR 찍기" />)

  fireEvent.mouseDown(screen.getByText('QR 찍기'))
  // 누른 곳과 놓은 곳이 다르면 브라우저는 둘의 공통 조상(dialog)에 click을 보낸다.
  fireEvent.click(getDialog())

  expect(onClose).not.toHaveBeenCalled()
})

test('closeOnBackdrop을 끄면 배경을 눌러도 닫지 않는다', async () => {
  const onClose = vi.fn()
  render(<Modal open onClose={onClose} title="QR 찍기" closeOnBackdrop={false} />)

  await userEvent.click(getDialog())

  expect(onClose).not.toHaveBeenCalled()
})

test('open이 false로 바뀌면 닫고, 그때는 onClose를 다시 부르지 않는다', () => {
  const onClose = vi.fn()
  const { rerender } = render(<Modal open onClose={onClose} title="QR 찍기" />)

  rerender(<Modal open={false} onClose={onClose} title="QR 찍기" />)

  expect(close).toHaveBeenCalledOnce()
  expect(getDialog()).not.toHaveAttribute('open')
  expect(onClose).not.toHaveBeenCalled()
})

test('브라우저가 스스로 닫으면 onClose로 알려 바깥 상태를 맞춘다', () => {
  const onClose = vi.fn()
  render(<Modal open onClose={onClose} title="QR 찍기" />)

  getDialog().close()

  expect(onClose).toHaveBeenCalledOnce()
})

test('버튼으로 열고 닫기 버튼으로 닫는 흐름이 동작한다', async () => {
  function Example() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>QR 보기</Button>
        <Modal open={open} onClose={() => setOpen(false)} title="김도윤 학생 패스">
          <Button onClick={() => setOpen(false)}>닫기</Button>
        </Modal>
      </>
    )
  }
  render(<Example />)

  await userEvent.click(screen.getByRole('button', { name: 'QR 보기' }))
  expect(screen.getByRole('dialog', { name: '김도윤 학생 패스' })).toHaveAttribute('open')

  await userEvent.click(screen.getByRole('button', { name: '닫기' }))
  expect(getDialog()).not.toHaveAttribute('open')
  expect(screen.queryByText('김도윤 학생 패스')).not.toBeInTheDocument()
})

test('이미 열려 있으면 다시 열지 않는다', () => {
  const { rerender } = render(<Modal open onClose={() => {}} title="QR 찍기" />)

  rerender(<Modal open onClose={() => {}} title="QR 크게 보기" />)

  expect(showModal).toHaveBeenCalledOnce()
})

test('className을 덧붙일 수 있다', () => {
  render(<Modal open onClose={() => {}} title="QR 찍기" className="max-w-[520px]" />)

  expect(getDialog()).toHaveClass('max-w-[520px]', 'rounded-pass')
})
