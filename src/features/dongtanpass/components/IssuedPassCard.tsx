import { useEffect, useRef } from 'react'
import { formatDate } from '@/shared/lib'
import { Card, Pill } from '@/shared/ui'
import type { IssuedPass } from '../api'
import { HolderLinkCopy } from './HolderLinkCopy'

/** 결과 카드에 쓰는 발급 응답. 연계 학원 발급과 JEY 발급의 응답에 모두 있다. */
type IssuedPassFields = Pick<IssuedPass, 'id' | 'passNo' | 'linkToken' | 'expiresOn'>

type IssuedPassCardProps = {
  /** 방금 발급한 패스와 그 학생 이름. 아직 발급하지 않았으면 null이다. */
  issued: { pass: IssuedPassFields; studentName: string } | null
  /** 잃어버린 링크를 새로 만드는 목록의 이름. 안내 문구에 쓴다. */
  listName?: string
}

/**
 * 발급 화면 오른쪽의 결과 카드. 발급하면 패스 번호와 학부모 링크를 보여 준다.
 * 링크는 발급 응답에만 있어 이 화면을 떠나면 다시 볼 수 없다. 잃어버리면 목록에서 새로 만든다.
 * 연계 학원 발급과 JEY 발급이 같이 쓴다.
 * 결과가 바뀌면 화면 낭독기가 읽도록 카드 안쪽을 미리 그려 두고 내용만 바꾼다.
 */
export function IssuedPassCard({ issued, listName = '패스 목록' }: IssuedPassCardProps) {
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
        {issued ? <Issued key={issued.pass.id} {...issued} listName={listName} /> : <Empty />}
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

function Issued({
  pass,
  studentName,
  listName,
}: {
  pass: IssuedPassFields
  studentName: string
  listName: string
}) {
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

      <HolderLinkCopy linkToken={pass.linkToken} />
      <p className="mt-3 text-left text-[13px] text-sub">
        {`이 링크는 지금만 볼 수 있어요. 잃어버리면 ${listName}에서 링크를 새로 만들어 주세요.`}
      </p>
    </>
  )
}
