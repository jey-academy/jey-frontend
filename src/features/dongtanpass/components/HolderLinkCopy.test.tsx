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

test('공유 창의 답이 오지 않아도 버튼은 막지 않는다(일부 앱 안 브라우저)', async () => {
  // 끝나지 않는 공유. 버튼을 막으면 다시 누를 길이 없다.
  const share = mockShare(() => new Promise<void>(() => {}))
  render(<HolderLinkCopy linkToken={TOKEN} />)

  await userEvent.click(screen.getByRole('button', { name: '공유하기' }))

  expect(screen.getByRole('button', { name: '공유하기' })).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: '공유하기' }))
  expect(share).toHaveBeenCalledTimes(2)
})

test.each([
  ['공유 창을 닫음(AbortError)', () => new DOMException('Share canceled', 'AbortError')],
  // DOMException이 Error를 이어받지 않는 환경도 있다. 이름만 보고 판단한다.
  ['닫음, Error가 아닌 객체', () => ({ name: 'AbortError' })],
  ['창이 이미 열려 있음(InvalidStateError)', () => new DOMException('Busy', 'InvalidStateError')],
])('%s이면 아무것도 알리지 않는다', async (_name, makeError) => {
  mockShare(() => Promise.reject(makeError()))
  render(<HolderLinkCopy linkToken={TOKEN} />)

  await userEvent.click(screen.getByRole('button', { name: '공유하기' }))

  await waitFor(() => expect(screen.getByRole('button', { name: '공유하기' })).toBeEnabled())
  expect(screen.queryByText(/공유하지 못했어요/)).not.toBeInTheDocument()
})

test('공유에 실패한 뒤 다시 공유하거나 복사에 성공하면 실패 안내를 지운다', async () => {
  let fail = true
  const share = vi.fn(() =>
    fail ? Promise.reject(new DOMException('Not allowed', 'NotAllowedError')) : Promise.resolve(),
  )
  const writeText = vi.fn(() => Promise.resolve())
  vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText } })
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })
  render(<HolderLinkCopy linkToken={TOKEN} />)
  const failed = '공유하지 못했어요. 링크 복사를 써 주세요.'

  await userEvent.click(screen.getByRole('button', { name: '공유하기' }))
  await screen.findByText(failed)
  fail = false
  await userEvent.click(screen.getByRole('button', { name: '공유하기' }))
  await waitFor(() => expect(screen.queryByText(failed)).not.toBeInTheDocument())

  fail = true
  await userEvent.click(screen.getByRole('button', { name: '공유하기' }))
  await screen.findByText(failed)
  await userEvent.click(screen.getByRole('button', { name: '링크 복사' }))
  await waitFor(() => expect(screen.queryByText(failed)).not.toBeInTheDocument())
})

test('복사에 실패한 뒤 공유에 성공하면 복사 실패 안내를 지운다', async () => {
  const share = vi.fn(() => Promise.resolve())
  const writeText = vi.fn(() => Promise.reject(new Error('denied')))
  vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText } })
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })
  render(<HolderLinkCopy linkToken={TOKEN} />)
  const failed = '링크를 복사하지 못했어요. 링크 칸을 눌러 직접 복사해 주세요.'

  await userEvent.click(screen.getByRole('button', { name: '링크 복사' }))
  await screen.findByText(failed)
  await userEvent.click(screen.getByRole('button', { name: '공유하기' }))

  await waitFor(() => expect(screen.queryByText(failed)).not.toBeInTheDocument())
  expect(share).toHaveBeenCalledOnce()
})

test('그 밖의 이유로 공유하지 못하면 링크 복사를 쓰라고 알린다', async () => {
  mockShare(() => Promise.reject(new DOMException('Not allowed', 'NotAllowedError')))
  render(<HolderLinkCopy linkToken={TOKEN} />)

  await userEvent.click(screen.getByRole('button', { name: '공유하기' }))

  expect(await screen.findByText('공유하지 못했어요. 링크 복사를 써 주세요.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '공유하기' })).toBeEnabled()
})
