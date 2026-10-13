import { ApiError, supportRequestId } from '@/shared/api'

/**
 * React Router가 에러와 함께 주는 정보 중 화면 패턴만 받는다.
 * 패턴은 `/p/:token` 같은 라우트 정의라서 실제 토큰이 들어가지 않는다.
 * 같이 오는 location·params에는 실제 주소와 토큰이 들어 있어 쓰지 않는다.
 */
type RouteErrorInfo = { pattern: string }

// 에러를 가려내는 값(종류, 상태 코드, 에러 코드, 요청 번호)만 꺼낸다.
// message와 stack에는 서버 응답이나 입력값이 섞일 수 있어 쓰지 않는다.
// 요청 번호는 받을 때 모양(영문자·숫자·_·- 8~64자)을 확인한 값이라 다른 내용이 실릴 수 없다(shared/api/client.ts).
function describeError(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error
  if (error instanceof ApiError) {
    return `${name} ${error.kind} ${error.status ?? '-'} ${error.code ?? '-'} ${error.requestId ?? '-'}`
  }
  return name
}

type RequestErrorSource = {
  /** 실패한 조회의 캐시 키. 변경 요청(저장 등)에는 키가 없다. */
  queryKey?: readonly unknown[]
  /** 개발 서버인지. 주지 않으면 지금 환경을 따른다. */
  isDev?: boolean
}

// 어느 조회에서 났는지. 캐시 키의 앞 두 마디만 쓴다(예: students/list).
// 이 저장소의 키는 앞 두 마디가 고정된 이름이고, 검색어·ID·조건은 그 뒤에 온다.
// 문자열이 아닌 마디를 만나면 거기서 멈춘다. 키를 짓는 규칙이 달라져도 값이 실리지 않는다.
function describeSource(queryKey: readonly unknown[] = []): string {
  const names: string[] = []
  for (const part of queryKey.slice(0, 2)) {
    if (typeof part !== 'string') break
    names.push(part)
  }
  return names.length > 0 ? ` @ ${names.join('/')}` : ''
}

/**
 * 실패한 요청(조회, 저장)을 콘솔에 한 줄로 남긴다. QueryClient가 실패마다 부른다.
 *
 * API 오류는 예상하지 못한 것만 남긴다(화면에 요청 번호를 보여주는 오류와 같다, `supportRequestId`).
 * 화면의 번호는 창을 닫으면 사라진다. 적어 두지 않았어도 여기서 되찾을 수 있다.
 * 조회는 몇 번 다시 보낸 뒤의 마지막 실패만 남는다.
 *
 * API 오류가 아닌 에러는 화면 코드의 버그다(응답을 받은 뒤의 처리에서 난 예외 등). 화면에는 일반 문구만 보이므로
 * 여기서 남기지 않으면 흔적이 없다.
 * - 개발 서버: 원인을 볼 수 있게 에러를 그대로 남긴다.
 * - 배포 환경: 종류와, 조회라면 어느 조회인지만 남긴다. 변경 요청은 종류만 남는다.
 */
export function logRequestError(
  error: unknown,
  { queryKey, isDev = import.meta.env.DEV }: RequestErrorSource = {},
) {
  if (!(error instanceof ApiError)) {
    if (isDev) {
      console.error(error)
      return
    }
    console.error(`[코드 에러] ${describeError(error)}${describeSource(queryKey)}`)
    return
  }
  if (supportRequestId(error) === null) return
  console.error(`[API 에러] ${describeError(error)}`)
}

/**
 * 화면을 그리다 난 에러(에러 화면이 잡는 에러)를 콘솔에 어떻게 남길지 정한다.
 * - 개발 서버: 원인을 볼 수 있게 에러를 그대로 남긴다.
 * - 배포 환경: 에러 내용에 개인정보가 섞일 수 있어 "에러 종류 @ 화면 패턴" 한 줄만 남긴다.
 *
 * 버튼 클릭이나 비동기 코드에서 난 에러는 여기를 거치지 않는다.
 * 그쪽은 에러를 만드는 곳에서 메시지에 개인정보를 넣지 않는 것으로 막는다.
 * 그중 실패한 요청(조회, 저장)은 `logRequestError`가 남긴다.
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
