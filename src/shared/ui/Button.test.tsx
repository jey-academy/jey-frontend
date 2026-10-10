import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Button } from './Button'

test('누르면 onClick을 부른다', async () => {
  const onClick = vi.fn()
  render(<Button onClick={onClick}>확인하기</Button>)

  await userEvent.click(screen.getByRole('button', { name: '확인하기' }))

  expect(onClick).toHaveBeenCalledOnce()
})

test('disabled면 눌러도 onClick을 부르지 않는다', async () => {
  const onClick = vi.fn()
  render(
    <Button disabled onClick={onClick}>
      확인 중
    </Button>,
  )

  await userEvent.click(screen.getByRole('button', { name: '확인 중' }))

  expect(onClick).not.toHaveBeenCalled()
})

test('기본 type은 button이라 폼을 제출하지 않는다', () => {
  render(<Button>닫기</Button>)

  expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
})

test('variant와 size에 맞는 클래스를 붙인다', () => {
  render(
    <Button variant="ghost" size="sm">
      링크 복사
    </Button>,
  )

  const button = screen.getByRole('button')
  expect(button).toHaveClass('bg-field', 'h-[38px]', 'rounded-btn-sm')
  expect(button).not.toHaveClass('bg-night')
})

test('block은 md에서만 높이를 58px로 키운다', () => {
  render(
    <>
      <Button block>md</Button>
      <Button block size="sm">
        sm
      </Button>
    </>,
  )

  expect(screen.getByRole('button', { name: 'md' })).toHaveClass('w-full', 'h-[58px]')
  expect(screen.getByRole('button', { name: 'sm' })).not.toHaveClass('h-[58px]')
})
