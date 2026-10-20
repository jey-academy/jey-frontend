/**
 * 배포 뒤 옛 탭에서 화면 파일을 받지 못했을 때 한 번만 새로고침한다(#154).
 *
 * 화면 코드는 그 주소에 처음 갈 때 받는다(router의 lazy). 배포 전에 연 탭은 옛 index.html이 가리키는 옛 파일 이름을
 * 알고 있어서, 그 파일이 없으면 받지 못한다. 새로고침하면 새 index.html과 새 파일 이름을 받는다.
 * 배포는 지난 파일을 7일 동안 남겨 두므로 대개 여기까지 오지 않는다. 그보다 오래 연 탭을 위한 것이다.
 *
 * 새로고침해도 또 실패하면(파일이 정말 없거나 연결이 끊김) 되풀이하지 않는다. 그때는 에러 화면(RouteErrorPage)이 안내한다.
 */

/** 새로고침한 시각을 적어 두는 sessionStorage 키 */
export const PRELOAD_RELOAD_KEY = 'jey:preload-reload-at'

/** 이 안에 다시 실패하면 새로고침하지 않는다. 새로고침이 끝나고 화면을 다시 받기까지 넉넉히 잡는다. */
export const PRELOAD_RELOAD_WINDOW_MS = 60_000

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem'>

/**
 * 지금 새로고침할지. 할 것이면 그 시각을 적어 둔다.
 * 저장소를 쓸 수 없으면(사생활 보호 모드 등) 되풀이를 막을 수 없으므로 새로고침하지 않는다.
 */
export function claimPreloadReload(storage: SessionStorageLike | null, now: number): boolean {
  if (!storage) return false
  try {
    const last = Number(storage.getItem(PRELOAD_RELOAD_KEY))
    if (Number.isFinite(last) && last > 0 && now - last < PRELOAD_RELOAD_WINDOW_MS) return false
    storage.setItem(PRELOAD_RELOAD_KEY, String(now))
    return true
  } catch {
    return false
  }
}

/** sessionStorage. 접근만으로 예외가 나는 환경이 있다(저장소가 막힌 브라우저). */
function sessionStorageOrNull(): SessionStorageLike | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * Vite가 화면 파일을 받지 못했다고 알리면(`vite:preloadError`) 한 번 새로고침한다.
 * 새로고침하기로 했으면 그 에러를 막는다(preventDefault). 막지 않으면 에러가 화면까지 올라가 에러 화면이 잠깐 보인다.
 */
export function watchPreloadError(reload: () => void = () => window.location.reload()) {
  window.addEventListener('vite:preloadError', (event) => {
    if (!claimPreloadReload(sessionStorageOrNull(), Date.now())) return
    event.preventDefault()
    reload()
  })
}
