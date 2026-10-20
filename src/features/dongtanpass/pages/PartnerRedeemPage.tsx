import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, type BlockerFunction } from 'react-router'
import { Button, Modal, Notice } from '@/shared/ui'
import { usePartnerVerifyPass, type PartnerVerifiedPass, type PassVerifyRequest } from '../api'
import { PartnerDone } from '../components/PartnerDone'
import {
  PartnerRedeemFlow,
  UnsureOutcomeNotice,
  type PartnerDoneSummary,
  type PartnerLeaveGuard,
  type UnsureRedeem,
} from '../components/PartnerRedeemFlow'
import { PassLookup, type PassLookupHandle } from '../components/PassLookup'
import { VerifiedPassPanel } from '../components/VerifiedPassPanel'
import { leaveText } from '../deskLeave'
import { clearsVerifiedPass, partnerVerifyError } from '../partnerRedeemError'

/** 떠나지 못하게 막을 때 알리는 창의 문구. 떠나는 버튼은 없다. */
const BLOCKED_TEXT = {
  sending: {
    title: '처리하는 중이에요',
    description: '패스 사용 처리가 끝난 뒤에 넘어갈 수 있어요.',
  },
  unsure: {
    title: '사용 처리 결과를 아직 몰라요',
    description:
      '처리됐을 수 있어요. 먼저 사용 처리하기를 그대로 다시 눌러 결과를 확인해 주세요. 두 번 처리되지 않아요.',
  },
}

/** 다른 화면으로 가거나 페이지를 닫지 못하게 막을지. 떠나면 사용 처리가 됐는지 알 수 없게 된다. */
function blocksLeaving(guard: PartnerLeaveGuard): boolean {
  return guard === 'sending' || guard === 'unsure' || guard === 'unsureReverify'
}

/**
 * 연계 학원의 JEY 패스 사용(`/partner/redeem`, 연계 학원 계정). JEY 어학원이 재원생에게 발급한 패스를 확인하고,
 * 본인 확인과 받을 금액 계산을 거쳐 사용 처리한다(ADR-0041). 결제는 학원이 따로 받는다.
 * 들어올 때 서버에 묻지 않는다.
 */
