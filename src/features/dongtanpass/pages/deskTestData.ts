import type { DiscountType } from '@/features/billing/api'
import type { AcademyClass, Campus } from '@/shared/campus'
import { jsonResponse, mockApi } from '@/test/mockApi'
import type { VerifiedPass } from '../api'

// 데스크 화면 테스트가 같이 쓰는 가짜 응답.

export const VERIFY = 'POST /api/v1/dongtanpass/passes/verify'
export const HOLDER_CHECK = 'POST /api/v1/dongtanpass/passes/42/holder-check'

export const pass: VerifiedPass = {
  passId: 42,
  passNo: 'DT-ABC234',
  partnerName: '햇살수학',
  studentName: '김*윤',
  issuedOn: '2026-10-16',
  expiresOn: '2026-11-16',
  discountRate: 0.05,
}

const campuses: Campus[] = [
  { id: 1, name: '동탄관' },
  { id: 2, name: '능동관' },
]
const classes: AcademyClass[] = [{ id: 10, campusId: 1, name: '중1 정규' }]

export const DISCOUNTS = 'GET /api/v1/discount-types'

/** 할인 유형. 패스 할인은 직원이 고르는 목록에 없다(서버가 붙인다). 꺼진 할인도 온다. */
export const discountTypes: DiscountType[] = [
  { id: 1, code: 'DONGTAN_PASS', name: '제이G패스', rate: 0.05, active: true },
  { id: 2, code: 'SIBLING_5', name: '형제 할인', rate: 0.05, active: true },
  { id: 3, code: 'OLD_10', name: '지난 행사 할인', rate: 0.1, active: false },
]

/** 쓸 수 있는 패스면 신규 등록 폼이 지점·반 목록과 수강료 칸의 할인 목록을 받는다. 테스트 안에서 부른다. */
export function mockLookups() {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/classes': () => jsonResponse(classes),
    [DISCOUNTS]: () => jsonResponse(discountTypes),
  })
}
