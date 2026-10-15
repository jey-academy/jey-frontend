import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * 이 컴포넌트가 아직 화면에 있는지 묻는 함수를 돌려준다. 요청이 끝난 뒤 다른 화면으로 옮길지(navigate) 정할 때 쓴다.
 *
 * TanStack Query의 `mutate(body, { onSuccess })` 콜백은 그 컴포넌트가 내려가면 불리지 않는다. 그런데 구독을 끊는 일은
 * React가 화면을 바꿔 그린 뒤에 조금 늦게 한다(useEffect의 정리). 그 틈에 응답이 오면 콜백이 불려, 이미 다른 화면으로
 * 떠난 사람을 끌고 간다. 여기서는 useLayoutEffect의 정리로 내려가는 그 순간에 끄므로 그 틈이 없다.
 */
export function useIsShown(): () => boolean {
  const shown = useRef(false)
  useLayoutEffect(() => {
    shown.current = true
    return () => {
      shown.current = false
    }
  }, [])
  return useCallback(() => shown.current, [])
}
