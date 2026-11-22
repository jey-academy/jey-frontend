import {
  ApiError,
  NO_SERVER_ERRORS,
  splitServerError,
  UNSURE_RESEND_AS_IS,
  type ServerErrors,
} from '@/shared/api'

/**
 * 패스 사용 기록에서 청구 만들기의 거부 규칙. 사용 내역에서 들어오는 청구 만들기 화면과
 * 데스크의 한 화면 흐름(#228)이 같이 쓴다. 같은 오류에 같은 문구를 보이게 한다.
 */

export const ALREADY_INVOICED = 'DONGTANPASS_REDEMPTION_ALREADY_INVOICED'
export const REDEMPTION_NOT_FOUND = 'DONGTANPASS_REDEMPTION_NOT_FOUND'
export const PASS_DISCOUNT_INACTIVE = 'DONGTANPASS_DISCOUNT_INACTIVE'
/** 그 달에 학생의 다른 청구(일반 청구 등)가 이미 있다. 오류 본문에 그 청구의 번호(`invoiceId`)가 실릴 수 있다. */
export const MONTH_ALREADY_INVOICED = 'BILLING_INVOICE_ALREADY_EXISTS'

/** 입력칸의 이름. 요청 본문의 필드 이름과 같아야 서버가 짚은 칸에 오류가 붙는다. */
export const REDEMPTION_INVOICE_FIELDS = ['targetMonth', 'lines', 'discountCodes'] as const
export type RedemptionInvoiceField = (typeof REDEMPTION_INVOICE_FIELDS)[number]

export const CLASS_REJECTIONS = new Set([
  'BILLING_CLASS_NOT_FOUND',
  'BILLING_CLASS_INACTIVE',
  'BILLING_CLASS_NOT_AT_STUDENT_CAMPUS',
])
export const DISCOUNT_REJECTIONS = new Set([
  'BILLING_DISCOUNT_TYPE_NOT_FOUND',
  'BILLING_DISCOUNT_TYPE_INACTIVE',
  'BILLING_TOO_MANY_DISCOUNTS',
  'BILLING_DISCOUNT_TOO_LARGE',
  'BILLING_DISCOUNT_DUPLICATED',
  'BILLING_DISCOUNT_NEEDS_REFERENCE',
])
/** 학생 자료 때문에 만들 수 없다는 답. */
export const STUDENT_REJECTIONS = new Set([
  'BILLING_STUDENT_NOT_FOUND',
  'BILLING_STUDENT_NOT_ENROLLED',
  'DONGTANPASS_STUDENT_NOT_FOUND',
])

const codeFields: Record<string, RedemptionInvoiceField> = {
  ...Object.fromEntries([...CLASS_REJECTIONS].map((code) => [code, 'lines'])),
  ...Object.fromEntries([...DISCOUNT_REJECTIONS].map((code) => [code, 'discountCodes'])),
  [MONTH_ALREADY_INVOICED]: 'targetMonth',
}

/**
 * 청구 만들기의 실패를 칸별 문구와 폼 전체 문구로 나눈다.
 * 응답을 받지 못했으면 "그대로 다시 보내기"를 안내한다(같은 키로 나가 두 번 만들어지지 않는다).
 */
export function redemptionInvoiceErrors(error: unknown): ServerErrors<RedemptionInvoiceField> {
  if (error === null) return NO_SERVER_ERRORS
  if (error instanceof ApiError && error.code === PASS_DISCOUNT_INACTIVE) {
    return {
      fields: {},
      // 서버 문구는 사용 처리용("사용 처리할 수 없습니다")이다.
      form: '패스 할인이 꺼져 있어 청구를 만들 수 없어요. 관리자에게 알려 주세요.',
      requestId: null,
    }
  }
  return splitServerError(error, {
    fields: REDEMPTION_INVOICE_FIELDS,
    codes: codeFields,
    unsure: UNSURE_RESEND_AS_IS,
  })
}
