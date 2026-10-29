import gogumaUrl from './assets/partners/1.png'
import emsolUrl from './assets/partners/2.png'

// 연계 학원 ID(운영의 partnerId) → 로고. 받은 그림의 흰 여백만 잘라 높이 120px로 줄였다.
// 학원이 늘거나 로고가 바뀌면 여기에 더하고 다시 배포한다(관리자 업로드는 백엔드 #107, 2차).
export const partnerLogos: Record<
  number,
  { name: string; url: string; width: number; height: number }
> = {
  1: { name: '고구마국어학원', url: gogumaUrl, width: 120, height: 120 },
  2: { name: '엠솔수학학원', url: emsolUrl, width: 165, height: 120 },
}

/** 그 학원의 로고가 있으면 학원 이름을, 없으면 null. 로고를 감싼 링크의 이름으로 쓴다. */
export function partnerLogoName(partnerId: number | null | undefined): string | null {
  return partnerId == null ? null : (partnerLogos[partnerId]?.name ?? null)
}
