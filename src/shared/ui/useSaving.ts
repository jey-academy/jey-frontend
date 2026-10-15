import { useCallback, useRef, useState } from 'react'

/** 저장을 맡기는 함수. 맡긴 일이 끝날 때까지 `saving`이 켜져 있다. */
export type RunSaving = (work: () => Promise<void>) => Promise<void>

/** 창이 useSaving으로 만들어 폼에 내려 주는 두 값. 폼의 props에 더해 쓴다. */
export type SavingProps = {
  saving: boolean
  /** 저장을 맡긴다. 맡긴 일이 끝나면 `saving`이 풀린다(useSaving). */
  runSaving: RunSaving
}

/**
 * 저장하는 중인지와, 저장을 맡기는 함수. [saving, runSaving]을 돌려준다.
 * 켜고 끄는 것을 호출하는 쪽에 맡기지 않는다. `runSaving`에 넘긴 일이 끝나면 성공했든 실패했든
 * 반드시 풀린다. 일을 맡긴 폼이 그사이 화면에서 사라져도 풀린다.
 *
 * 풀리지 않으면 창이 잠긴다. 저장하는 동안에는 입력칸과 버튼을 막고 창도 닫지 못하게 하기 때문이다.
 * 그래서 요청은 mutate가 아니라 mutateAsync로 기다린다. mutate에 넘기는 콜백은 폼이 사라지면 불리지 않는다.
 *
 * 쓰는 곳: 폼보다 오래 남는 쪽(창)에서 부르고, saving과 runSaving을 폼에 내려 준다.
 * 요청과 화면이 같은 컴포넌트에 있으면 이 훅 없이 mutation의 isPending을 쓴다(StudentNewPage).
 *
 * - 맡긴 일이 던진 에러는 삼키지 않고 그대로 내보낸다. 요청의 실패는 맡기는 쪽이 잡는다.
 * - 맡긴 일의 나머지(요청 뒤의 onClose 등)는 폼이 사라진 뒤에도 실행된다. 그때 불려도 괜찮은 일만 넣는다.
 * - 저장하는 중에 또 맡기면 받지 않는다(그 일은 실행하지 않는다). 겹치면 먼저 끝난 쪽이 잠금을 풀어 버린다.
 */
export function useSaving(): [saving: boolean, runSaving: RunSaving] {
  const [saving, setSaving] = useState(false)
  // saving은 다시 그려야 바뀐다. 그 전에 또 불려도 알 수 있게 바로 바뀌는 값을 따로 둔다.
  const running = useRef(false)
  const runSaving = useCallback<RunSaving>(async (work) => {
    if (running.current) return
    running.current = true
    setSaving(true)
    try {
      await work()
    } finally {
      running.current = false
      setSaving(false)
    }
  }, [])
  return [saving, runSaving]
}
