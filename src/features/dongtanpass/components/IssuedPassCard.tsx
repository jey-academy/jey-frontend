import { useEffect, useRef, useState } from 'react'
import { formatDate } from '@/shared/lib'
import { Button, Card, Notice, Pill } from '@/shared/ui'
import type { IssuedPass } from '../api'

type IssuedPassCardProps = {
  /** 방금 발급한 패스와 그때 적은 학생 이름. 아직 발급하지 않았으면 null이다. */
  issued: { pass: IssuedPass; studentName: string } | null
}

/** "복사했어요"를 보여 주는 시간 */
const COPIED_MS = 1400

/** 학부모가 패스를 여는 주소. 토큰은 이 주소에만 넣고 화면 밖(콘솔 등)에 남기지 않는다. */
function holderLink(linkToken: string) {
  return `${window.location.origin}/p/${encodeURIComponent(linkToken)}`
}

/**
 * 발급 화면 오른쪽의 결과 카드. 발급하면 패스 번호와 학부모 링크를 보여 준다.
 * 링크는 발급 응답에만 있어 이 화면을 떠나면 다시 볼 수 없다. 잃어버리면 장부에서 새로 만든다.
 * 결과가 바뀌면 화면 낭독기가 읽도록 카드 안쪽을 미리 그려 두고 내용만 바꾼다.
 */
export function IssuedPassCard({ issued }: IssuedPassCardProps) {
  const live = useRef<HTMLDivElement>(null)

  // 좁은 화면에서는 이 카드가 폼 아래에 있다. 발급하면 링크를 놓치지 않도록 카드가 보이게 하고,
  // 포커스를 "링크 복사"로 옮긴다. 발급 버튼은 동의가 풀리며 막혀, 그대로 두면 포커스가 문서 맨 위로 빠진다.
  // 포커스는 다음 차례에 옮긴다. 지금은 확인 창이 아직 열려 있어 바깥 화면이 막혀(inert) 포커스를 받지 못한다.
  // 창은 같은 차례에 닫힌다(Chrome에서 확인했다). (jsdom에는 scrollIntoView가 없다.)
  useEffect(() => {
    if (!issued) return
    live.current?.scrollIntoView?.({ block: 'nearest' })
    const timer = window.setTimeout(() => {
      live.current?.querySelector('button')?.focus({ preventScroll: true })
    })
    return () => window.clearTimeout(timer)
  }, [issued])

  return (
    <Card className="text-center">
      <div ref={live} aria-live="polite">
        {/* 패스마다 새로 그린다. 앞 패스의 복사 결과("복사하지 못했어요")가 남지 않게 한다. */}
        {issued ? <Issued key={issued.pass.id} {...issued} /> : <Empty />}
      </div>
    </Card>
  )
}

function Empty() {
  return (
    <div className="px-2.5 py-14 text-[15px] text-sub">
      <div className="mx-auto mb-3.5 size-[120px] rounded-md border-2 border-dashed border-line" />
      발급하면 여기에 학부모 링크가 나와요.
    </div>
  )
}

function Issued({ pass, studentName }: { pass: IssuedPass; studentName: string }) {
  const link = holderLink(pass.linkToken)
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
      <h2 className="sr-only">발급 결과</h2>
      <Pill status="valid">발급 완료</Pill>
      <div className="mt-4 text-[22px] font-extrabold tracking-[0.06em] tabular-nums">
        <span className="sr-only">패스 번호 </span>
        {pass.passNo}
      </div>
      <p className="mt-0.5 mb-4 text-[14px] text-sub tabular-nums">
        {`${studentName} 학생 · ${formatDate(pass.expiresOn)}까지 사용 가능`}
      </p>

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
      <p className="mt-3 text-left text-[13px] text-sub">
        이 링크는 지금만 볼 수 있어요. 잃어버리면 발급 장부에서 링크를 새로 만들어 주세요.
      </p>
    </>
  )
}
