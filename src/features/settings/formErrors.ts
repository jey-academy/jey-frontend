import { ApiError } from '@/shared/api'

/** 입력칸 이름별 오류 문구. 문제가 없는 칸은 키를 넣지 않는다. */
export type FieldErrors<Field extends string> = Partial<Record<Field, string>>

type SplitOptions<Field extends string> = {
  /** 이 폼에 있는 입력칸 이름(요청 본문의 필드 이름과 같다) */
  fields: readonly Field[]
  /** 필드 목록 없이 코드로만 오는 에러가 어느 칸의 문제인지 (예: 이름 중복 → name) */
  codes?: Record<string, Field>
}

/** 저장 요청의 에러를 입력칸별 문구와 폼 전체 문구로 나눈다. 설정 화면의 폼들이 같이 쓴다. */
export function splitServerError<Field extends string>(
  error: unknown,
  { fields: fieldNames, codes = {} }: SplitOptions<Field>,
): { fields: FieldErrors<Field>; form: string | null } {
  if (!(error instanceof ApiError)) {
    return { fields: {}, form: '저장하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  }
  // 응답을 받지 못했을 뿐 서버에는 저장됐을 수 있다. 같은 내용을 다시 저장하기 전에 확인하게 한다.
  if (error.kind === 'timeout' || error.kind === 'network') {
    return {
      fields: {},
      form: `${error.message} 저장됐을 수도 있으니, 창을 닫고 목록을 먼저 확인해 주세요.`,
    }
  }
  const codeField = error.code ? codes[error.code] : undefined
  if (codeField) {
    return { fields: { [codeField]: error.message } as FieldErrors<Field>, form: null }
  }

  const fields: FieldErrors<Field> = {}
  const rest: string[] = []
  for (const { field, message } of error.fieldErrors) {
    const known = fieldNames.find((name) => name === field)
    if (known && !fields[known]) fields[known] = message
    // 이 폼에 없는 칸이나 여러 칸에 걸친 오류도 버리지 않고 폼 아래에 보여준다.
    else rest.push(message)
  }
  if (rest.length > 0) return { fields, form: rest.join(' ') }
  // 어느 칸의 문제인지 짚었으면 "입력값이 올바르지 않습니다" 같은 전체 문구는 되풀이하지 않는다.
  return { fields, form: Object.keys(fields).length > 0 ? null : error.message }
}
