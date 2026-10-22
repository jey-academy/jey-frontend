export const STUDENTS_PATH = '/desk/students'

export function studentPath(id: number): string {
  return `${STUDENTS_PATH}/${id}`
}

export function studentEditPath(id: number): string {
  return `${STUDENTS_PATH}/${id}/edit`
}

/** 주소의 id를 읽는다. 1 이상의 정수(15자리까지)가 아니면 null이다(서버에 묻지 않고 없는 자료로 본다). */
export function parseRecordId(value: string | null | undefined): number | null {
  if (value === undefined || value === null || !/^\d{1,15}$/.test(value)) return null
  const id = Number(value)
  return id > 0 ? id : null
}

/** 주소의 학생 id를 읽는다. 규칙은 parseRecordId와 같다(맞지 않으면 없는 학생으로 본다). */
export function parseStudentId(value: string | undefined): number | null {
  return parseRecordId(value)
}

/** 데스크 패스 사용 내역. 청구를 만들거나 다시 만들 사용 기록을 여기서 고른다. */
export const REDEMPTIONS_PATH = '/desk/dongtanpass/redemptions'

/** 패스 사용 기록에서 수강료 청구를 만드는 화면. 사용 처리 완료 화면과 패스 사용 내역이 이 주소로 보낸다. */
export const REDEMPTION_INVOICE_PATH = '/desk/billing/new'

/** 데스크 수납. 그 달 청구 목록이다(상단 탭 "수납"). */
export const BILLING_PATH = '/desk/billing'

/** 데스크 수납의 결제 목록(하루 정산 대조). */
export const PAYMENTS_PATH = '/desk/billing/payments'

/** 그 달(`2026-11`) 청구 목록. 지점을 주면 관리자는 그 지점만 본다(직원은 주소의 지점을 무시하고 소속 지점을 본다). */
export function invoiceListPath(month: string, campusId?: number): string {
  const params = new URLSearchParams({ month })
  if (campusId !== undefined) params.set('campusId', String(campusId))
  return `${BILLING_PATH}?${params.toString()}`
}

/** 청구 상세(결제 기록·취소). 청구를 만든 뒤, 그리고 수납 목록·패스 사용 내역에서 이 주소로 연다. */
export function invoicePath(id: number): string {
  return `/desk/billing/invoices/${id}`
}

/** 그 사용 기록(redemptionId)의 청구를 만드는 화면. 학생은 화면이 사용 기록에서 읽는다. */
export function redemptionInvoicePath(redemptionId: number): string {
  return `${REDEMPTION_INVOICE_PATH}?redemptionId=${redemptionId}`
}

/** JEY 발급 목록(관리자). 학생 상세와 발급 화면이 이 주소로 보낸다. */
export const CAMPUS_PASSES_PATH = '/admin/passes'

/** JEY 발급 목록. `studentId`를 주면 그 학생의 패스만 본다. */
export function campusPassesPath(studentId?: number): string {
  return studentId === undefined
    ? CAMPUS_PASSES_PATH
    : `${CAMPUS_PASSES_PATH}?studentId=${studentId}`
}

/** 그 학생에게 JEY 패스를 발급하는 화면 */
export function campusPassIssuePath(studentId: number): string {
  return `${CAMPUS_PASSES_PATH}/new?studentId=${studentId}`
}
