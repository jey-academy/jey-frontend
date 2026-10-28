import { useEffect, useRef, useState } from 'react'
import { Button, Notice } from '@/shared/ui'
import { holderLink } from '../holderLink'

/** "복사했어요"를 보여 주는 시간 */
const COPIED_MS = 1400

/** 공유 창에 넣는 글. 링크를 받는 사람이 누구든 보일 수 있어 학생 이름은 넣지 않는다. */
const SHARE_TITLE = '제이G패스'
const SHARE_TEXT = '제이G패스 링크예요. 학원에 가실 때 열어 보여 주세요.'

/** 이 브라우저에 공유 창(`navigator.share`)이 있는지. 없으면(데스크탑 브라우저 일부, http 주소) 버튼을 두지 않는다. */
function canShare() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/**
 * 실패가 아니라 안내하지 않는 경우. 사용자가 공유 창을 닫았거나(AbortError),
 * 공유 창이 이미 열려 있는데 또 눌렀다(InvalidStateError, 열려 있는 창은 그대로다).
 * 브라우저는 DOMException으로 알린다. Error를 이어받지 않는 환경도 있어 이름만 본다.
 */
function isShareCanceled(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error.name === 'AbortError' || error.name === 'InvalidStateError')
  )
}

/**
 * 학부모 링크 칸과 "링크 복사"·"공유하기" 버튼. 발급 결과 카드, 장부의 "링크 새로 만들기" 창,
 * 학부모 화면(새 링크를 받았을 때)이 같이 쓴다.
 * 복사가 막히면(권한, http 주소) 칸을 눌러 직접 복사하게 안내한다.
 * 공유하기는 휴대폰 공유 창(카톡·문자 등)을 연다. 공유 창이 없는 브라우저에서는 버튼이 없다.
 * 토큰이 바뀌면 key로 새로 그린다. 앞 링크의 복사·공유 결과가 남지 않게 한다.
 */
export function HolderLinkCopy({ linkToken }: { linkToken: string }) {
  const link = holderLink(linkToken)
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [shareFailed, setShareFailed] = useState(false)
  const [shareable] = useState(canShare)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copyLink() {
    window.clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(link)
      setCopy('copied')
      // 링크를 건넸다. 앞의 공유 실패 안내는 지운다.
      setShareFailed(false)
      timer.current = window.setTimeout(() => setCopy('idle'), COPIED_MS)
    } catch {
      // 권한이 없거나 안전하지 않은 주소(http)면 복사가 막힌다. 링크는 칸에 있으니 직접 복사하게 한다.
      setCopy('failed')
    }
  }

  async function shareLink() {
    // 버튼은 막지 않는다. 일부 앱 안 브라우저는 공유 창의 답을 끝내 주지 않아, 막으면 다시 누를 수 없다.
    // 창이 열려 있는 동안 또 누르면 브라우저가 InvalidStateError로 거절하고, 그건 안내하지 않는다.
    setShareFailed(false)
    try {
      await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: link })
      // 링크를 건넸다. 앞의 복사 실패 안내는 지운다.
      setCopy((current) => (current === 'failed' ? 'idle' : current))
    } catch (error) {
      if (!isShareCanceled(error)) setShareFailed(true)
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
      {shareable && (
        <Button variant="ghost" size="sm" block className="mt-2" onClick={shareLink}>
          공유하기
        </Button>
      )}
      {copy === 'failed' && (
        <Notice className="mt-3 text-left">
          링크를 복사하지 못했어요. 링크 칸을 눌러 직접 복사해 주세요.
        </Notice>
      )}
      {shareFailed && (
        <Notice className="mt-3 text-left">공유하지 못했어요. 링크 복사를 써 주세요.</Notice>
      )}
    </>
  )
}