export function PartnerRedeemPage() {
  const verify = usePartnerVerifyPass()
  const lookup = useRef<PassLookupHandle>(null)
  // 확인을 통과한 패스. 다시 확인하는 동안에도 남겨 둔다. 같은 패스를 다시 확인해 통과하면(30분이 지나) 적은 것이
  // 그대로 남는다. 다시 확인이 잠깐의 오류(연결, 틀린 QR, 한도)로 실패해도 남긴다. 쓸 수 없는 패스라는 답일 때만 내린다.
  const [pass, setPass] = useState<PartnerVerifiedPass | null>(null)
  const [done, setDone] = useState<PartnerDoneSummary | null>(null)
  const [inactive, setInactive] = useState<string | null>(null)
  const [leaveGuard, setLeaveGuard] = useState<PartnerLeaveGuard>('none')
  const [blockedNotice, setBlockedNotice] = useState(false)
  // 답을 받지 못한 사용 처리(흐름이 알린다)
  const [unsure, setUnsure] = useState<UnsureRedeem | null>(null)
  // 답을 받지 못한 사용 처리가 있었는데 다시 확인에서 쓸 수 없는 패스라는 답이 왔다. 앞의 처리가 된 것일 수 있다.
  const [lostUnsure, setLostUnsure] = useState<UnsureRedeem | null>(null)
  // 지울지 묻는 동안 미뤄 둔 확인 요청. 창이 열려 있는 동안만 있다.
  const [held, setHeld] = useState<PassVerifyRequest | null>(null)
  // "지우고 확인"을 누른 요청. 창이 닫힌 뒤 보낸다(아래 효과).
  const confirmed = useRef<PassVerifyRequest | null>(null)
  const failure = verify.error ? partnerVerifyError(verify.error) : null

  function send(request: PassVerifyRequest) {
    if (leaveGuard === 'sending' || leaveGuard === 'unsure') {
      setBlockedNotice(true)
      return
    }
    if (leaveGuard === 'typed') {
      setHeld(request)
      return
    }
    verifyNow(request)
  }

  function verifyNow(request: PassVerifyRequest, { clearTyped = false } = {}) {
    if (clearTyped) setPass(null)
    setDone(null)
    setLostUnsure(null)
    verify.mutate(request, {
      onSuccess: (data) => setPass(data),
      // 쓸 수 없는 패스라는 답이면 앞 패스의 결과도 내린다. 화면의 결과가 방금 찍은 패스의 것처럼 보이지 않게 한다.
      // 답을 받지 못한 사용 처리가 있었다면 그 처리가 된 것일 수 있다. 받을 금액을 알린다.
      onError: (error) => {
        if (!clearsVerifiedPass(error)) return
        if (unsure) setLostUnsure(unsure)
        setPass(null)
      },
      onSettled: (_data, _error, sent) => lookup.current?.afterVerify(sent),
    })
  }

  // "지우고 확인": 창이 실제로 닫힌 뒤(Modal의 효과 뒤)에 보낸다(데스크와 같다).
  useEffect(() => {
    if (held !== null || confirmed.current === null) return
    const request = confirmed.current
    confirmed.current = null
    // "지우고 확인"이다. 같은 패스를 다시 찍어도 적은 것을 실제로 지운다.
    verifyNow(request, { clearTyped: true })
  })

  // 사용 처리를 보내는 동안, 답을 받지 못한 동안 다른 화면으로 가려 하면 막는다. 떠나면 처리됐는지 알 수 없다.
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      blocksLeaving(leaveGuard) && currentLocation.pathname !== nextLocation.pathname,
    [leaveGuard],
  )
  const blocker = useBlocker(shouldBlock)
  const routeBlocked = blocker.state === 'blocked'
  useEffect(() => {
    if (routeBlocked && !blocksLeaving(leaveGuard)) blocker.reset?.()
  }, [routeBlocked, leaveGuard, blocker])

  // 새로 고침, 탭 닫기, 다른 사이트로 가기는 브라우저 기본 창으로 묻는다(데스크와 같다).
  useEffect(() => {
    if (!blocksLeaving(leaveGuard)) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // 예전 브라우저는 이 값이 있어야 묻는다.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [leaveGuard])

  const handleInactive = useCallback((message: string) => setInactive(message), [])
  const focusLookup = useCallback(() => lookup.current?.clear(), [])

  function checkNext() {
    verify.reset()
    setPass(null)
    setDone(null)
    setLostUnsure(null)
    lookup.current?.clear()
  }

  const inactiveMessage = inactive ?? (failure?.kind === 'inactive' ? failure.message : null)
  if (inactiveMessage) {
    return (
      <>
        <Heading />
        <Notice className="mt-7 max-w-[560px]">{inactiveMessage}</Notice>
      </>
    )
  }

  const leave = leaveText('typed', 'check')
  const blockedText = leaveGuard === 'sending' ? BLOCKED_TEXT.sending : BLOCKED_TEXT.unsure

  return (
    <>
      <Heading />

      <PassLookup ref={lookup} className="mt-6" busy={verify.isPending} onRequest={send} />

      <Modal
        open={held !== null}
        onClose={() => setHeld(null)}
        title={leave.title}
        description="다른 패스를 확인하면 지금 적은 학생 이름·번호·수강료가 사라져요."
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
        open={blockedNotice || routeBlocked}
        onClose={() => {
          setBlockedNotice(false)
          blocker.reset?.()
        }}
        title={blockedText.title}
        description={blockedText.description}
      >
        <div className="mt-5 grid">
          <Button
            onClick={() => {
              setBlockedNotice(false)
              blocker.reset?.()
            }}
          >
            확인
          </Button>
        </div>
      </Modal>

      {failure?.kind === 'notice' && (
        <Notice className="mt-4" requestId={failure.requestId}>
          {failure.message}
        </Notice>
      )}
      {lostUnsure && (
        <div className="mt-4">
          <UnsureOutcomeNotice unsure={lostUnsure} />
        </div>
      )}

      {done ? (
        <PartnerDone {...done} onNext={checkNext} />
      ) : (
        pass && (
          <PartnerRedeemFlow
            // 다른 패스면 처음부터 그린다(적은 것을 비운다). 같은 패스를 다시 확인하면 그대로 둔다.
            key={pass.passId}
            pass={pass}
            onNext={checkNext}
            onReverify={focusLookup}
            onInactive={handleInactive}
            onLeaveGuardChange={setLeaveGuard}
            onUnsureChange={setUnsure}
            // 완료되면 확인 결과도 내린다. 완료 화면에서 다음 패스를 찍는 사이
            // 방금 쓴 패스가 "사용할 수 있는 패스"로 다시 보이지 않게 한다.
            onDone={(summary) => {
              setDone(summary)
              setPass(null)
            }}
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

function Heading() {
  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">JEY 패스 사용</h1>
      <p className="mt-1 text-sub">
        JEY 어학원이 발급한 동탄고 패스를 확인하고, 첫 달 수강료를 할인해 받을 금액을 알려 드려요.
      </p>
    </>
  )
}
