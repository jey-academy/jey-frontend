import { ApiError } from '@/shared/api'

/**
 * React Router가 에러와 함께 주는 정보 중 화면 패턴만 받는다.
 * 패턴은 `/p/:token` 같은 라우트 정의라서 실제 토큰이 들어가지 않는다.
 * 같이 오는 location·params에는 실제 주소와 토큰이 들어 있어 쓰지 않는다.
 */
type RouteErrorInfo = { pattern: string }

// 에러의 종류만 꺼낸다. message와 stack에는 서버 응답이나 입력값이 섞일 수 있어 쓰지 않는다.
function describeError(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error
  if (error instanceof ApiError) {
    return `${name} ${error.kind} ${error.status ?? '-'} ${error.code ?? '-'}`
  }
  return name
}

/**
 * 화면을 그리다 난 에러(에러 화면이 잡는 에러)를 콘솔에 어떻게 남길지 정한다.
 * - 개발 서버: 원인을 볼 수 있게 에러를 그대로 남긴다.
 * - 배포 환경: 에러 내용에 개인정보가 섞일 수 있어 "에러 종류 @ 화면 패턴" 한 줄만 남긴다.
 *
 * 버튼 클릭이나 비동기 코드에서 난 에러는 여기를 거치지 않는다.
 * 그쪽은 에러를 만드는 곳에서 메시지에 개인정보를 넣지 않는 것으로 막는다.
 */
export function createErrorLogging(isDev: boolean) {
  return {
    /**
     * `createRoot` 옵션. 배포 환경에서는 React가 에러 객체를 통째로 찍지 않게 끈다.
     * 라우터 밖에 에러 경계를 따로 만들면 그 경계가 직접 기록해야 한다.
     */
    onCaughtError: isDev ? undefined : () => {},
    /** `RouterProvider`의 `onError`. 이걸 주면 React Router가 에러를 직접 찍지 않는다. */
    onRouterError: (error: unknown, info: RouteErrorInfo) => {
      if (isDev) {
        console.error(error)
        return
      }
      console.error(`[화면 에러] ${describeError(error)} @ ${info.pattern}`)
    },
  }
}
