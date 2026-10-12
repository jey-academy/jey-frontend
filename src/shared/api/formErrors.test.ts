import { expect, test } from 'vitest'
import { ApiError } from './error'
import { splitServerError } from './formErrors'

type Field = 'code' | 'name' | 'rate'

const options = {
  fields: ['code', 'name', 'rate'] as Field[],
  codes: { CAMPUS_DISCOUNT_CODE_DUPLICATED: 'code' as const },
}

function validationError(errors: { field: string | null; message: string }[]) {
  return new ApiError({
    kind: 'http',
    status: 400,
    problem: { detail: '입력값이 올바르지 않습니다.', code: 'COMMON_VALIDATION_FAILED', errors },
  })
}

test('ApiError가 아닌 에러는 일반 문구로 알린다', () => {
  expect(splitServerError(new TypeError('x is not a function'), options)).toEqual({
    fields: {},
    form: '저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
  })
})

test.each([
  ['연결 끊김', new ApiError({ kind: 'network' }), '연결 상태를 확인해 주세요.'],
  ['시간 초과', new ApiError({ kind: 'timeout' }), '응답이 늦어지고 있어요.'],
  // 서버는 성공으로 답했는데 본문을 읽지 못한 경우
  ['읽지 못한 응답', new ApiError({ kind: 'parse', status: 200 }), '일시적인 문제가 생겼어요.'],
  // 서버 오류도 저장은 끝났을 수 있다. 중간 서버가 끊은 경우(502·504)가 그렇다.
  ['서버 오류', new ApiError({ kind: 'http', status: 500 }), '일시적인 문제가 생겼어요.'],
  ['중간 서버 오류', new ApiError({ kind: 'http', status: 502 }), '일시적인 문제가 생겼어요.'],
])('결과를 알 수 없는 에러(%s)는 저장됐을 수 있다고 덧붙인다', (_name, error, message) => {
  const { fields, form } = splitServerError(error, options)

  expect(fields).toEqual({})
  expect(form).toContain(message)
  expect(form).toMatch(/저장됐을 수도 있으니, 다시 저장하기 전에 목록을 먼저 확인해 주세요\.$/)
})

test.each([
  [
    '아직 처리 중(409)',
    409,
    'COMMON_IDEMPOTENCY_IN_PROGRESS',
    '앞서 보낸 요청을 아직 처리하고 있어요. 내용은 고치지 말고 잠시 뒤 다시 눌러 주세요.',
  ],
  [
    '키를 다른 내용에 다시 씀(422)',
    422,
    'COMMON_IDEMPOTENCY_KEY_REUSED',
    '요청을 처리하지 못했어요. 다시 눌러 주세요.',
  ],
  [
    '키 없음(400)',
    400,
    'COMMON_IDEMPOTENCY_KEY_REQUIRED',
    '요청을 처리하지 못했어요. 문제가 계속되면 관리자에게 알려 주세요.',
  ],
])('멱등 키 오류(%s)는 서버 문구 대신 할 일을 폼 아래에 알린다', (_name, status, code, message) => {
  const error = new ApiError({
    kind: 'http',
    status,
    problem: { detail: 'Idempotency-Key 헤더에 관한 서버 문구', code },
  })

  // 코드를 칸에 이어 둔 폼이어도 칸이 아니라 폼 아래에 보여준다.
  expect(splitServerError(error, { ...options, codes: { [code]: 'name' as const } })).toEqual({
    fields: {},
    form: message,
  })
})

test('코드로 칸을 알 수 있는 에러는 그 칸에 보여준다', () => {
  const error = new ApiError({
    kind: 'http',
    status: 409,
    problem: {
      detail: '같은 코드의 할인 유형이 이미 있습니다.',
      code: 'CAMPUS_DISCOUNT_CODE_DUPLICATED',
    },
  })

  expect(splitServerError(error, options)).toEqual({
    fields: { code: '같은 코드의 할인 유형이 이미 있습니다.' },
    form: null,
  })
  // 코드와 칸을 이어 주지 않은 폼에서는 폼 아래에 보여준다.
  expect(splitServerError(error, { fields: options.fields })).toEqual({
    fields: {},
    form: '같은 코드의 할인 유형이 이미 있습니다.',
  })
})

