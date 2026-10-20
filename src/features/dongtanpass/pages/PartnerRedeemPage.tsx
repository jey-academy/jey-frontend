import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, type BlockerFunction } from 'react-router'
import { Button, Modal, Notice } from '@/shared/ui'
import { usePartnerVerifyPass, type PartnerVerifiedPass, type PassVerifyRequest } from '../api'
import { PartnerDone } from '../components/PartnerDone'
import {
  PartnerRedeemFlow,
  type PartnerDoneSummary,
  type PartnerLeaveGuard,
} from '../components/PartnerRedeemFlow'
import { PassLookup, type PassLookupHandle } from '../components/PassLookup'
import { VerifiedPassPanel } from '../components/VerifiedPassPanel'
import { leaveText } from '../deskLeave'
import { partnerVerifyError } from '../partnerRedeemError'

/** 사용 처리를 보내는 동안 떠나려 할 때 알리는 창의 문구. 떠나는 버튼은 없다. */
const SENDING_TEXT = {
  title: '처리하는 중이에요',
  description: '패스 사용 처리가 끝난 뒤에 넘어갈 수 있어요.',
  close: '확인',
}

/**
 * 연계 학원의 JEY 패스 사용(`/partner/redeem`, 연계 학원 계정). JEY 어학원이 재원생에게 발급한 패스를 확인하고,
 * 본인 확인과 받을 금액 계산을 거쳐 사용 처리한다(ADR-0041). 결제는 학원이 따로 받는다.
 * 들어올 때 서버에 묻지 않는다.
 */
export function PartnerRedeemPage() {
  const verify = usePartnerVerifyPass()
  const lookup = useRef<PassLookupHandle>(null)
  // 확인을 통과한 패스. 다시 확인하는 동안에도 남겨 둔다. 같은 패스를 다시 확인하면(30분이 지나) 적은 것이 그대로 남는다.
  const [pass, setPass] = useState<PartnerVerifiedPass | null>(null)
  const [done, setDone] = useState<PartnerDoneSummary | null>(null)
  const [inactive, setInactive] = useState<string | null>(null)
  const [leaveGuard, setLeaveGuard] = useState<PartnerLeaveGuard>('none')
  const [sendingNotice, setSendingNotice] = useState(false)
  // 지울지 묻는 동안 미뤄 둔 확인 요청. 창이 열려 있는 동안만 있다.
  const [held, setHeld] = useState<PassVerifyRequest | null>(null)
  // "지우고 확인"을 누른 요청. 창이 닫힌 뒤 보낸다(아래 효과).
  const confirmed = useRef<PassVerifyRequest | null>(null)
  const failure = verify.error ? partnerVerifyError(verify.error) : null

  function send(request: PassVerifyRequest) {
    if (leaveGuard === 'sending') {
      setSendingNotice(true)
      return
    }
    if (leaveGuard === 'typed') {
      setHeld(request)
      return
    }
    verifyNow(request)
  }

  function verifyNow(request: PassVerifyRequest) {
    setDone(null)
    verify.mutate(request, {
      onSuccess: (data) => setPass(data),
      // 확인하지 못했으면 앞 패스의 결과도 내린다. 화면의 결과가 방금 찍은 패스의 것처럼 보이지 않게 한다.
      onError: () => setPass(null),
      onSettled: (_data, _error, sent) => lookup.current?.afterVerify(sent),
    })
  }

  // "지우고 확인": 창이 실제로 닫힌 뒤(Modal의 효과 뒤)에 보낸다(데스크와 같다).
  useEffect(() => {
    if (held !== null || confirmed.current === null) return
    const request = confirmed.current
    confirmed.current = null
    verifyNow(request)
  })

  // 사용 처리를 보내는 동안 다른 화면으로 가려 하면 막는다. 떠나면 처리됐는지 알 수 없다.
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      leaveGuard === 'sending' && currentLocation.pathname !== nextLocation.pathname,
    [leaveGuard],
  )
  const blocker = useBlocker(shouldBlock)
  const routeBlocked = blocker.state === 'blocked'
  useEffect(() => {
    if (routeBlocked && leaveGuard !== 'sending') blocker.reset?.()
  }, [routeBlocked, leaveGuard, blocker])

  const handleInactive = useCallback((message: string) => setInactive(message), [])
  const focusLookup = useCallback(() => lookup.current?.clear(), [])

  function checkNext() {
    verify.reset()
    setPass(null)
    setDone(null)
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
        open={sendingNotice || routeBlocked}
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

      {failure?.kind === 'notice' && (
        <Notice className="mt-4" requestId={failure.requestId}>
          {failure.message}
        </Notice>
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
            onDone={setDone}
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
