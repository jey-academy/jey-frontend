import { useEffect, useRef, useState } from 'react'
import { Button, Notice } from '@/shared/ui'

/** "복사했어요"를 보여 주는 시간 */
const COPIED_MS = 1400

/** 학부모가 패스를 여는 주소. 토큰은 이 주소에만 넣고 화면 밖(콘솔 등)에 남기지 않는다. */
function holderLink(linkToken: string) {
  return `${window.location.origin}/p/${encodeURIComponent(linkToken)}`
}

/**
 * 학부모 링크 칸과 "링크 복사" 버튼. 발급 결과 카드와 장부의 "링크 새로 만들기" 창이 같이 쓴다.
 * 복사가 막히면(권한, http 주소) 칸을 눌러 직접 복사하게 안내한다.
 * 토큰이 바뀌면 key로 새로 그린다. 앞 링크의 복사 결과가 남지 않게 한다.
 */
export function HolderLinkCopy({ linkToken }: { linkToken: string }) {
  const link = holderLink(linkToken)
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copyLink() {
    window.clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(link)
      setCopy('copied')
      timer.current = window.setTimeout(() => setCopy('idle'), COPIED_MS)
    } catch {
      // 권한이 없거나 안전하지 않은 주소(http)면 복사가 막힌다. 링크는 칸에 있으니 직접 복사하게 한다.
      setCopy('failed')
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 rounded-sm bg-field py-1.5 pr-1.5 pl-3">
        <input
          readOnly
          value={link}
          aria-label="학부모 링크"
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-sub outline-hidden"
        />
        <Button size="sm" onClick={copyLink}>
          {copy === 'copied' ? '복사했어요' : '링크 복사'}
        </Button>
      </div>
      {copy === 'failed' && (
        <Notice className="mt-3 text-left">
          링크를 복사하지 못했어요. 링크 칸을 눌러 직접 복사해 주세요.
        </Notice>
      )}
    </>
  )
}
