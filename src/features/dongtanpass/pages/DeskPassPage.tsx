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
    verify.mutate(request, { onSettled: (_data, _error, sent) => readyForNext(sent) })
  }

  // 확인이 끝나면(성공·실패 모두) 다음 입력을 바로 받게 칸으로 포커스를 돌린다.
  // 마우스로 "확인하기"를 누르면 확인하는 동안 버튼이 막히며 포커스가 빠져, 스캐너 글자가 아무 데도 들어가지 않는다.
  // - QR 글자는 한 번 보내면 다시 쓸 수 없고 읽을 수도 없다. 비운다.
  // - 패스 번호는 남겨 두되 전체 선택한다. 오타를 고칠 수 있고, 다음에 찍거나 치면 앞의 값을 덮어쓴다
  //   (남은 번호 뒤에 QR 글자가 이어 붙으면 쓰지 않은 QR을 "새로 받으라"고 잘못 안내하게 된다).
  function readyForNext(sent: PassVerifyRequest) {
    const field = inputRef.current
    if (sent.qrToken !== undefined) setInput('')
    field?.focus()
    if (sent.passNo !== undefined) field?.select()
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
