import type { HolderCheckResult } from './api'

/** 본인 확인 결과를 한 문장으로. 결과가 나오면 화면 낭독기에 알리는 데 쓴다. */
export function holderCheckSummary(result: HolderCheckResult): string {
  const name = result.nameMatches ? '학생 이름 맞음' : '학생 이름 맞지 않음'
  const phone = result.phoneMatches ? '학부모 번호 맞음' : '학부모 번호 맞지 않음'
  return `본인 확인 결과: ${name}, ${phone}`
}
