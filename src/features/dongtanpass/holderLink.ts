/** 학부모가 패스를 여는 주소. 토큰은 이 주소에만 넣고 화면 밖(콘솔 등)에 남기지 않는다. 링크 칸과 링크 QR이 같이 쓴다. */
export function holderLink(linkToken: string) {
  return `${window.location.origin}/p/${encodeURIComponent(linkToken)}`
}
