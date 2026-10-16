/**
 * 받은 파일을 사용자의 기기에 저장한다(브라우저의 내려받기). 쿠키를 실은 fetch로 받은 파일에 쓴다.
 * 링크(`<a href>`)로 바로 받게 하면 오류가 났을 때 화면이 오류 본문으로 바뀌고 무엇이 잘못됐는지 보여 줄 수 없다.
 */
export function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  // 문서에 붙여야 누르기가 먹는 브라우저(Firefox 예전 판)가 있다.
  document.body.append(link)
  link.click()
  link.remove()
  // 바로 풀면 내려받기가 시작되기 전에 주소가 사라지는 브라우저가 있다. 다음 차례에 푼다.
  window.setTimeout(() => URL.revokeObjectURL(url))
}
