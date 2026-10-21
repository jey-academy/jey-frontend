import { PASS_DISCOUNT_CODE, type DiscountType, type RedemptionInvoiceRequest } from './api'

/** 반 나눔은 4개 반까지(서버 상한). */
export const MAX_LINES = 4
/**
 * 직원이 더 고르는 할인은 3개까지. 서버 상한(4개)에서 패스 할인 하나를 뺀 것이다.
 * 요청 크기의 상한일 뿐이다. 할인 방식이 SINGLE이면 추가 할인은 서버가 거부한다(BILLING_TOO_MANY_DISCOUNTS).
 */
export const MAX_EXTRA_DISCOUNTS = 3

/** 한 반의 입력. 칸에 적힌 글자 그대로다. `key`는 줄을 지우고 더해도 React가 칸을 헷갈리지 않게 하는 값이다. */
export type LineInput = { key: number; classId: string; lessonCount: string }

export type InvoiceInput = {
  /** `2026-11` */
  targetMonth: string
  lines: LineInput[]
  /** 고른 할인 유형 코드. 할인 목록의 순서대로 둔다(순차 방식이면 순서가 금액을 바꾼다). */
  discountCodes: string[]
}

/** 줄마다의 오류. 칸 이름이 키다. */
export type LineErrors = Partial<Record<'classId' | 'lessonCount', string>>

/** `2026-10-21` → 그달 `2026-10`과 다음 달 `2026-11`. 대상 월은 이 둘 중에서 고른다. */
export function monthChoices(today: string): [string, string] {
  const [year, month] = today.split('-').map(Number)
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
  return [today.slice(0, 7), next]
}

/** `2026-11` → `2026년 11월` */
export function formatMonth(month: string): string {
  const [year, value] = month.split('-')
  return `${year}년 ${Number(value)}월`
}

/**
 * 할인 이름 뒤에 비율을 붙인다(`형제 할인` → `형제 할인 5%`). 이름에 같은 비율이 이미 있으면 그대로 둔다.
 * 비율은 formatPercent로 바꾼 글자다(이 함수는 계산하지 않는다).
 */
export function discountLabel(name: string, percent: string): string {
  // "15%"나 "2.5%" 안의 "5%"는 같은 비율이 아니다. 앞 글자가 숫자나 점이면 다른 숫자의 일부로 본다.
  const escaped = percent.replace(/[.%]/g, (char) => `\\${char}`)
  return new RegExp(`(^|[^\\d.])${escaped}`).test(name) ? name : `${name} ${percent}`
}

/** 직원이 고를 수 있는 할인. 켜진 것만, 패스 할인은 뺀다(대소문자 무관 — 서버도 가리지 않는다). */
export function extraDiscounts(types: DiscountType[]): DiscountType[] {
  return types.filter((type) => type.active && type.code.toUpperCase() !== PASS_DISCOUNT_CODE)
}

/** 할인을 고르거나 뺀다. 할인 목록의 순서를 지킨다. 지금 목록에 없는 코드(그사이 꺼진 할인)는 뺀다. */
export function toggleDiscount(
  input: InvoiceInput,
  code: string,
  checked: boolean,
  options: DiscountType[],
): string[] {
  const chosen = new Set(input.discountCodes)
  if (checked) chosen.add(code)
  else chosen.delete(code)
  return options.map((option) => option.code).filter((value) => chosen.has(value))
}

/** `fitToLists`의 결과. 바꾼 것이 없으면 `input`은 받은 객체 그대로다. */
export type FittedInput = {
  input: InvoiceInput
  /** 지금 목록에 없어 비운 반이 있었는지 */
  clearedClass: boolean
  /** 지금 고를 수 없어 뺀 할인 코드 */
  droppedCodes: string[]
}

/**
 * 입력을 지금 반·할인 목록에 맞춘다. 그사이 꺼진 반은 비우고(화면에는 "반 고르기"로 보이는데 옛 반이 나가지 않게),
 * 꺼진 할인은 뺀다(체크박스가 사라져 직원이 뺄 수 없게 되지 않게).
 */
export function fitToLists(
  input: InvoiceInput,
  classIds: ReadonlySet<string>,
  options: DiscountType[],
): FittedInput {
  const codes = new Set(options.map((option) => option.code))
  const droppedCodes = input.discountCodes.filter((code) => !codes.has(code))
  const clearedClass = input.lines.some(
    (line) => line.classId !== '' && !classIds.has(line.classId),
  )
  if (droppedCodes.length === 0 && !clearedClass) return { input, clearedClass, droppedCodes }
  return {
    input: {
      ...input,
      lines: input.lines.map((line) =>
        line.classId !== '' && !classIds.has(line.classId) ? { ...line, classId: '' } : line,
      ),
      discountCodes: input.discountCodes.filter((code) => codes.has(code)),
    },
    clearedClass,
    droppedCodes,
  }
}

const LESSON_COUNT = /^\d{1,2}$/

/** 칸마다 무엇이 틀렸는지. 틀린 것이 없으면 모든 줄이 빈 객체다. */
export function validateLines(lines: LineInput[]): LineErrors[] {
  const seen = new Set<string>()
  return lines.map((line) => {
    const errors: LineErrors = {}
    if (line.classId === '') errors.classId = '반을 골라 주세요.'
    else if (seen.has(line.classId)) errors.classId = '같은 반을 두 번 골랐어요.'
    seen.add(line.classId)

    const count = line.lessonCount.trim()
    if (count === '') errors.lessonCount = '수업 횟수를 적어 주세요.'
    else if (!LESSON_COUNT.test(count) || Number(count) < 1 || Number(count) > 31) {
      errors.lessonCount = '1회부터 31회까지 적을 수 있어요.'
    }
    return errors
  })
}

/** 보낼 본문. 칸이 하나라도 틀리면 null이다. */
export function toRequest(input: InvoiceInput): RedemptionInvoiceRequest | null {
  const errors = validateLines(input.lines)
  if (errors.some((line) => Object.keys(line).length > 0)) return null
  if (input.discountCodes.length > MAX_EXTRA_DISCOUNTS) return null
  return {
    targetMonth: input.targetMonth,
    lines: input.lines.map((line) => ({
      classId: Number(line.classId),
      // 앞뒤 공백은 Number가 무시한다(위 검사는 공백을 뗀 글자로 했다).
      lessonCount: Number(line.lessonCount),
    })),
    discountCodes: input.discountCodes,
  }
}
