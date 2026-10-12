import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useEffect, useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Button } from './Button'
import { Modal } from './Modal'

// jsdom에는 showModal과 close가 없어서 여닫는 동작만 흉내 낸다. (jsdom이 지원하게 되면 이 가짜는 지운다.)
// 포커스 가두기, 뒤 화면 비활성, Esc 키 처리(거듭 눌렀을 때 브라우저가 닫아 버리는 것, closedby="none"이 Esc를 막는 것 포함)는
// 브라우저에서 직접 확인한다.
function defaultShowModal(this: HTMLDialogElement) {
  // 실제 브라우저처럼 이미 열린 창을 또 열면 에러를 낸다.
  if (this.hasAttribute('open')) throw new DOMException('이미 열려 있음', 'InvalidStateError')
  this.setAttribute('open', '')
}
const showModal = vi.fn(defaultShowModal)
// 실제 브라우저의 close 이벤트는 조금 늦게 온다. 기본 가짜는 바로 보내고,
// 그 차이가 중요한 테스트에서만 늦게 보내는 가짜로 바꾼다.
const close = vi.fn(function (this: HTMLDialogElement) {
  if (!this.hasAttribute('open')) return
  this.removeAttribute('open')
  this.dispatchEvent(new Event('close'))
})

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = showModal
  HTMLDialogElement.prototype.close = close
})

afterEach(() => {
  // 테스트가 바꿔 끼운 가짜(mockImplementation)를 처음 것으로 되돌린다.
  showModal.mockReset()
  showModal.mockImplementation(defaultShowModal)
  close.mockClear()
  vi.useRealTimers()
})

function getDialog() {
  return screen.getByRole<HTMLDialogElement>('dialog', { hidden: true })
}

// ── 열기와 닫기 ──────────────────────────────────────────

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

