import { expect, test } from 'vitest'
import { ApiError } from '@/shared/api'
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
])('응답을 받지 못한 에러(%s)는 저장됐을 수 있다고 덧붙인다', (_name, error, message) => {
  const { fields, form } = splitServerError(error, options)

  expect(fields).toEqual({})
  expect(form).toContain(message)
  expect(form).toMatch(/저장됐을 수도 있으니, 창을 닫고 목록을 먼저 확인해 주세요\.$/)
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
