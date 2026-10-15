/**
 * 값의 표시 이름을 찾는다. 모르는 값이면 받은 값을 그대로 돌려준다.
 * 타입은 생성한 시점의 것이라, 서버가 값을 먼저 추가하면 모르는 값이 들어온다. 그때 빈칸이나 다른 뜻의 표시가 되지 않게 한다.
 * 객체에 원래 있는 이름(constructor, toString 등)과 겹치는 값도 표시 이름으로 잘못 찾지 않는다(Object.hasOwn).
 */
export function labelOf(labels: Record<string, string>, value: string): string {
  return Object.hasOwn(labels, value) ? labels[value] : value
}
