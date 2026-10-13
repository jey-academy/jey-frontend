import {
  ApiError,
  IDEMPOTENCY_IN_PROGRESS,
  IDEMPOTENCY_KEY_REQUIRED,
  IDEMPOTENCY_KEY_REUSED,
  isOutcomeUnknown,
  retryAfterPhrase,
  supportRequestId,
} from './error'

const IDEMPOTENCY_MESSAGES: Record<string, string> = {
  // 내용을 고쳐 누르면 새 요청으로 나가, 앞선 요청과 함께 두 건이 만들어질 수 있다.
  [IDEMPOTENCY_IN_PROGRESS]:
    '앞서 보낸 요청을 아직 처리하고 있어요. 내용은 고치지 말고 잠시 뒤 다시 눌러 주세요.',
  // 다시 누르면 새 키로 나간다.
  [IDEMPOTENCY_KEY_REUSED]: '요청을 처리하지 못했어요. 다시 눌러 주세요.',
  // 다시 눌러도 같은 답이 온다. 화면 코드를 고쳐야 한다.
  [IDEMPOTENCY_KEY_REQUIRED]: '요청을 처리하지 못했어요. 문제가 계속되면 관리자에게 알려 주세요.',
}

/**
 * `useIdempotentPost`로 보내는 폼이 `unsure`에 넣는 말.
 * 응답을 받지 못한 뒤 같은 내용으로 다시 보내면 같은 키가 나가, 서버가 한 번만 처리한다(백엔드 ADR-0027).
 * 내용을 고치면 새 키로 나가므로 그대로 누르게 한다.
 * 그래서 이 말을 쓰는 폼은 저장하는 동안 입력칸을 막는다(shared/ui의 Form). 그사이 고친 값이 있으면 그대로 눌러도 내용이 달라진다.
 */
export const UNSURE_RESEND_AS_IS =
  '저장됐을 수도 있어요. 내용은 그대로 두고 다시 눌러 주세요. 두 번 저장되지 않아요.'

// "저장" 대신 "처리"라고 한다. 등록·수정만이 아니라 차단, 비밀번호 변경 같은 폼도 이 문구를 쓴다.
const CODE_ERROR_MESSAGE =
  '화면에서 문제가 생겼어요. 처리됐을 수도 있으니, 다시 누르지 말고 새로 고친 뒤 확인해 주세요. 문제가 계속되면 관리자에게 알려 주세요.'

/** 입력칸 이름별 오류 문구. 문제가 없는 칸은 키를 넣지 않는다. */
export type FieldErrors<Field extends string> = Partial<Record<Field, string>>

/** `splitServerError`에 넘기는 것. 폼이 어떤 칸을 갖고, 코드로만 오는 에러가 어느 칸의 문제인지. */
export type SplitOptions<Field extends string> = {
  /** 이 폼에 있는 입력칸 이름. 서버가 errors[].field로 주는 값과 같아야 한다(중첩이면 `guardians[0].name` 같은 경로). */
  fields: readonly Field[]
  /**
   * 필드 목록 없이 코드로만 오는 에러가 어느 칸의 문제인지 (예: 이름 중복 → name).
   * 칸 이름은 `fields`에 있는 것만 쓸 수 있다. 잘못 쓰면 문구가 어디에도 보이지 않게 되므로 타입으로 막는다.
   * `fields`의 타입이 그냥 string이면 막히지 않으니, 칸 이름을 리터럴 타입으로 넘긴다.
   */
  codes?: Record<string, NoInfer<Field>>
  /**
   * 저장됐는지 알 수 없을 때(응답 없음, 서버 오류) 덧붙일 말. 기본값은 목록을 먼저 확인하라는 안내다.
   * 같은 요청을 다시 보내도 안전한 폼(수정, 멱등 키를 싣는 등록)은 그에 맞는 말로 바꾼다.
   */
  unsure?: string
}

/**
 * `splitServerError`의 결과. `requestId`는 폼 전체 문구 아래에 보여줄 요청 번호다(`supportRequestId`의 결과).
 * 번호가 있을 때는 `form`도 있다. 폼은 `form`이 있을 때만 안내를 그린다.
 */
export type ServerErrors<Field extends string> = {
  fields: FieldErrors<Field>
  form: string | null
  requestId: string | null
}

