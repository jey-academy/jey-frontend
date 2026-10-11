import { ApiError } from './error'

/** 입력칸 이름별 오류 문구. 문제가 없는 칸은 키를 넣지 않는다. */
export type FieldErrors<Field extends string> = Partial<Record<Field, string>>

type SplitOptions<Field extends string> = {
  /** 이 폼에 있는 입력칸 이름(요청 본문의 필드 이름과 같다) */
  fields: readonly Field[]
  /**
   * 필드 목록 없이 코드로만 오는 에러가 어느 칸의 문제인지 (예: 이름 중복 → name).
   * 칸 이름은 `fields`에 있는 것만 쓸 수 있다. 잘못 쓰면 문구가 어디에도 보이지 않게 되므로 타입으로 막는다.
   */
  codes?: Record<string, NoInfer<Field>>
}

/** 저장 요청의 에러를 입력칸별 문구와 폼 전체 문구로 나눈다. 입력 폼들이 같이 쓴다. */
export function splitServerError<Field extends string>(
  error: unknown,
  { fields: fieldNames, codes = {} }: SplitOptions<Field>,
): { fields: FieldErrors<Field>; form: string | null } {
  if (!(error instanceof ApiError)) {
    return { fields: {}, form: '저장하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  }
  // 응답을 받지 못했거나 읽지 못했을 뿐 서버에는 저장됐을 수 있다. 같은 내용을 다시 저장하기 전에 확인하게 한다.
  if (error.kind === 'timeout' || error.kind === 'network' || error.kind === 'parse') {
    return {
      fields: {},
      form: `${error.message} 저장됐을 수도 있으니, 다시 저장하기 전에 목록을 먼저 확인해 주세요.`,
    }
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
