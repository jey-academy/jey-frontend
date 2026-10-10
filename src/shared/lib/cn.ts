/** 조건부 클래스 이름을 하나의 문자열로 합친다. false·null·undefined는 버린다. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
