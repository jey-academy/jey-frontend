import { useCallback, useEffect, type ReactNode } from 'react'
import { useBlocker, type BlockerFunction } from 'react-router'
import { Button } from './Button'
import { Modal } from './Modal'

/** 떠나지 못하게 막을 때 알리는 창의 문구. 떠나는 버튼은 없다. */
export type LeaveBlockText = { title: string; description: string }

/**
 * `text`가 null이 아닌 동안 화면을 떠나지 못하게 막는다(보내는 중, 결과를 모를 때 쓴다).
 * - 다른 화면으로 가기(메뉴, 링크, 뒤로 가기): 막고 `text`의 창을 띄운다. 경로(pathname)가 같으면(검색 조건·`#`만 바뀌면) 막지 않는다.
 * - 새로 고침, 탭 닫기: 브라우저 기본 창으로 묻는다(문구는 브라우저가 정한다).
 * 떠나면 화면이 결과를 받지 못하고, 같은 키로 다시 보낼 기회도 잃는다. 서버에서는 처리됐는데 직원은 모르는 채로 남는다.
 * 그래서 막기만 하고 떠나는 버튼은 두지 않는다. 쓰는 쪽은 막을 까닭이 끝나면(결과를 정하면) 반드시 null로 풀어야 한다.
 * 돌려준 창을 화면에 그려야 막을 때 안내가 보인다. React Router는 막기를 한 번에 하나만 받으니 화면에 하나만 둔다.
 */
export function useLeaveBlocker(text: LeaveBlockText | null): ReactNode {
  const active = text !== null
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      active && currentLocation.pathname !== nextLocation.pathname,
    [active],
  )
  const blocker = useBlocker(shouldBlock)
  const blocked = blocker.state === 'blocked'
  // 막은 사이 답이 와서 더 막을 까닭이 없어지면 창을 닫는다(떠나지는 않는다. 직원이 다시 누른다).
  useEffect(() => {
    if (blocked && !active) blocker.reset?.()
  }, [blocked, active, blocker])

  useEffect(() => {
    if (!active) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // 예전 브라우저는 이 값이 있어야 묻는다.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [active])

  return (
    <Modal
      open={blocked && text !== null}
      onClose={() => blocker.reset?.()}
      title={text?.title ?? ''}
      description={text?.description}
    >
      <div className="mt-5 grid">
        <Button onClick={() => blocker.reset?.()}>확인</Button>
      </div>
    </Modal>
  )
}