/** 서버 에러가 없을 때의 값. 어느 폼의 칸 이름에도 맞는다. */
export const NO_SERVER_ERRORS: ServerErrors<never> = { fields: {}, form: null, requestId: null }

/** 저장·등록 요청의 에러를 입력칸별 문구와 폼 전체 문구로 나누고, 보여줄 요청 번호를 붙인다. 입력 폼들이 같이 쓴다. */
export function splitServerError<Field extends string>(
  error: unknown,
  options: SplitOptions<Field>,
): ServerErrors<Field> {
  const messages = splitMessages(error, options)
  // 번호는 폼 전체 문구 아래에 그린다. 문구가 없으면(칸의 오류뿐이면) 번호도 없다.
  return { ...messages, requestId: messages.form === null ? null : supportRequestId(error) }
}

// 문구만 나눈다. 돌려주는 곳이 여럿이라 요청 번호는 바깥(splitServerError)에서 한 번에 붙인다.
function splitMessages<Field extends string>(
  error: unknown,
  {
    fields: fieldNames,
    codes = {},
    unsure = '저장됐을 수도 있으니, 다시 저장하기 전에 목록을 먼저 확인해 주세요.',
  }: SplitOptions<Field>,
): { fields: FieldErrors<Field>; form: string | null } {
  // API 오류가 아니면 화면 코드의 버그다. 응답을 받은 뒤의 처리에서 났다면 서버에는 이미 처리됐다.
  // 다시 눌러도 같은 자리에서 또 실패하고, 그사이 한 건이 더 만들어지거나 중복으로 거부될 수 있다.
  // 그래서 폼마다 다른 unsure("그대로 다시 눌러 주세요" 등)를 쓰지 않고 다시 누르지 말라고 한다.
  if (!(error instanceof ApiError)) {
    return { fields: {}, form: CODE_ERROR_MESSAGE }
  }
  // 응답을 받지 못했거나 읽지 못했을 뿐 서버에는 저장됐을 수 있다. 서버 오류(5xx)도 같다.
  // 무엇을 하면 되는지는 폼마다 다르다(unsure).
  if (isOutcomeUnknown(error)) {
    return { fields: {}, form: `${error.message} ${unsure}` }
  }
  // 요청이 너무 많다는 답(429)도 입력이 틀린 것이 아니다. 맞는 값을 넣어도 풀릴 때까지 같은 답이 온다.
  // 칸에 표시하지 않고 언제 풀리는지 알린다.
  // error는 이미 ApiError다. isRateLimited(타입 가드)를 쓰면 아래에서 타입이 좁혀져 버린다.
  if (error.status === 429) {
    return {
      fields: {},
      form: `요청이 너무 많아요. ${retryAfterPhrase(error)}에 다시 시도해 주세요.`,
    }
  }
  // 멱등 키 오류는 입력이 틀린 것이 아니다. 서버 문구("Idempotency-Key …")를 그대로 보여주지 않고 할 일을 알린다.
  if (error.code && Object.hasOwn(IDEMPOTENCY_MESSAGES, error.code)) {
    return { fields: {}, form: IDEMPOTENCY_MESSAGES[error.code] }
  }
  // hasOwn으로 확인한다. 그냥 꺼내면 "toString" 같은 코드가 객체의 기본 속성에 걸린다.
  if (error.code && Object.hasOwn(codes, error.code)) {
    return { fields: { [codes[error.code]]: error.message } as FieldErrors<Field>, form: null }
  }

  const fields: FieldErrors<Field> = {}
  const rest: string[] = []
  for (const { field, message } of error.fieldErrors) {
    const known = fieldNames.find((name) => name === field)
    // 한 칸에 오류가 여럿이면 그 칸에 이어 붙인다. 폼 아래로 보내면 어느 칸 얘기인지 알 수 없다.
    if (known) fields[known] = fields[known] ? `${fields[known]} ${message}` : message
    // 이 폼에 없는 칸이나 여러 칸에 걸친 오류도 버리지 않고 폼 아래에 보여준다.
    else rest.push(message)
  }
  if (rest.length > 0) return { fields, form: rest.join(' ') }
  // 어느 칸의 문제인지 짚었으면 "입력값이 올바르지 않습니다" 같은 전체 문구는 되풀이하지 않는다.
  return { fields, form: Object.keys(fields).length > 0 ? null : error.message }
}
