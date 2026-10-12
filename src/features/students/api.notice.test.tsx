import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { useGuardianAddedNotice } from './api'

// api.ts의 guardianAddedNoticeKey(1)와 같아야 한다. 달라지면 아래 테스트들의 "뜬다" 단언이 실패해 알려 준다.
const KEY = ['students', 'guardian-added-notice', 1]
const notice = { studentId: 1, typedName: '박순자', linked: undefined }
const SHOWN = '박순자 학부모를 추가했어요.'

let container: HTMLElement
let root: Root
let queryClient: QueryClient
beforeEach(() => {
  container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  queryClient = new QueryClient()
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

function Detail() {
  const [added] = useGuardianAddedNotice(1)
  return <p>{added ? `${added.typedName} 학부모를 추가했어요.` : '학생 상세'}</p>
}

function mount(children: ReactNode) {
  return act(async () => {
    root.render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>)
  })
}

test('화면이 떠 있는 동안 도착한 안내는 바로 보여주고 캐시에서 지운다', async () => {
  await mount(<Detail />)
  expect(container).toHaveTextContent('학생 상세')

  act(() => {
    queryClient.setQueryData(KEY, notice)
  })

  expect(container).toHaveTextContent(SHOWN)
  expect(queryClient.getQueryData(KEY)).toBeUndefined()
})

test('화면이 내려간 직후에 도착한 안내는 캐시에 남는다', async () => {
  // useEffect의 정리가 실행됐는지 적어 둔다. 이 테스트가 만드는 틈이 실제로 있는지 확인하는 데 쓴다.
  let effectCleaned = false
  function Probe() {
    useEffect(
      () => () => {
        effectCleaned = true
      },
      [],
    )
    return null
  }
  await mount(
    <>
      <Detail />
      <Probe />
    </>,
  )
  expect(container).toHaveTextContent('학생 상세')

  // 화면이 DOM에서 빠진 바로 그때 안내가 도착하게 한다. React는 이때 useEffect의 정리를 아직 실행하지 않았다.
  // act로 감싸면 정리까지 한 번에 끝나 이 틈이 생기지 않는다. 그래서 감싸지 않고 실제처럼 그리게 둔다.
  let cleanedOnArrival: boolean | undefined
  const left = new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (container.textContent !== '') return
      observer.disconnect()
      cleanedOnArrival = effectCleaned
      queryClient.setQueryData(KEY, notice)
      resolve()
    })
    observer.observe(container, { childList: true, subtree: true })
  })
  const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const before = actEnvironment.IS_REACT_ACT_ENVIRONMENT
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = false
  try {
    // 다른 화면으로 간다.
    root.render(<QueryClientProvider client={queryClient}>{null}</QueryClientProvider>)
    await left
    // 늦게 실행되는 정리까지 끝나기를 기다린다.
    await new Promise((resolve) => setTimeout(resolve, 50))
  } finally {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = before
  }

  // 전제: 안내가 도착한 때 useEffect의 정리는 아직이었다. React가 이 순서를 바꾸면 이 테스트는 아무것도 가리지 못한다.
  expect(cleanedOnArrival).toBe(false)
  expect(effectCleaned).toBe(true)
  // 사라진 화면이 받아 지웠으면 돌아왔을 때 보여줄 안내가 없다.
  expect(queryClient.getQueryData(KEY)).toEqual(notice)
})

test('처음 그린 뒤 구독하기 전에 도착한 안내도 보여준다', async () => {
  // 형제가 그려지는 중에 안내가 도착한다. Detail은 이미 "안내 없음"으로 그려졌고 아직 구독하지 않았다.
  function ArrivesDuringRender() {
    if (queryClient.getQueryData(KEY) === undefined && !arrived) {
      arrived = true
      queryClient.setQueryData(KEY, notice)
    }
    return null
  }
  let arrived = false

  await mount(
    <>
      <Detail />
      <ArrivesDuringRender />
    </>,
  )

  expect(container).toHaveTextContent(SHOWN)
  expect(queryClient.getQueryData(KEY)).toBeUndefined()
})
