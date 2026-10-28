import { CAMPUS_PASSES_PATH } from '@/shared/paths'
import { NavTabs, type NavTabItem } from '@/shared/ui'

const items: NavTabItem[] = [
  { to: CAMPUS_PASSES_PATH, label: '발급 목록', end: true },
  { to: `${CAMPUS_PASSES_PATH}/redemptions`, label: '연계 학원 사용 내역' },
]

/** 관리자의 "제이G패스 발급" 안의 메뉴. 발급 목록과 연계 학원의 사용 내역을 오간다(설정 메뉴와 같은 모양). */
export function CampusPassTabs() {
  return <NavTabs label="제이G패스 메뉴" items={items} variant="underline" className="mb-8" />
}