test('open이 false로 바뀌면 닫고, 그때는 onClose를 다시 부르지 않는다', () => {
  const onClose = vi.fn()
  const { rerender } = render(<Modal open onClose={onClose} title="QR 찍기" />)

  rerender(<Modal open={false} onClose={onClose} title="QR 찍기" />)

  expect(close).toHaveBeenCalledOnce()
  expect(getDialog()).not.toHaveAttribute('open')
  expect(onClose).not.toHaveBeenCalled()
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

test('닫히면 안쪽 내용이 사라지면서 정리 함수가 실행된다', () => {
  // QR 스캔 창을 닫으면 카메라가 꺼져야 한다.
  const stopCamera = vi.fn()
  function Camera() {
    useEffect(() => stopCamera, [])
    return null
  }
  const { rerender } = render(
    <Modal open onClose={() => {}} title="QR 찍기">
      <Camera />
    </Modal>,
  )

  rerender(
    <Modal open={false} onClose={() => {}} title="QR 찍기">
      <Camera />
    </Modal>,
  )

  expect(stopCamera).toHaveBeenCalledOnce()
})

test('제목이 바뀌어도 열려 있는 창을 다시 열지 않는다', () => {
  const { rerender } = render(<Modal open onClose={() => {}} title="QR 찍기" />)

  rerender(<Modal open onClose={() => {}} title="QR 크게 보기" />)

  expect(showModal).toHaveBeenCalledOnce()
})

test('StrictMode에서 효과가 두 번 실행돼도 한 번만 연다', () => {
  const onClose = vi.fn()
  render(
    <StrictMode>
      <Modal open onClose={onClose} title="QR 찍기" />
    </StrictMode>,
  )

  expect(showModal).toHaveBeenCalledOnce()
  expect(getDialog()).toHaveAttribute('open')
  expect(onClose).not.toHaveBeenCalled()
})

// ── Esc ─────────────────────────────────────────────────

test('Esc로 닫으려 하면 바로 닫지 않고 onClose로 알린다', () => {
  const onClose = vi.fn()
  render(<Modal open onClose={onClose} title="QR 찍기" />)

  // 브라우저는 Esc를 누르면 dialog에 cancel 이벤트를 보낸다. 막지 않으면 브라우저가 바로 닫는다.
  const notPrevented = fireEvent(getDialog(), new Event('cancel', { cancelable: true }))

  expect(onClose).toHaveBeenCalledOnce()
  expect(notPrevented).toBe(false)
})

test('closeOnBackdrop을 꺼도 Esc로는 닫을 수 있다', () => {
  const onClose = vi.fn()
  render(<Modal open onClose={onClose} title="QR 찍기" closeOnBackdrop={false} />)

  fireEvent(getDialog(), new Event('cancel', { cancelable: true }))

  expect(onClose).toHaveBeenCalledOnce()
})

// ── 배경 클릭 ────────────────────────────────────────────

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

test('배경을 누른 적이 있어도, 그 뒤 안에서 누른 채 배경으로 끌어 놓으면 닫지 않는다', async () => {
  const onClose = vi.fn()
  render(<Modal open onClose={onClose} title="QR 찍기" />)

  await userEvent.click(getDialog())
  fireEvent.mouseDown(screen.getByText('QR 찍기'))
  fireEvent.click(getDialog())

  expect(onClose).toHaveBeenCalledOnce()
})

test('배경을 누른 뒤 안쪽 버튼을 키보드로 눌러도 onClose를 다시 부르지 않는다', async () => {
  const onClose = vi.fn()
  render(
    <Modal open onClose={onClose} title="QR 찍기">
      <Button>확인</Button>
    </Modal>,
  )

  await userEvent.click(getDialog())
  screen.getByRole('button', { name: '확인' }).focus()
  await userEvent.keyboard('{Enter}')

  expect(onClose).toHaveBeenCalledOnce()
})

test('배경을 한 번 누른 뒤에는, 다시 누르지 않은 클릭으로 닫지 않는다', async () => {
  const onClose = vi.fn()
  render(<Modal open onClose={onClose} title="QR 찍기" />)

  await userEvent.click(getDialog())
  // 누르는 동작(mousedown) 없이 click만 온 경우
  fireEvent.click(getDialog())

  expect(onClose).toHaveBeenCalledOnce()
})

test('closeOnBackdrop을 끄면 배경을 눌러도 닫지 않는다', async () => {
  const onClose = vi.fn()
  render(<Modal open onClose={onClose} title="QR 찍기" closeOnBackdrop={false} />)

  await userEvent.click(getDialog())

  expect(onClose).not.toHaveBeenCalled()
})

// ── 브라우저가 스스로 닫은 경우 ───────────────────────────

/**
 * 브라우저가 창을 스스로 닫은 것을 흉내 낸다(Esc를 거듭 눌러 cancel을 막아도 닫히는 경우).
 * 실제 브라우저는 그 앞에 cancel도 보낸다(closable이 켜져 있으면 onClose가 한 번 더 불린다). 여기서는 close만 보낸다.
 * Modal이 상태를 바꿔 다시 그리므로 act로 감싼다.
 */
function forceClose() {
  act(() => getDialog().close())
}

test('브라우저가 스스로 닫으면 onClose로 알린다', () => {
  const onClose = vi.fn()
  render(<Modal open onClose={onClose} title="QR 찍기" />)

  forceClose()

  expect(onClose).toHaveBeenCalledOnce()
})

test('닫았다가 곧바로 다시 열어도 늦게 온 close 이벤트로 onClose를 부르지 않는다', () => {
  vi.useFakeTimers()
  // 실제 브라우저처럼 close 이벤트를 닫힌 뒤에 늦게 보낸다.
  close.mockImplementationOnce(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    setTimeout(() => this.dispatchEvent(new Event('close')), 0)
  })
  const onClose = vi.fn()
  const { rerender } = render(<Modal open onClose={onClose} title="QR 찍기" />)

  rerender(<Modal open={false} onClose={onClose} title="QR 찍기" />)
  rerender(<Modal open onClose={onClose} title="QR 찍기" />)
  vi.runAllTimers()

  expect(onClose).not.toHaveBeenCalled()
  expect(getDialog()).toHaveAttribute('open')
})

test('브라우저가 닫았는데 바깥이 닫기를 받아들이지 않으면 창을 다시 연다. 안의 내용은 그대로다', async () => {
  // 닫기 요청을 받고도 닫지 않는 창(closable은 켜 둔 채).
  const onClose = vi.fn()
  render(
    <Modal open onClose={onClose} title="학부모 추가">
      <input aria-label="이름" defaultValue="" />
    </Modal>,
  )
  await userEvent.type(screen.getByLabelText('이름'), '박순자')
  expect(showModal).toHaveBeenCalledOnce()

  forceClose()

  expect(onClose).toHaveBeenCalledOnce()
  expect(getDialog()).toHaveAttribute('open')
  expect(showModal).toHaveBeenCalledTimes(2)
  // 다시 그리지 않고 다시 열기만 해서 입력하던 값이 남아 있다.
  expect(screen.getByLabelText('이름')).toHaveValue('박순자')
})

test('브라우저가 거듭 닫아도 그때마다 다시 연다', () => {
  render(<Modal open onClose={() => {}} title="학부모 추가" />)

  forceClose()
  forceClose()
  forceClose()

  expect(getDialog()).toHaveAttribute('open')
  expect(showModal).toHaveBeenCalledTimes(4)
})

test('브라우저가 닫았고 바깥이 닫기를 받아들이면 다시 열지 않는다', () => {
  function Demo() {
    const [open, setOpen] = useState(true)
    return <Modal open={open} onClose={() => setOpen(false)} title="QR 찍기" />
  }
  render(<Demo />)

  forceClose()

  expect(getDialog()).not.toHaveAttribute('open')
  expect(showModal).toHaveBeenCalledOnce()
})

test('닫기를 무시하던 바깥이 나중에 닫으면 닫힌다. 그때는 onClose를 다시 부르지도 다시 열지도 않는다', () => {
  const onClose = vi.fn()
  const { rerender } = render(<Modal open onClose={onClose} title="학부모 추가" />)
  forceClose()
  expect(getDialog()).toHaveAttribute('open')

  rerender(<Modal open={false} onClose={onClose} title="학부모 추가" />)

  expect(getDialog()).not.toHaveAttribute('open')
  // 브라우저가 닫았을 때의 한 번뿐이다.
  expect(onClose).toHaveBeenCalledOnce()
  expect(showModal).toHaveBeenCalledTimes(2)
})

test('막지 못한 Esc는 cancel과 close가 잇달아 온다. 닫기를 무시하면 onClose는 두 번 불리고 창은 한 번만 다시 열린다', async () => {
  const onClose = vi.fn()
  render(
    <Modal open onClose={onClose} title="학부모 추가">
      <input aria-label="이름" defaultValue="" />
    </Modal>,
  )
  await userEvent.type(screen.getByLabelText('이름'), '박순자')

  // 실제 브라우저의 순서다. 막을 수 없는 cancel을 보낸 뒤 창을 닫는다.
  fireEvent(getDialog(), new Event('cancel', { cancelable: false }))
  forceClose()

  expect(onClose).toHaveBeenCalledTimes(2)
  expect(getDialog()).toHaveAttribute('open')
  expect(showModal).toHaveBeenCalledTimes(2)
  expect(screen.getByLabelText('이름')).toHaveValue('박순자')
})

test('막지 못한 Esc를 바깥이 받아들이면 onClose는 한 번만 불리고 닫힌 채로 남는다', () => {
  const onClose = vi.fn()
  function Demo() {
    const [open, setOpen] = useState(true)
    return (
      <Modal
        open={open}
        onClose={() => {
          onClose()
          setOpen(false)
        }}
        title="QR 찍기"
      />
    )
  }
  render(<Demo />)

  fireEvent(getDialog(), new Event('cancel', { cancelable: false }))
  forceClose()

  expect(onClose).toHaveBeenCalledOnce()
  expect(getDialog()).not.toHaveAttribute('open')
  expect(showModal).toHaveBeenCalledOnce()
})

test('브라우저가 닫은 창을 다시 열 때, 포커스를 치던 칸으로 돌려놓는다', async () => {
  // 실제 브라우저처럼 열 때 포커스를 창의 첫 칸으로 옮긴다.
  showModal.mockImplementation(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
    this.querySelector<HTMLElement>('select, input, button')?.focus()
  })
  render(
    <Modal open onClose={() => {}} title="학부모 추가">
      <select aria-label="관계" defaultValue="MOTHER">
        <option value="MOTHER">어머니</option>
        <option value="FATHER">아버지</option>
      </select>
      <input aria-label="휴대전화" defaultValue="" />
    </Modal>,
  )
  await userEvent.click(screen.getByLabelText('휴대전화'))
  expect(screen.getByLabelText('휴대전화')).toHaveFocus()

  // 브라우저는 창을 닫으면서 포커스를 창 밖으로 내보낸다.
  act(() => {
    screen.getByLabelText<HTMLElement>('휴대전화').blur()
    getDialog().close()
  })

  // 첫 칸(관계)에 두면, 이어 누른 방향키가 관계를 바꾼다.
  expect(getDialog()).toHaveAttribute('open')
  expect(screen.getByLabelText('휴대전화')).toHaveFocus()
})

