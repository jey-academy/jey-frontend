import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, onTestFinished, test, vi } from 'vitest'
import { HolderLinkCopy } from './HolderLinkCopy'

const TOKEN = 'k7Qm2xVa9LpR4tWz'
const LINK = `${window.location.origin}/p/${TOKEN}`

/** 이 테스트에서만 공유 창을 둔다. 끝나면 지운다(jsdom에는 없다). */
function mockShare(share: (data: ShareData) => Promise<void>) {
  const fn = vi.fn(share)
  Object.defineProperty(navigator, 'share', { configurable: true, value: fn })
  onTestFinished(() => {
    Reflect.deleteProperty(navigator, 'share')
  })
  return fn
}

test('공유 창이 없는 브라우저에서는 공유하기 버튼이 없고, 링크 복사는 그대로 있다', () => {
  render(<HolderLinkCopy linkToken={TOKEN} />)

  expect(screen.getByLabelText('학부모 링크')).toHaveValue(LINK)
  expect(screen.getByRole('button', { name: '링크 복사' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '공유하기' })).not.toBeInTheDocument()
})

test('공유하기는 학부모 링크를 학생 이름 없는 글과 함께 공유 창에 넘긴다', async () => {
  const share = mockShare(() => Promise.resolve())
  render(<HolderLinkCopy linkToken={TOKEN} />)

  await userEvent.click(screen.getByRole('button', { name: '공유하기' }))

  expect(share).toHaveBeenCalledOnce()
  expect(share).toHaveBeenCalledWith({
    title: 'JEY 동탄고 패스',
    text: 'JEY 동탄고 패스 링크예요. 학원에 가실 때 열어 보여 주세요.',
    url: LINK,
  })
  expect(screen.getByRole('button', { name: '공유하기' })).toBeEnabled()
  expect(screen.queryByText(/공유하지 못했어요/)).not.toBeInTheDocument()
})

test('공유 창이 열려 있는 동안에는 버튼을 막는다', async () => {
  let finish: () => void = () => {}
  const pending = new Promise<void>((resolve) => (finish = resolve))
  mockShare(() => pending)
  render(<HolderLinkCopy linkToken={TOKEN} />)

  await userEvent.click(screen.getByRole('button', { name: '공유하기' }))
  expect(screen.getByRole('button', { name: '공유하기' })).toBeDisabled()

  finish()
  await waitFor(() => expect(screen.getByRole('button', { name: '공유하기' })).toBeEnabled())
})

test('공유 창을 닫으면(AbortError) 아무것도 알리지 않는다', async () => {
  mockShare(() => Promise.reject(new DOMException('Share canceled', 'AbortError')))
  render(<HolderLinkCopy linkToken={TOKEN} />)

  await userEvent.click(screen.getByRole('button', { name: '공유하기' }))

  await waitFor(() => expect(screen.getByRole('button', { name: '공유하기' })).toBeEnabled())
  expect(screen.queryByText(/공유하지 못했어요/)).not.toBeInTheDocument()
})

test('그 밖의 이유로 공유하지 못하면 링크 복사를 쓰라고 알린다', async () => {
  mockShare(() => Promise.reject(new DOMException('Not allowed', 'NotAllowedError')))
  render(<HolderLinkCopy linkToken={TOKEN} />)

  await userEvent.click(screen.getByRole('button', { name: '공유하기' }))

  expect(await screen.findByText('공유하지 못했어요. 링크 복사를 써 주세요.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '공유하기' })).toBeEnabled()
})
