import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react'
import { canUseCamera } from '@/shared/lib/camera'
import { cn } from '@/shared/lib/cn'
import { createQrDetector } from '@/shared/lib/qrDecoder'
import { Button } from './Button'
import { Modal } from './Modal'
import { Notice } from './Notice'

type QrScannerProps = {
  open: boolean
  onClose: () => void
  /** QR을 읽었다. 카메라는 이미 꺼졌다. 창을 닫는 것은 쓰는 쪽이 한다. */
  onScan: (text: string) => void
}

/**
 * QR 스캔 창(DESIGN.md "QrScanner"). 열려 있는 동안만 후면 카메라를 켜고, 닫거나 화면을 떠나면 끈다.
 * 배경을 눌러도 닫히지 않는다(찍다가 실수로 닫히지 않게). 닫기 버튼과 Esc로 닫는다.
 */
export function QrScanner({ open, onClose, onScan }: QrScannerProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      title="QR 찍기"
      description="학부모 화면의 QR을 네모 안에 맞춰 주세요."
    >
      {/* Modal은 열려 있을 때만 안을 그린다. 그래서 카메라는 창이 열릴 때 켜지고 닫힐 때 꺼진다. */}
      <ScannerBody onScan={onScan} />
      <Button variant="ghost" block className="mt-4" onClick={onClose}>
        닫기
      </Button>
    </Modal>
  )
}

type CameraState = 'starting' | 'scanning' | 'denied' | 'unavailable' | 'failed'

const STATE_MESSAGES: Record<Exclude<CameraState, 'scanning'>, string> = {
  starting: '카메라를 켜고 있어요.',
  denied:
    '카메라를 쓸 수 없어요. 브라우저 설정에서 카메라를 허용하거나, 창을 닫고 패스 번호로 확인해 주세요.',
  unavailable: '이 기기에서 카메라를 찾지 못했어요. 창을 닫고 패스 번호로 확인해 주세요.',
  failed: '카메라를 켜지 못했어요. 창을 닫았다가 다시 해 보거나, 패스 번호로 확인해 주세요.',
}

/** 한 장을 읽고 다음 장을 읽기까지 쉬는 시간. 휴대폰이 뜨거워지지 않을 만큼만 자주 본다. */
const SCAN_INTERVAL_MS = 150

function ScannerBody({ onScan }: { onScan: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<CameraState>('starting')
  // 카메라를 다시 켜지 않도록 effect는 한 번만 돈다. 최신 onScan은 ref로 읽는다.
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  })

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let timer: number | undefined

    function stop() {
      stopped = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }

    async function start() {
      try {
        if (!canUseCamera()) throw new DOMException('camera api missing', 'NotFoundError')
        // 후면 카메라를 바란다. 없으면(노트북) 있는 카메라를 쓴다.
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        stream = media
        // 기다리는 사이 창이 닫혔으면 켜진 카메라를 바로 끈다.
        if (stopped) return stop()
        const detector = await createQrDetector()
        const video = videoRef.current
        if (stopped || !video) return stop()
        video.srcObject = media
        await video.play()
        if (stopped) return
        setState('scanning')

        const scan = async () => {
          if (stopped) return
          try {
            // 화면이 준비되기 전(HAVE_CURRENT_DATA 미만)에는 읽을 것이 없다.
            const text = video.readyState >= 2 ? await detector.detect(video) : null
            if (stopped) return
            // 공백뿐인 글자는 QR로 보지 않는다(보내 봐야 서버가 받지 않는다).
            if (text?.trim()) {
              stop()
              onScanRef.current(text)
              return
            }
          } catch {
            // 한 장을 읽다 실패한 것이다(흔들림, 화면 전환 중). 다음 장을 읽는다.
          }
          timer = window.setTimeout(() => void scan(), SCAN_INTERVAL_MS)
        }
        void scan()
      } catch (error) {
        stop()
        setState(stateOf(error))
      }
    }

    void start()
    return stop
  }, [])

  const message = state === 'scanning' ? null : STATE_MESSAGES[state]
  const blocked = state === 'denied' || state === 'unavailable' || state === 'failed'

  return (
    <>
      <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-xl bg-[#0B1320]">
        <video
          ref={videoRef}
          aria-label="카메라 화면"
          muted
          playsInline
          className={cn('size-full object-cover', state !== 'scanning' && 'invisible')}
        />
        {state === 'scanning' && <Viewfinder />}
      </div>
      {message &&
        (blocked ? (
          <Notice className="mt-4 text-left">{message}</Notice>
        ) : (
          <p role="status" className="mt-4 text-[15px] text-sub">
            {message}
          </p>
        ))}
    </>
  )
}

// 모서리 표시 4개(안쪽 16%, 34px, 4px glow)와 위아래로 오가는 스캔 선. 장식이다.
function Viewfinder() {
  const corner = 'absolute size-[34px] border-glow'
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <span className={cn(corner, 'top-[16%] left-[16%] rounded-tl-sm border-t-4 border-l-4')} />
      <span className={cn(corner, 'top-[16%] right-[16%] rounded-tr-sm border-t-4 border-r-4')} />
      <span className={cn(corner, 'bottom-[16%] left-[16%] rounded-bl-sm border-b-4 border-l-4')} />
      <span
        className={cn(corner, 'right-[16%] bottom-[16%] rounded-br-sm border-r-4 border-b-4')}
      />
      <span className="absolute top-1/2 right-[16%] left-[16%] h-0.5 bg-glow shadow-[0_0_12px_var(--color-glow)] motion-safe:animate-[sweep_1.8s_ease-in-out_infinite_alternate]" />
    </div>
  )
}

function stateOf(error: unknown): Exclude<CameraState, 'starting' | 'scanning'> {
  const name = error instanceof DOMException ? error.name : null
  // 사용자가 막았거나, 사이트 설정·기기 정책으로 막혔다.
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  // 카메라가 없다.
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'unavailable'
  // 다른 앱이 카메라를 쓰는 중이거나, 판독기(WASM)를 받지 못했다.
  return 'failed'
}

/** 데스크 검색 상자의 "QR 찍기" 버튼(DESIGN.md "Scan Button"). glow 채움은 이 버튼과 스캐너에만 쓴다. */
export function QrScanButton({
  className,
  type = 'button',
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex h-[52px] cursor-pointer items-center justify-center gap-2 rounded-btn bg-glow px-[18px] text-[16px] font-bold text-glow-ink',
        '[transition:scale_.08s,background-color_.15s] hover:bg-glow-hover active:scale-98 disabled:cursor-default disabled:scale-100',
        className,
      )}
      {...props}
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
        <path d="M7 12h10" />
      </svg>
      QR 찍기
    </button>
  )
}
