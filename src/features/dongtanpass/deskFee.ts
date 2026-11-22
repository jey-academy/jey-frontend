import type { RedemptionInvoiceRequest } from '@/features/billing/api'
import { MAX_EXTRA_DISCOUNTS, validateLines } from '@/features/billing/invoiceInput'

/**
 * 데스크 신규 등록 폼 아래 "이번 달 수강료" 칸의 입력(#228). 칸에 적힌 글자 그대로다.
 * 반은 따로 고르지 않고 등록 폼에서 고른 반을 쓴다(반 나눔은 사용 내역의 청구 만들기 화면에서).
 */
export type DeskFeeInput = {
  /** `2026-11` */
  targetMonth: string
  /** 비워 두면 청구를 만들지 않는다(사용 처리까지만). */
  lessonCount: string
  /** 더 받는 할인 코드. 할인 목록의 순서대로 둔다. 패스 할인은 서버가 붙인다. */
  discountCodes: string[]
  /** 청구를 만든 뒤 그 자리에서 결제를 기록할지. 끄면 청구까지만 한다. */
  payNow: boolean
}

export type DeskFeeField = 'lessonCount' | 'discountCodes'

export function initialFee(thisMonth: string): DeskFeeInput {
  return { targetMonth: thisMonth, lessonCount: '', discountCodes: [], payNow: true }
}

/** 청구를 만들려는지. 수업 횟수를 적었으면 만든다. */
export function wantsInvoice(input: DeskFeeInput): boolean {
  return input.lessonCount.trim() !== ''
}

/** 등록 폼에서 반을 정하지 않으면 청구를 만들 수 없다(청구는 반의 수강료로 계산한다). */
export const NO_CLASS_REASON = '등록 폼에서 반을 고르면 수강료를 청구할 수 있어요.'

/**
 * 보낼 본문과 칸의 오류. 청구를 만들지 않으면(수업 횟수가 비었으면) 본문은 null이고 오류도 없다.
 * `classId`는 등록 폼의 반 칸 값(정하지 않았으면 빈 글자)이다.
 */
export function feeRequest(
  input: DeskFeeInput,
  classId: string,
): { body: RedemptionInvoiceRequest | null; errors: Partial<Record<DeskFeeField, string>> } {
  if (!wantsInvoice(input)) return { body: null, errors: {} }
  if (classId === '') return { body: null, errors: { lessonCount: NO_CLASS_REASON } }
  const [line] = validateLines([{ key: 0, classId, lessonCount: input.lessonCount }])
  if (line.lessonCount) return { body: null, errors: { lessonCount: line.lessonCount } }
  if (input.discountCodes.length > MAX_EXTRA_DISCOUNTS) {
    return {
      body: null,
      errors: { discountCodes: `추가 할인은 ${MAX_EXTRA_DISCOUNTS}개까지 고를 수 있어요.` },
    }
  }
  return {
    body: {
      targetMonth: input.targetMonth,
      // 앞뒤 공백은 Number가 무시한다(위 검사는 공백을 뗀 글자로 했다).
      lines: [{ classId: Number(classId), lessonCount: Number(input.lessonCount) }],
      discountCodes: input.discountCodes,
    },
    errors: {},
  }
}
