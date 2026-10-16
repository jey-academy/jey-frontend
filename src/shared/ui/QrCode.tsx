import { useMemo } from 'react'
import qrcode from 'qrcode-generator'
import { cn } from '@/shared/lib/cn'

type QrCodeProps = {
  /** QR에 담을 문자열 */
  value: string
  /** 화면 낭독기가 읽는 이름 (예: "패스 QR") */
  label: string
  className?: string
}

/** 문자열을 QR로 바꿔 칸마다 작은 사각형을 이어 붙인 SVG 경로로 만든다. 둘레에 한 칸 여백을 둔다. */
function toQrPath(value: string) {
  // 0은 담을 글자 수에 맞춰 크기를 고르라는 뜻이다. 오류 정정은 프로토타입과 같은 M(약 15%).
  const qr = qrcode(0, 'M')
  qr.addData(value)
  qr.make()
  const size = qr.getModuleCount()
  let d = ''
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`
    }
  }
  return { size, d }
}

/** QR 그림. 크기는 부모 폭을 따른다. */
export function QrCode({ value, label, className }: QrCodeProps) {
  // 같은 값이면 다시 계산하지 않는다(QR이 바뀔 때만 새로 만든다).
  const { size, d } = useMemo(() => toQrPath(value), [value])

  return (
    <svg
      viewBox={`-1 -1 ${size + 2} ${size + 2}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      className={cn('block w-full', className)}
    >
      <path d={d} className="fill-night" />
    </svg>
  )
}
