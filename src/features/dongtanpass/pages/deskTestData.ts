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

/** 쓸 수 있는 패스면 신규 등록 폼이 지점·반 목록을 받는다. 테스트 안에서 부른다. */
export function mockLookups() {
  mockApi({
    'GET /api/v1/campuses': () => jsonResponse(campuses),
    'GET /api/v1/classes': () => jsonResponse(classes),
  })
}
