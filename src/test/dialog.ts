import { beforeEach } from 'vitest'

/**
 * 모달(`<dialog>`)이 들어 있는 화면을 테스트할 때 파일 맨 위에서 한 번 부른다.
 * jsdom에는 showModal과 close가 없어서 여닫는 동작만 흉내 낸다. (jsdom이 지원하게 되면 지운다.)
 * 포커스 가두기와 Esc 키 처리는 흉내 내지 않는다. Modal 자체의 동작은 Modal.test.tsx가 본다.
 */
export function setupDialog() {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    }
  })
}
