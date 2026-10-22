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

// 콘솔에 남겨도 되는 조회의 이름. 캐시 키의 앞 두 마디다(예: ['students', 'list', 조건] → students/list).
// 여기 적힌 이름만 남긴다. 키를 그대로 찍지 않는 까닭: 키에는 값이 들어갈 수 있다.
// 앞으로 ['pass', 토큰]이나 ['find', 전화번호 뒷자리] 같은 키가 생겨도, 여기 없으면 아무것도 찍히지 않는다.
// 새 조회를 만들면 이름(값이 아닌 고정된 두 마디)을 여기 더한다. 빠뜨려도 "어디서"가 안 찍힐 뿐이다.
const KNOWN_SOURCES: ReadonlySet<string> = new Set([
  'accounts/detail',
  'accounts/list',
  'audit-logs/list',
  'auth/me',
  'billing/discount-types',
  'billing/invoices',
  'billing/ledger-sync',
  'billing/payments',
  'billing/quote',
  'campus/campuses',
  'campus/classes',
  'dongtanpass/holder-pass',
  'dongtanpass/holder-qr',
  'dongtanpass/redemptions',
  'partner/partners',
  'settings/class-fees',
  'settings/discount-types',
  'students/detail',
  'students/list',
])

// 어느 조회에서 났는지. 아는 이름이 아니면 빈 문자열이다.
function describeSource(queryKey: readonly unknown[] = []): string {
  const [first, second] = queryKey
  if (typeof first !== 'string' || typeof second !== 'string') return ''
  const name = `${first}/${second}`
  return KNOWN_SOURCES.has(name) ? ` @ ${name}` : ''
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
 * - 배포 환경: 종류와, 아는 조회라면 어느 조회인지만 남긴다(KNOWN_SOURCES). 변경 요청은 종류만 남는다.
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
 * 버튼 클릭이나 비동기 코드에서 난 에러는 화면 에러 경로를 거치지 않는다.
 * 그중 실패한 요청(조회, 저장)은 `logRequestError`가 남기고, 아무도 잡지 않은 나머지는 `watchUncaught`가 남긴다.
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
    /**
     * 아무도 잡지 않은 에러를 받는다. 앱을 띄울 때 한 번 부른다. 돌려주는 함수를 부르면 그만 받는다.
     * - 잡히지 않은 Promise 거부: 화면이 요청에 넘긴 콜백(`mutate(body, { onSuccess })`)이나 비동기 코드에서 난 에러
     * - 잡히지 않은 에러: 버튼 클릭 같은 이벤트 처리 중에 난 에러
     *
     * 브라우저는 이런 에러를 문구와 스택까지 통째로 콘솔에 찍는다. 문구에는 서버 응답이나 입력값이 섞일 수 있다.
     * - 배포 환경: 브라우저의 기본 출력을 막고(preventDefault) 종류 한 줄만 남긴다. 어디서 났는지는 남기지 않는다.
     *   브라우저가 주는 파일 이름은 경우에 따라 지금 페이지의 주소이고, 주소에는 패스 토큰이 들어갈 수 있다.
     * - 개발 서버: 아무것도 하지 않는다. 브라우저가 찍는 문구와 스택이 있어야 원인을 찾는다.
     *
     * 브라우저 확장 프로그램이 낸 에러도 여기로 온다. 우리 코드의 에러와 구분하지 않는다.
     */
    watchUncaught: (target: UncaughtTarget = window) => {
      if (isDev) return () => {}
      const onRejection = (event: Event) => {
        event.preventDefault()
        const { reason } = event as PromiseRejectionEvent
        console.error(`[잡히지 않은 에러] ${describeUncaught(reason)}`)
      }
      const onError = (event: Event) => {
        event.preventDefault()
        const { error } = event as ErrorEvent
        console.error(`[잡히지 않은 에러] ${describeUncaught(error)}`)
      }
      // 이미지 같은 자원을 받지 못한 것은 그 요소에서만 나고 여기까지 올라오지 않는다. 받지 않는다.
      target.addEventListener('unhandledrejection', onRejection)
      target.addEventListener('error', onError)
      return () => {
        target.removeEventListener('unhandledrejection', onRejection)
        target.removeEventListener('error', onError)
      }
    },
  }
}

type UncaughtTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>

// 던져진 값이 없을 수도 있다. 다른 출처의 스크립트에서 난 에러는 브라우저가 내용을 주지 않는다.
function describeUncaught(thrown: unknown): string {
  return thrown == null ? '내용 없음' : describeError(thrown)
}
