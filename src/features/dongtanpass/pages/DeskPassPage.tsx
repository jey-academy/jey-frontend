import { useEffect, useRef, useState } from 'react'
import { canUseCamera } from '@/shared/lib'
import { Button, Notice, QrScanButton, QrScanner, SearchBox } from '@/shared/ui'
import { useVerifyPass, type PassVerifyRequest } from '../api'
import { VerifiedPassPanel } from '../components/VerifiedPassPanel'
import { toVerifyRequest } from '../deskInput'
import { deskVerifyError } from '../deskVerifyError'

/**
 * 데스크 패스 확인(`/desk/dongtanpass`, 직원·관리자). 카메라로 QR을 찍거나, 패스 번호를 치거나,
 * USB 스캐너로 QR을 찍어 확인한다. 그다음 단계(본인 확인 → 학생 등록 → 사용 처리)는 아직 없다.
 * 들어올 때 서버에 묻지 않는다.
 */
export function DeskPassPage() {
  const verify = useVerifyPass()
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  // 카메라를 켤 수 없는 브라우저(HTTPS가 아님 등)에서는 "QR 찍기"를 숨긴다. 한 번만 본다.
  const [cameraReady] = useState(canUseCamera)
  const scannerWasOpen = useRef(false)
  const failure = verify.error ? deskVerifyError(verify.error) : null
  const hasResult = verify.isSuccess || failure?.kind === 'unusable'

  function check() {
    const request = toVerifyRequest(input)
    if (!request) {
      inputRef.current?.focus()
      return
    }
    send(request)
  }

  function send(request: PassVerifyRequest) {
    verify.mutate(request, { onSettled: (_data, _error, sent) => readyForNext(sent) })
  }

  // 카메라로 읽은 글자는 늘 QR이다. 읽는 즉시 확인한다(카메라는 이미 꺼졌다).
  function handleScan(text: string) {
    setScanning(false)
    send({ qrToken: text.trim() })
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

  // 스캔 창이 닫히면(찍었든 그냥 닫았든) 칸으로 포커스를 돌린다. 브라우저는 창을 연 "QR 찍기" 버튼으로 돌려주는데,
  // 그러면 USB 스캐너의 글자는 아무 데도 들어가지 않고, 끝의 Enter가 버튼을 눌러 카메라를 다시 연다.
  // 창이 실제로 닫힌 뒤(Modal의 효과 뒤)에 옮겨야 브라우저가 덮어쓰지 않는다. 그래서 닫기 처리가 아니라 여기서 한다.
  useEffect(() => {
    if (scanning) {
      scannerWasOpen.current = true
    } else if (scannerWasOpen.current) {
      scannerWasOpen.current = false
      inputRef.current?.focus()
    }
  }, [scanning])

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
        extraActions={
          cameraReady && (
            <QrScanButton className="max-[560px]:flex-1" onClick={() => setScanning(true)} />
          )
        }
      />
      <QrScanner open={scanning} onClose={() => setScanning(false)} onScan={handleScan} />

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
