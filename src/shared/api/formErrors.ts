import {
  ApiError,
  IDEMPOTENCY_IN_PROGRESS,
  IDEMPOTENCY_KEY_REQUIRED,
  IDEMPOTENCY_KEY_REUSED,
  isOutcomeUnknown,
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

/** 입력칸 이름별 오류 문구. 문제가 없는 칸은 키를 넣지 않는다. */
export type FieldErrors<Field extends string> = Partial<Record<Field, string>>

type SplitOptions<Field extends string> = {
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
   * 같은 요청을 다시 보내도 안전한 폼(수정)은 그에 맞는 말로 바꾼다.
   */
  unsure?: string
}

/** 저장·등록 요청의 에러를 입력칸별 문구와 폼 전체 문구로 나눈다. 입력 폼들이 같이 쓴다. */
export function splitServerError<Field extends string>(
  error: unknown,
  {
    fields: fieldNames,
    codes = {},
    unsure = '저장됐을 수도 있으니, 다시 저장하기 전에 목록을 먼저 확인해 주세요.',
  }: SplitOptions<Field>,
): { fields: FieldErrors<Field>; form: string | null } {
  if (!(error instanceof ApiError)) {
    return { fields: {}, form: '저장하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  }
  // 응답을 받지 못했거나 읽지 못했을 뿐 서버에는 저장됐을 수 있다. 서버 오류(5xx)도 같다.
  // 같은 내용을 다시 저장하기 전에 확인하게 한다.
  if (isOutcomeUnknown(error)) {
    return { fields: {}, form: `${error.message} ${unsure}` }
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
