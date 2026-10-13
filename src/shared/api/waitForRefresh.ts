// 저장한 뒤 새 목록을 기다리는 시간의 상한.
// 평소에는 목록이 금방 와서 닿지 않는다. 목록이 늦거나 다시 보내는 중일 때 창을 풀어 주는 값이다.
const REFRESH_WAIT_MS = 3_000

/**
 * 저장에 성공한 뒤 새 목록을 기다린다. 다만 상한(3초)까지만 기다린다.
 *
 * 기다리는 까닭: 창이 닫힐 때 목록이 이미 서버와 같은 내용이게 한다.
 *
 * 상한을 두는 까닭: 저장은 이미 끝났다. 목록 요청은 오래 걸릴 수 있다(요청 하나의 제한 시간이 10초이고,
 * 연결 실패와 서버 오류는 몇 번 다시 보낸다). 그동안 창을 "저장하는 중"으로 잠가 두면 닫을 수도 없다.
 * 상한을 넘기면 기다리지 않는다. 목록은 뒤에서 계속 받고, 그동안 화면은 표를 흐리게 해서 받는 중임을 알린다
 * (shared/ui의 Table `refreshing`).
 *
 * 상한을 넘겨 닫힌 뒤에도 표가 옛 값이면 안 된다. 그 줄을 다시 고치면 옛 값이 폼에 채워져 저장한 것을 되돌린다.
 * 그래서 이 함수를 쓰는 쪽은 저장 응답을 목록에 먼저 넣거나(설정), 고칠 때 대상을 새로 받는다(계정).
 *
 * 목록을 받지 못해도 거부하지 않는다. 그 실패는 목록 쪽의 안내로 보인다.
 */
export function waitForRefresh(refreshed: Promise<unknown>): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, REFRESH_WAIT_MS)
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    refreshed.then(done, done)
  })
}
