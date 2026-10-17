/**
 * 이 브라우저에서 카메라를 켤 수 있는지. HTTPS(또는 localhost)가 아니면 브라우저가 카메라 기능을 아예 주지 않는다.
 * 켤 수 없으면 "QR 찍기" 버튼을 숨긴다(눌러도 안 되는 버튼을 두지 않는다).
 */
export function canUseCamera(): boolean {
  return (
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
  )
}
