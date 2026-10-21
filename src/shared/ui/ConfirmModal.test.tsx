import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { setupDialog } from '@/test/dialog'
import { ConfirmModal } from './ConfirmModal'

setupDialog()

function renderModal(props: Partial<Parameters<typeof ConfirmModal>[0]> = {}) {
  const onClose = vi.fn()
  const onConfirm = vi.fn()
  render(
    <ConfirmModal
      open
      title="결제를 취소할까요?"
      description="환불은 포스기에서 따로 해 주세요."
      confirmLabel="결제 취소하기"
      onClose={onClose}
      onConfirm={onConfirm}
      {...props}
    />,
  )
  return { onClose, onConfirm }
}

test('제목·설명과 돌아가기(왼쪽)·확인(오른쪽) 버튼을 보인다', () => {
  renderModal()

  const dialog = screen.getByRole('dialog', { name: '결제를 취소할까요?' })
  expect(dialog).toHaveAccessibleDescription('환불은 포스기에서 따로 해 주세요.')
  expect(
    within(dialog)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['돌아가기', '결제 취소하기'])
})

test('확인을 누르면 onConfirm, 돌아가기를 누르면 onClose를 부른다', async () => {
  const { onClose, onConfirm } = renderModal()

  await userEvent.click(screen.getByRole('button', { name: '결제 취소하기' }))
  expect(onConfirm).toHaveBeenCalledOnce()
  expect(onClose).not.toHaveBeenCalled()

  await userEvent.click(screen.getByRole('button', { name: '돌아가기' }))
  expect(onClose).toHaveBeenCalledOnce()
})

test('돌아가기 글자를 바꿀 수 있고, 내용을 제목과 버튼 사이에 보인다', () => {
  renderModal({ cancelLabel: '다시 확인', children: <p>보낼 내용</p> })

  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('button', { name: '다시 확인' })).toBeInTheDocument()
  expect(within(dialog).getByText('보낼 내용')).toBeInTheDocument()
})

test('닫혀 있으면 보이지 않는다', () => {
  renderModal({ open: false })

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