test.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
  '에러 코드가 객체의 기본 속성 이름(%s)이어도 문구를 잃지 않는다',
  (code) => {
    const error = new ApiError({ kind: 'http', status: 400, problem: { detail: '안내', code } })

    expect(splitServerError(error, options)).toEqual({ fields: {}, form: '안내' })
  },
)

test('필드 오류는 칸별로 나누고, 칸을 짚었으면 전체 문구를 되풀이하지 않는다', () => {
  const error = validationError([
    { field: 'name', message: '공백일 수 없습니다' },
    { field: 'rate', message: '형식이 올바르지 않습니다.' },
  ])

  expect(splitServerError(error, options)).toEqual({
    fields: { name: '공백일 수 없습니다', rate: '형식이 올바르지 않습니다.' },
    form: null,
  })
})

test('한 칸에 오류가 여럿이면 그 칸에 이어 붙인다', () => {
  const error = validationError([
    { field: 'code', message: '공백일 수 없습니다' },
    { field: 'code', message: '대문자로 시작해야 합니다' },
  ])

  expect(splitServerError(error, options)).toEqual({
    fields: { code: '공백일 수 없습니다 대문자로 시작해야 합니다' },
    form: null,
  })
})

test('이 폼에 없는 칸의 오류와 칸을 짚지 않은 오류는 폼 아래에 모은다', () => {
  const error = validationError([
    { field: 'name', message: '공백일 수 없습니다' },
    { field: 'active', message: '널이어서는 안됩니다' },
    { field: null, message: '함께 확인해 주세요.' },
  ])

  expect(splitServerError(error, options)).toEqual({
    fields: { name: '공백일 수 없습니다' },
    form: '널이어서는 안됩니다 함께 확인해 주세요.',
  })
})

test('칸을 하나도 짚지 못했으면 서버의 전체 문구를 보여준다', () => {
  const notFound = new ApiError({
    kind: 'http',
    status: 404,
    problem: { detail: '할인 유형을 찾을 수 없습니다.', code: 'CAMPUS_DISCOUNT_TYPE_NOT_FOUND' },
  })

  expect(splitServerError(notFound, options)).toEqual({
    fields: {},
    form: '할인 유형을 찾을 수 없습니다.',
  })
  expect(splitServerError(validationError([]), options)).toEqual({
    fields: {},
    form: '입력값이 올바르지 않습니다.',
  })
})

test('저장됐는지 알 수 없을 때 덧붙일 말을 폼이 정할 수 있다', () => {
  const { form } = splitServerError(new ApiError({ kind: 'network' }), {
    ...options,
    unsure: '그대로 다시 저장해도 돼요.',
  })

  expect(form).toBe('연결 상태를 확인해 주세요. 그대로 다시 저장해도 돼요.')
})

test.each([
  [900, '요청이 너무 많아요. 약 15분 뒤에 다시 시도해 주세요.'],
  [undefined, '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.'],
])(
  '요청이 너무 많다는 답(429, Retry-After %s)은 칸이 아니라 폼 아래에 언제 풀리는지 알린다',
  (seconds, message) => {
    const error = new ApiError({
      kind: 'http',
      status: 429,
      problem: {
        detail: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        code: 'MEMBER_PHONE_CHANGE_LIMITED',
        // 입력이 틀렸다는 뜻이 아니다. 서버가 칸을 짚어 줘도 칸에 표시하지 않는다.
        errors: [{ field: 'name', message: '칸 오류' }],
      },
      ...(seconds === undefined ? {} : { retryAfterSeconds: seconds }),
    })

    expect(
      splitServerError(error, {
        ...options,
        codes: { MEMBER_PHONE_CHANGE_LIMITED: 'name' as const },
      }),
    ).toEqual({ fields: {}, form: message })
  },
)