test('처음 열 때는 포커스를 옮기지 않는다. 닫았다 다시 열 때도 지난번 자리로 보내지 않는다', async () => {
  showModal.mockImplementation(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
    this.querySelector<HTMLElement>('select, input, button')?.focus()
  })
  function Demo({ open }: { open: boolean }) {
    return (
      <Modal open={open} onClose={() => {}} title="학부모 추가">
        <input aria-label="이름" defaultValue="" />
        <input aria-label="휴대전화" defaultValue="" />
      </Modal>
    )
  }
  const { rerender } = render(<Demo open />)
  expect(screen.getByLabelText('이름')).toHaveFocus()
  await userEvent.click(screen.getByLabelText('휴대전화'))

  // 바깥이 닫았다가 다시 연다. 새로 연 창이다.
  rerender(<Demo open={false} />)
  rerender(<Demo open />)

  expect(screen.getByLabelText('이름')).toHaveFocus()
})

// ── 닫을 수 없는 동안 (closable) ─────────────────────────

test('closable을 끄면 Esc와 배경 클릭을 onClose로 보내지 않는다. Esc의 기본 닫힘은 여전히 막는다', async () => {
  const onClose = vi.fn()
  render(<Modal open onClose={onClose} title="학부모 추가" closable={false} />)

  const notPrevented = fireEvent(getDialog(), new Event('cancel', { cancelable: true }))
  await userEvent.click(getDialog())

  expect(onClose).not.toHaveBeenCalled()
  expect(notPrevented).toBe(false)
  expect(getDialog()).toHaveAttribute('open')
})

