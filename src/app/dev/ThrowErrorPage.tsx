import { formatWon } from '@/shared/lib'

// 개발 서버 전용. 잘못된 금액을 표시하려다 에러가 나는 상황을 만들어 에러 화면을 확인한다.
export function ThrowErrorPage() {
  return <p>{formatWon(299250.5)}</p>
}
