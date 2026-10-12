import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from '@testing-library/react'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { useGuardianAddedNotice } from './api'

const KEY = ['students', 'guardian-added-notice', 1]
const notice = { studentId: 1, typedName: '박순자', linked: undefined }

let container: HTMLElement
beforeEach(() => {
  container = document.body.appendChild(document.createElement('div'))
})
afterEach(() => {
  container.remove()
})

test('화면이 내려간 직후에 도착한 안내는 캐시에 남는다', async () => {
  const queryClient = new QueryClient()
  let leave!: () => void
  function Detail() {
    const [added] = useGuardianAddedNotice(1)
    return <p>{added ? `${added.typedName} 학부모를 추가했어요.` : '학생 상세'}</p>
  }
  function App() {
    const [here, setHere] = useState(true)
    leave = () => setHere(false)
    return here ? <Detail /> : null
  }
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    )
  })
  expect(container).toHaveTextContent('학생 상세')

  // 화면이 DOM에서 빠진 바로 그때 안내가 도착하게 한다. React는 이때 useEffect의 정리를 아직 실행하지 않았다.
  // act로 감싸면 정리까지 한 번에 끝나 이 틈이 생기지 않는다. 그래서 감싸지 않고 실제처럼 그리게 둔다.
  const left = new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (container.textContent !== '') return
      observer.disconnect()
      queryClient.setQueryData(KEY, notice)
      resolve()
    })
    observer.observe(container, { childList: true, subtree: true })
  })
  const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const before = actEnvironment.IS_REACT_ACT_ENVIRONMENT
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = false
  try {
    leave()
    await left
    // 늦게 실행되는 정리까지 끝나기를 기다린다.
    await new Promise((resolve) => setTimeout(resolve, 50))
  } finally {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = before
  }

  // 사라진 화면이 받아 지웠으면 돌아왔을 때 보여줄 안내가 없다.
  expect(queryClient.getQueryData(KEY)).toEqual(notice)
  await act(async () => root.unmount())
})
