import { cn } from '@/shared/lib/cn'
import { Button } from './Button'
import { QrCode } from './QrCode'

/**
 * `loading`: 처음 불러오는 중. `shown`: QR이 보인다(미리 새로 받는 동안도 여기다).
 * `failed`: QR이 만료됐는데 새 QR을 받지 못했다.
 */
export type QrViewState = 'loading' | 'shown' | 'failed'

type QrViewProps = {
  /** QR에 담을 값(서버가 준 단기 토큰). `failed`일 때 마지막 값을 주면 흐리게 보여준다. */
  value?: string
  passNumber: string
  /** QR을 보여 줄 곳. "{place}에 이 QR을 보여 주세요"로 쓴다. */
  place?: string
  className?: string
} & (
  | { state: 'loading' | 'shown' }
  // 받지 못했을 때는 "다시 불러오기" 버튼이 늘 보이므로, 누르면 할 일을 꼭 받는다.
  | { state: 'failed'; onRetry: () => void }
)

const texts: Record<QrViewState, { title: string; hint?: string }> = {
  loading: { title: 'QR을 불러오고 있어요' },
  shown: { title: '{place}에 이 QR을 보여 주세요', hint: '화면 밝기를 올리면 더 잘 찍혀요' },
  failed: {
    title: 'QR을 새로 받지 못했어요',
    hint: '인터넷 연결을 확인해 주세요. 패스 번호로도 확인할 수 있어요',
  },
}

// DESIGN.md 2장 "컴포넌트 내부 상수"의 QrView 값이다.
const chipRadius = 'rounded-[8px]'
const failedQrOpacity = 'opacity-30'

/**
 * 학부모 패스의 QR 시트. `PassCard` 바로 아래에 두면 카드 밑으로 26px 겹쳐 붙는다.
 * QR이 안 될 때 데스크가 번호로 찾을 수 있도록 패스 번호는 어느 상태에서나 보인다.
 * QR을 언제 새로 받을지는 쓰는 화면이 정하고, 이 컴포넌트는 받은 상태만 그린다.
 */
export function QrView(props: QrViewProps) {
  const { state, value, passNumber, place = '데스크', className } = props
  const title = texts[state].title.replace('{place}', place)
  const { hint } = texts[state]
  const showQr = value !== undefined && state !== 'loading'

  return (
    <section
      aria-label="패스 QR"
      className={cn(
        'relative z-0 -mt-[26px] grid grid-cols-[118px_1fr] items-center gap-4 rounded-b-lg bg-card px-5 pt-11 pb-5',
        className,
      )}
    >
      <div className="rounded-btn border-[1.5px] border-line bg-white p-2.5">
        {showQr ? (
          <QrCode
            value={value}
            label="패스 QR"
            className={cn(state === 'failed' && failedQrOpacity)}
          />
        ) : (
          <div className="aspect-square bg-field" />
        )}
      </div>

      <div>
        {/* 상태가 바뀌면 안내를 읽어 준다. 미리 그려 두고 내용만 바꿔야 읽힌다. */}
        <div aria-live="polite">
          <b className="block text-[16px] tracking-[-0.03em]">{title}</b>
          {hint && <span className="mt-1 block text-[13px] text-sub">{hint}</span>}
        </div>
        <span
          className={cn(
            'mt-2.5 inline-block bg-field px-2.5 py-1 text-[15px] font-bold tracking-[0.06em] tabular-nums',
            chipRadius,
          )}
        >
          <span className="sr-only">패스 번호 </span>
          {passNumber}
        </span>
        {props.state === 'failed' && (
          <div className="mt-3">
            <Button variant="ghost" size="sm" onClick={props.onRetry}>
              다시 불러오기
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
