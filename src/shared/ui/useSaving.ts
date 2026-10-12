import { useCallback, useState } from 'react'

/** 저장을 맡기는 함수. 맡긴 일이 끝날 때까지 `saving`이 켜져 있다. */
export type RunSaving = (work: () => Promise<void>) => Promise<void>

/**
 * 저장하는 중인지와, 저장을 맡기는 함수. [saving, runSaving]을 돌려준다.
 * 켜고 끄는 것을 호출하는 쪽에 맡기지 않는다. `runSaving`에 넘긴 일이 끝나면 성공했든 실패했든
 * 반드시 풀린다. 일을 맡긴 폼이 그사이 화면에서 사라져도 풀린다.
 *
 * 풀리지 않으면 창이 잠긴다. 저장하는 동안에는 입력칸과 버튼을 막고 창도 닫지 못하게 하기 때문이다.
 * 그래서 요청은 mutate가 아니라 mutateAsync로 기다린다. mutate에 넘기는 콜백은 폼이 사라지면 불리지 않는다.
 *
 * 맡긴 일이 던진 에러는 삼키지 않고 그대로 내보낸다. 요청의 실패는 맡기는 쪽이 잡는다.
 */
export function useSaving(): [saving: boolean, runSaving: RunSaving] {
  const [saving, setSaving] = useState(false)
  const runSaving = useCallback<RunSaving>(async (work) => {
    setSaving(true)
    try {
      await work()
    } finally {
      setSaving(false)
    }
  }, [])
  return [saving, runSaving]
}
