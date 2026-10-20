import type { ComponentType } from 'react'

/**
 * 라우트의 화면 코드를 그 주소에 처음 갈 때 받는다(React Router의 `lazy`).
 *
 * 화면 파일을 받지 못해 새로고침하기로 했으면(preloadReload) Vite는 에러를 던지는 대신 빈 값(undefined)을 돌려준다.
 * 그대로 화면을 꺼내면 TypeError가 나서, 새로고침되기 전에 에러 화면이 잠깐 보이고 기록에는 엉뚱한 에러가 남는다.
 * 빈 값이면 끝나지 않는 약속을 돌려줘 새로고침이 끝날 때까지 기다리게 한다.
 * 새로고침하지 않기로 했으면 Vite가 원래 에러를 던지고, 에러 화면(RouteErrorPage)이 안내한다.
 */
export function lazyPage<M>(
  load: () => Promise<M>,
  pick: (module: M) => ComponentType,
): () => Promise<{ Component: ComponentType }> {
  return async () => {
    // 타입은 모듈이지만 새로고침하기로 한 경우에는 undefined가 온다(위 설명).
    const module = (await load()) as M | undefined
    if (module === undefined) return new Promise<never>(() => {})
    return { Component: pick(module) }
  }
}
