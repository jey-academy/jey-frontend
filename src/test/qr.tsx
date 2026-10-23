import { render } from '@testing-library/react'
import { QrCode } from '@/shared/ui'

/** QR 그림의 경로(`d`). 같은 값을 담은 QR이면 같다. */
export function qrPath(img: Element) {
  return img.querySelector('path')?.getAttribute('d')
}

/** 그 값을 담은 QR의 경로. 화면의 QR이 이 값을 담았는지 비교할 때 쓴다. */
export function qrPathOf(value: string) {
  const { container, unmount } = render(<QrCode value={value} label="비교용 QR" />)
  const d = qrPath(container)
  unmount()
  return d
}
