import { onTestFinished, vi } from 'vitest'

/** 내려받기를 흉내 낸다. 저장한 파일의 이름과 내용을 돌려준다. */
export function captureSave() {
  const saved: { name: string; blob: Blob }[] = []
  const blobs = new Map<string, Blob>()
  // 진짜 URL을 이어받아 `new URL(...)`은 그대로 쓰게 하고, 파일 주소를 만드는 두 함수만 바꾼다.
  // 일반 객체로 바꾸면 라우터가 화면 코드를 받는 동안 `new URL`을 부르다 깨진다.
  class FakeURL extends URL {
    static createObjectURL = (blob: Blob) => {
      const url = `blob:test/${blobs.size}`
      blobs.set(url, blob)
      return url
    }
    static revokeObjectURL = vi.fn()
  }
  vi.stubGlobal('URL', FakeURL)
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push({ name: this.download, blob: blobs.get(this.getAttribute('href') ?? '')! })
  })
  onTestFinished(() => click.mockRestore())
  return saved
}
