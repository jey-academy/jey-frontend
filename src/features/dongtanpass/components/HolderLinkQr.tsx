import { QrCode } from '@/shared/ui'
import { holderLink } from '../holderLink'

/**
 * 학부모 링크(`/p/{토큰}`)를 담은 QR. 데스크에서 학부모가 휴대폰 카메라로 찍어 패스를 바로 연다.
 * 발급 결과 카드와 "링크 새로 만들기" 창에만 둔다. 학부모 패스 화면에는 데스크가 찍는 패스 QR이 따로 있어
 * 헷갈리지 않게 거기에는 넣지 않고, 이름도 "학부모 링크 QR"로 가른다.
 */
export function HolderLinkQr({ linkToken }: { linkToken: string }) {
  return (
    <div className="mb-4">
      <div className="mx-auto w-[160px] rounded-btn border-[1.5px] border-line bg-white p-2.5">
        <QrCode value={holderLink(linkToken)} label="학부모 링크 QR" />
      </div>
      <p className="mt-2 text-[13px] text-sub">학부모님 휴대폰 카메라로 찍으면 패스가 열려요.</p>
    </div>
  )
}
