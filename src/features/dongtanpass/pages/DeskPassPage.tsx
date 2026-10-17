import { useRef, useState } from 'react'
import { Button, Notice, SearchBox } from '@/shared/ui'
import { useVerifyPass, type PassVerifyRequest } from '../api'
import { VerifiedPassPanel } from '../components/VerifiedPassPanel'
import { toVerifyRequest } from '../deskInput'
import { deskVerifyError } from '../deskVerifyError'

/**
 * 데스크 패스 확인(`/desk/dongtanpass`, 직원·관리자). 패스 번호를 치거나 USB 스캐너로 QR을 찍어 확인한다.
 * 카메라로 찍기와 그다음 단계(본인 확인 → 학생 등록 → 사용 처리)는 아직 없다.
 * 들어올 때 서버에 묻지 않는다.
 */
export function DeskPassPage() {
  const verify = useVerifyPass()
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const failure = verify.error ? deskVerifyError(verify.error) : null
  const hasResult = verify.isSuccess || failure?.kind === 'unusable'

  function check() {
    const request = toVerifyRequest(input)
    if (!request) {
      inputRef.current?.focus()
      return
    }
    verify.mutate(request, { onSettled: (_data, _error, sent) => clearScannedQr(sent) })
  }

  // QR 글자는 한 번 보내면 다시 쓸 수 없고 칸에 남겨 둬도 읽을 수 없다. 다음 스캔을 위해 비운다.
  // 패스 번호는 오타를 고쳐 다시 확인할 수 있게 남긴다.
  function clearScannedQr(sent: PassVerifyRequest) {
    if (sent.qrToken !== undefined) setInput('')
  }

  function checkNext() {
    verify.reset()
    setInput('')
    inputRef.current?.focus()
  }

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">패스 확인</h1>
      <p className="mt-1 text-sub">학부모 화면의 QR이나 패스 번호로 동탄고 패스를 확인해요.</p>

      <SearchBox
        className="mt-6"
        label="패스 번호"
        value={input}
        onValueChange={setInput}
        onSubmit={check}
        submitLabel="확인하기"
        busy={verify.isPending}
        busyLabel="확인하는 중"
        placeholder="패스 번호 (예: DT-7KQ4MX)"
        hint="QR 스캐너를 연결했다면 이 칸에 바로 찍으면 돼요."
        inputRef={inputRef}
        autoFocus
      />

      {failure?.kind === 'notice' && (
        <Notice className="mt-4" requestId={failure.requestId}>
          {failure.message}
        </Notice>
      )}

      {hasResult && (
        <div className="mt-[22px] grid gap-4">
          {verify.data ? (
            <VerifiedPassPanel pass={verify.data} />
          ) : (
            failure?.kind === 'unusable' && (
              <VerifiedPassPanel status={failure.status} message={failure.message} />
            )
          )}
          {verify.data && (
            <Notice tone="info">
              본인 확인과 학생 등록, 사용 처리 화면은 준비 중이에요. 지금은 패스를 확인만 할 수
              있어요.
            </Notice>
          )}
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
