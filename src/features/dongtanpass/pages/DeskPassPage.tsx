import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, type BlockerFunction } from 'react-router'
import { Button, Modal, Notice } from '@/shared/ui'
import { useVerifyPass, type PassVerifyRequest } from '../api'
import { DeskDone, type DeskDoneSummary } from '../components/DeskDone'
import { DeskRegisterFlow } from '../components/DeskRegisterFlow'
import { PassLookup, type PassLookupHandle } from '../components/PassLookup'
import { blocksRoute, leaveText, SENDING_TEXT, type DeskLeaveGuard } from '../deskLeave'
import { VerifiedPassPanel } from '../components/VerifiedPassPanel'
import { deskVerifyError } from '../deskVerifyError'

/**
 * 데스크 패스 확인(`/desk/dongtanpass`, 직원·관리자). 카메라로 QR을 찍거나, 패스 번호를 치거나,
 * USB 스캐너로 QR을 찍어 확인한다. 쓸 수 있는 패스면 신규 등록 폼과 본인 확인으로 이어진다(DeskRegisterFlow).
 * 들어올 때 서버에 묻지 않는다.
 */
export function DeskPassPage() {
  const verify = useVerifyPass()
  const lookup = useRef<PassLookupHandle>(null)
  const failure = verify.error ? deskVerifyError(verify.error) : null
  // 다른 패스를 확인하기 전에 물을 것(DeskRegisterFlow가 알린다). 폼에 적은 것이 있거나, 학생만 등록하고
  // 사용 처리를 하지 못했으면 묻는다.
  const [leaveGuard, setLeaveGuard] = useState<DeskLeaveGuard>('none')
  // 사용 처리까지 끝난 패스의 요약과 그 확인(verify.submittedAt). 지금 확인 결과의 것일 때만 완료 화면을 그린다.
  // 다음 패스로 넘어가면(확인을 비우거나 새로 하면) 저절로 맞지 않게 된다. 상태를 따로 지우면 그 사이 한 번,
  // 방금 쓴 패스의 등록 폼이 다시 그려질 수 있다(확인 결과의 변화는 한 박자 늦게 온다).
  const [done, setDone] = useState<(DeskDoneSummary & { submittedAt: number }) | null>(null)
  const shownDone = done !== null && done.submittedAt === verify.submittedAt ? done : null
  // 보내는 동안 다른 패스를 확인하려 했다. "처리하는 중이에요"를 알린다.
  const [sendingNotice, setSendingNotice] = useState(false)
  // 지울지 묻는 동안 미뤄 둔 확인 요청. 창이 열려 있는 동안만 있다.
  const [held, setHeld] = useState<PassVerifyRequest | null>(null)
  // "지우고 확인"을 누른 요청. 창이 닫힌 뒤 보낸다(아래 효과).
  const confirmed = useRef<PassVerifyRequest | null>(null)

  // 검색 칸·USB 스캐너·카메라 모두 여기로 온다. 물을 것이 있으면 바로 보내지 않고 먼저 묻는다.
  // 새로 확인하면 앞 패스의 결과와 폼이 사라지기 때문이다.
  function send(request: PassVerifyRequest) {
    if (leaveGuard === 'sending') {
      setSendingNotice(true)
      return
    }
    if (leaveGuard !== 'none') {
      setHeld(request)
      return
    }
    verifyNow(request)
  }

  function verifyNow(request: PassVerifyRequest) {
    // 확인이 끝나면(성공·실패 모두) 다음 입력을 받게 칸을 정리한다(PassLookupHandle.afterVerify).
    verify.mutate(request, {
      onSettled: (_data, _error, sent) => lookup.current?.afterVerify(sent),
    })
  }

  // "지우고 확인": 창이 실제로 닫힌 뒤(Modal의 효과 뒤)에 보낸다. 창이 열려 있는 동안에는 바깥이 막혀 있어,
  // 확인이 끝난 뒤 검색 칸으로 포커스를 돌리지 못한다.
  useEffect(() => {
    if (held !== null || confirmed.current === null) return
    const request = confirmed.current
    confirmed.current = null
    verifyNow(request)
  })

  // 창이 닫히는 사이 물을 것이 바뀌어도 문구가 비지 않게 typed 문구를 둔다.
  const leave = leaveText(leaveGuard === 'registered' ? 'registered' : 'typed', 'check')

  // 학생만 등록됐거나 보내는 중이면 다른 화면으로 가기 전에 묻는다(메뉴, 뒤로 가기). 떠나면 그 학생으로
  // 사용 처리를 다시 할 수 없다. 폼에 적은 것만 있으면 묻지 않는다(학생 등록 화면과 같다).
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      blocksRoute(leaveGuard) && currentLocation.pathname !== nextLocation.pathname,
    [leaveGuard],
  )
  const blocker = useBlocker(shouldBlock)
  const routeLeave = leaveText('registered', 'route')
  const routeBlocked = blocker.state === 'blocked'
  // 묻는 사이 일이 끝나 더 막을 까닭이 없어졌으면(사용 처리 완료 등) 머문다. 완료 화면을 보게 한다.
  useEffect(() => {
    if (routeBlocked && !blocksRoute(leaveGuard)) blocker.reset?.()
  }, [routeBlocked, leaveGuard, blocker])

  // 새로 고침, 탭 닫기, 다른 사이트로 가기는 브라우저 기본 창으로 묻는다(문구는 브라우저가 정한다).
  useEffect(() => {
    if (!blocksRoute(leaveGuard)) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // 예전 브라우저는 이 값이 있어야 묻는다.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [leaveGuard])

  function checkNext() {
    verify.reset()
    lookup.current?.clear()
  }

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">패스 확인</h1>
      <p className="mt-1 text-sub">학부모 화면의 QR이나 패스 번호로 동탄고 패스를 확인해요.</p>

      <PassLookup ref={lookup} className="mt-6" busy={verify.isPending} onRequest={send} />
      <Modal
        open={held !== null}
        onClose={() => setHeld(null)}
        title={leave.title}
        description={leave.description}
      >
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setHeld(null)}>
            {leave.stay}
          </Button>
          <Button
            onClick={() => {
              confirmed.current = held
              setHeld(null)
            }}
          >
            {leave.leave}
          </Button>
        </div>
      </Modal>

      <Modal
        open={sendingNotice || (routeBlocked && leaveGuard === 'sending')}
        onClose={() => {
          setSendingNotice(false)
          blocker.reset?.()
        }}
        title={SENDING_TEXT.title}
        description={SENDING_TEXT.description}
      >
        <div className="mt-5 grid">
          <Button
            onClick={() => {
              setSendingNotice(false)
              blocker.reset?.()
            }}
          >
            {SENDING_TEXT.close}
          </Button>
        </div>
      </Modal>
      <Modal
        open={routeBlocked && leaveGuard === 'registered'}
        onClose={() => blocker.reset?.()}
        title={routeLeave.title}
        description={routeLeave.description}
      >
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => blocker.reset?.()}>
            {routeLeave.stay}
          </Button>
          <Button onClick={() => blocker.proceed?.()}>{routeLeave.leave}</Button>
        </div>
      </Modal>

      {failure?.kind === 'notice' && (
        <Notice className="mt-4" requestId={failure.requestId}>
          {failure.message}
        </Notice>
      )}

      {/* 새로 확인할 때마다 처음부터 그린다(폼과 본인 확인 결과를 비운다). */}
      {shownDone ? (
        <DeskDone {...shownDone} onNext={checkNext} />
      ) : (
        verify.data && (
          <DeskRegisterFlow
            key={verify.submittedAt}
            pass={verify.data}
            onNext={checkNext}
            onLeaveGuardChange={setLeaveGuard}
            onDone={(summary) => setDone({ ...summary, submittedAt: verify.submittedAt })}
          />
        )
      )}

      {failure?.kind === 'unusable' && (
        <div className="mt-[22px] grid gap-4">
          <VerifiedPassPanel status={failure.status} message={failure.message} />
          <div>
            <Button variant="ghost" onClick={checkNext}>
              다음 패스 확인하기
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