test('closable을 끄면 브라우저가 Esc로 닫지 않게 closedby를 none으로 둔다. 켜면 속성을 두지 않는다', () => {
  const { rerender } = render(<Modal open onClose={() => {}} title="학부모 추가" />)
  expect(getDialog()).not.toHaveAttribute('closedby')

  rerender(<Modal open onClose={() => {}} title="학부모 추가" closable={false} />)
  expect(getDialog()).toHaveAttribute('closedby', 'none')

  // 저장이 끝나 다시 닫을 수 있게 되면 속성도 뗀다.
  rerender(<Modal open onClose={() => {}} title="학부모 추가" />)
  expect(getDialog()).not.toHaveAttribute('closedby')
})

test('closable을 꺼 둔 동안 브라우저가 닫아 버리면(closedby를 모르는 브라우저) onClose 없이 다시 연다', () => {
  const onClose = vi.fn()
  render(<Modal open onClose={onClose} title="학부모 추가" closable={false} />)

  fireEvent(getDialog(), new Event('cancel', { cancelable: false }))
  forceClose()

  expect(onClose).not.toHaveBeenCalled()
  expect(getDialog()).toHaveAttribute('open')
  expect(showModal).toHaveBeenCalledTimes(2)
})

test('closable을 꺼 둬도 open을 false로 바꾸면 닫힌다', () => {
  const { rerender } = render(
    <Modal open onClose={() => {}} title="학부모 추가" closable={false} />,
  )

  // 저장에 성공해 바깥이 닫는 경우. 아직 closable이 꺼진 채다.
  rerender(<Modal open={false} onClose={() => {}} title="학부모 추가" closable={false} />)

  expect(getDialog()).not.toHaveAttribute('open')
})

test('closable을 다시 켜면 Esc로 닫을 수 있다', () => {
  const onClose = vi.fn()
  const { rerender } = render(<Modal open onClose={onClose} title="학부모 추가" closable={false} />)
  rerender(<Modal open onClose={onClose} title="학부모 추가" />)

  fireEvent(getDialog(), new Event('cancel', { cancelable: true }))

  expect(onClose).toHaveBeenCalledOnce()
})

// ── 모양 ────────────────────────────────────────────────

test('className을 덧붙일 수 있다', () => {
  render(<Modal open onClose={() => {}} title="QR 찍기" className="max-w-[520px]" />)

  expect(getDialog()).toHaveClass('max-w-[520px]', 'rounded-pass')
})
