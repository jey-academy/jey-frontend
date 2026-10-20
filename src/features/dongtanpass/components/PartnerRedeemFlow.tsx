import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ApiError, isOutcomeUnknown } from '@/shared/api'
import { formatDate, formatPercent, formatWon, normalizeMobilePhone, parseWon } from '@/shared/lib'
import {
  Button,
  DescriptionList,
  Form,
  Modal,
  Notice,
  StatusBanner,
  Steps,
  TextField,
  type StepState,
} from '@/shared/ui'
import {
  usePartnerHolderCheck,
  usePartnerQuote,
  usePartnerRedeem,
  type HolderCheckRequest,
  type PartnerQuote,
  type PartnerRedeemResult,
  type PartnerVerifiedPass,
} from '../api'
import { holderCheckSummary } from '../holderCheck'
import { partnerStepError, type PartnerStepError } from '../partnerRedeemError'
import { HolderCheckResultList } from './HolderCheckResult'
import { VerifiedPassPanel } from './VerifiedPassPanel'

/** 학부모 번호는 4개까지 맞춰 볼 수 있다(서버 규칙). */
const MAX_PHONES = 4

/**
 * 다른 패스를 확인하거나 다른 화면으로 가기 전에 물을 것.
 * - `typed`: 적은 것이 있다. 다른 패스를 확인하면 지워진다.
 * - `sending`: 사용 처리를 보내고 답을 기다린다. 떠나면 처리됐는지 알 수 없다.
 * - `unsure`: 사용 처리의 답을 받지 못했다(처리됐을 수 있다). 같은 내용으로 다시 보내 결과를 알 때까지 떠나지 못한다.
 * - `unsureReverify`: `unsure`인데 확인한 지 30분이 지났다. 패스를 다시 확인하는 것만 된다.
 */
export type PartnerLeaveGuard = 'none' | 'typed' | 'sending' | 'unsure' | 'unsureReverify'

/** 사용 처리의 답을 받지 못한 패스와 그때 보낸 받을 금액. 처리됐다면 학원은 이 금액으로 받아야 한다. */
export type UnsureRedeem = { passNo: string; payableAmount: number }

/** 완료 화면에 보여 줄 것. 학부모 번호는 없다. */
export type PartnerDoneSummary = {
  /** 패스의 학생 이름(가린 이름) */
  studentName: string
  passNo: string
  result: PartnerRedeemResult
}

type PartnerRedeemFlowProps = {
  pass: PartnerVerifiedPass
  /** 다음 패스를 확인하러 처음으로 돌아간다 */
  onNext: () => void
  /** 확인한 지 30분이 지나 패스를 다시 확인해야 한다. 바깥이 확인 칸을 비우고 그 칸으로 포커스를 옮긴다. */
  onReverify: () => void
  /** 꺼진 학원이라는 답. 바깥이 화면 전체를 서버의 안내로 바꾼다. */
  onInactive: (message: string) => void
  /** 떠나기 전에 물을 것이 바뀔 때마다 알린다. 같은 함수를 계속 넘긴다. */
  onLeaveGuardChange: (guard: PartnerLeaveGuard) => void
  /** 답을 받지 못한 사용 처리가 생기거나 끝날 때 알린다(끝나면 null). 같은 함수를 계속 넘긴다. */
  onUnsureChange: (unsure: UnsureRedeem | null) => void
  /** 사용 처리까지 끝났다. 바깥이 이 컴포넌트를 내리고 완료 화면을 그린다(입력한 번호도 함께 지워진다). */
  onDone: (summary: PartnerDoneSummary) => void
}

/** 지금 적은 이름과 번호. 아직 보낼 수 없으면 그 까닭을 준다. */
type HolderInput =
  { ready: true; studentName: string; guardianPhones: string[] } | { ready: false; reason: string }

/**
 * 연계 학원의 JEY 패스 사용 처리(ADR-0041). 왼쪽은 확인한 패스와 등록 서류의 정보, 오른쪽은 진행 카드다.
 * ① 패스 확인(바깥) → ② 본인 확인 → ③ 받을 금액 보기 → ④ 사용 처리. 버튼 하나가 다음 단계로 이어 간다.
 * 확인한 패스가 같으면 바깥이 이 컴포넌트를 그대로 둔다(30분이 지나 다시 확인해도 적은 것이 남는다).
 */
export function PartnerRedeemFlow({
  pass,
  onNext,
  onReverify,
  onInactive,
  onLeaveGuardChange,
  onUnsureChange,
  onDone,
}: PartnerRedeemFlowProps) {
  const check = usePartnerHolderCheck(pass.passId)
  const quote = usePartnerQuote(pass.passId)
  const redeem = usePartnerRedeem(pass.passId)
  const formId = useId()
  const unusableRef = useRef<HTMLElement>(null)
  const [studentName, setStudentName] = useState('')
  const [phones, setPhones] = useState<string[]>([''])
  const [fee, setFee] = useState('')
  const [confirming, setConfirming] = useState(false)
  // 마지막으로 시도한 단계. 그 단계의 실패만 보여 준다.
  const [lastStep, setLastStep] = useState<'check' | 'quote' | 'redeem' | null>(null)
  // 답을 받지 못한 사용 처리. 처리됐을 수 있으므로 같은 내용(같은 키)으로 다시 보내 결과를 알 때까지 지킨다.
  const [unsure, setUnsure] = useState<UnsureRedeem | null>(null)

  // 같은 패스를 다시 확인했다(바깥이 새 확인 결과를 넘긴다). 지난 단계의 실패("다시 확인해 주세요")는 끝났다.
  // 렌더 도중에 setState를 부르는 것은 의도한 것이다. React가 이 렌더를 버리고 곧바로 다시 그린다.
  const [seenPass, setSeenPass] = useState(pass)
  if (seenPass !== pass) {
    setSeenPass(pass)
    setLastStep(null)
  }

  const input = holderInputOf(studentName, phones)
  const originalFee = parseWon(fee.trim())
  // 확인한 뒤 이름이나 번호를 고쳤으면 그 결과는 지금 입력에 대한 것이 아니다. 다시 확인하게 한다.
  const result =
    check.data && check.variables && sameInput(check.variables, input) ? check.data : null
  const matched = result !== null && result.nameMatches && result.phoneMatches
  // 금액도 같다. 수강료를 고치면 다시 계산한다.
  const shownQuote: PartnerQuote | null =
    quote.data && quote.variables === originalFee ? quote.data : null

  const failure: PartnerStepError | null =
    lastStep === 'check' && check.error
      ? partnerStepError('check', check.error)
      : lastStep === 'quote' && quote.error
        ? partnerStepError('quote', quote.error)
        : lastStep === 'redeem' && redeem.error
          ? partnerStepError('redeem', redeem.error)
          : null
  const stopped = failure?.kind === 'unusable' || failure?.kind === 'blocked' ? failure : null
  const reverify = failure?.kind === 'reverify'

  useEffect(() => {
    if (failure?.kind === 'inactive') onInactive(failure.message)
  }, [failure, onInactive])

  useEffect(() => {
    onUnsureChange(unsure)
  }, [unsure, onUnsureChange])
  useEffect(() => () => onUnsureChange(null), [onUnsureChange])

  // 폼과 누른 버튼이 사라지므로, 포커스를 바뀐 결과로 옮겨 무엇이 바뀌었는지 읽게 한다.
  useEffect(() => {
    if (stopped) unusableRef.current?.focus()
  }, [stopped])

  const typed =
    studentName.trim() !== '' || phones.some((phone) => phone.trim() !== '') || fee !== ''
  // 다시 확인할 때는 묻지 않는다. 같은 패스면 적은 것이 그대로 남고, 다른 패스를 찍으면 묻지 않고 지워진다.
  // 답을 받지 못한 사용 처리가 있으면 결과를 알 때까지 떠나지 못한다. 다시 확인해야 할 때는 확인만 된다.
  const guard: PartnerLeaveGuard = redeem.isPending
    ? 'sending'
    : unsure && !stopped
      ? reverify
        ? 'unsureReverify'
        : 'unsure'
      : typed && !stopped && !reverify
        ? 'typed'
        : 'none'
  useEffect(() => {
    onLeaveGuardChange(guard)
  }, [guard, onLeaveGuardChange])
  useEffect(() => () => onLeaveGuardChange('none'), [onLeaveGuardChange])

  if (stopped) {
    return (
      <div className="mt-[22px] grid gap-4">
        {stopped.kind === 'unusable' ? (
          <VerifiedPassPanel
            status={stopped.status}
            message={stopped.message}
            ref={unusableRef}
            focusable
          />
        ) : (
          // 패스는 쓸 수 있는 상태일 수 있다(다른 곳에서 쓴다). 상태 띠 대신 사정만 알린다.
          <section
            ref={unusableRef}
            tabIndex={-1}
            aria-label="패스 확인 결과"
            className="outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Notice>{stopped.message}</Notice>
          </section>
        )}
        {unsure && <UnsureOutcomeNotice unsure={unsure} />}
        <div>
          <Button variant="ghost" onClick={onNext}>
            다음 패스 확인하기
          </Button>
        </div>
      </div>
    )
  }

  const busy = check.isPending || quote.isPending || redeem.isPending
  const stage = !matched ? 'check' : shownQuote === null ? 'quote' : 'redeem'
  const feeReason =
    fee.trim() === ''
      ? '원래 수강료를 적어 주세요.'
      : originalFee === null
        ? '금액을 숫자로 적어 주세요. 예: 280,000'
        : null
  const reason =
    stage === 'check' ? (input.ready ? null : input.reason) : stage === 'quote' ? feeReason : null

  // 버튼은 폼 밖(진행 카드)에 있고 form 속성으로 폼과 잇는다. 폼 칸에서 Enter도 여기로 온다.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || reason) return
    if (stage === 'check' && input.ready) {
      setLastStep('check')
      check.mutate({ studentName: input.studentName, guardianPhones: input.guardianPhones })
    } else if (stage === 'quote' && originalFee !== null) {
      setLastStep('quote')
      quote.mutate(originalFee)
    } else if (stage === 'redeem') {
      setConfirming(true)
    }
  }

  function runRedeem() {
    if (!input.ready || !shownQuote) return
    setLastStep('redeem')
    redeem.mutate(
      {
        studentName: input.studentName,
        guardianPhones: input.guardianPhones,
        originalFee: shownQuote.originalFee,
      },
      {
        onSuccess: (data) => {
          setConfirming(false)
          setUnsure(null)
          onDone({ studentName: pass.studentName, passNo: pass.passNo, result: data })
        },
        onError: (error) => {
          setConfirming(false)
          // 처리됐는지 모르는 답이면 지킨다. 다시 확인하라는 답, 한도, 같은 키가 아직 처리 중이라는 답은
          // 앞의 시도가 처리됐는지 알려 주지 않으므로 지키던 것을 그대로 둔다. 그 밖의 답이 오면 결과를 안 것이다.
          if (isOutcomeUnknown(error)) {
            setUnsure({ passNo: pass.passNo, payableAmount: shownQuote.payableAmount })
          } else if (!keepsUnsure(error)) {
            // 쓸 수 없게 됐다는 답(이미 사용됨 등)은 앞의 시도가 처리된 것일 수 있다. 그 안내를 위해 남긴다.
            if (!isStopping(error)) setUnsure(null)
          }
          // 이름·번호가 패스와 다르다는 답이면 본인 확인부터 다시 하게 한다.
          if (error instanceof ApiError && HOLDER_MISMATCH.has(error.code ?? '')) check.reset()
        },
      },
    )
  }

  const checkState: StepState =
    check.isPending || result === null
      ? stage === 'check'
        ? 'current'
        : 'todo'
      : matched
        ? 'done'
        : 'failed'
  const quoteState: StepState = !matched ? 'todo' : shownQuote ? 'done' : 'current'
  const redeemState: StepState =
    stage !== 'redeem' ? 'todo' : lastStep === 'redeem' && redeem.isError ? 'failed' : 'current'

  return (
    <>
      <div className="mt-[22px] grid items-start gap-[18px] min-[861px]:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="패스 확인 결과" className="overflow-hidden rounded-lg bg-card">
          <StatusBanner
            status="valid"
            description={`${formatDate(pass.expiresOn)}까지 쓸 수 있어요.`}
          />
          <DescriptionList
            className="border-t border-line px-[22px] py-5"
            items={[
              { label: '학생', value: pass.studentName },
              { label: '패스 번호', value: pass.passNo },
              { label: '발급', value: `JEY 어학원 ${pass.campusName}` },
              { label: '할인', value: `첫 달 수강료 ${formatPercent(pass.discountRate)}` },
            ]}
          />
          <Form
            id={formId}
            // 답을 받지 못한 사용 처리가 있으면 칸을 잠근다. 같은 내용으로 다시 보내야 같은 키가 나간다.
            saving={busy || unsure !== null}
            onSubmit={handleSubmit}
            aria-labelledby={`${formId}-title`}
            className="grid gap-[18px] border-t border-line px-[22px] pt-5 pb-6"
          >
            <h2 id={`${formId}-title`} className="text-[15px] font-semibold text-sub">
              등록 서류의 정보
            </h2>
            <TextField
              label="학생 이름"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              hint="등록 서류에 적은 이름이에요. 띄어쓰기는 달라도 돼요."
              autoComplete="off"
            />
            <PhoneFields phones={phones} onChange={setPhones} />
            <TextField
              label="원래 수강료(원)"
              value={fee}
              onChange={(event) => setFee(event.target.value)}
              hint="할인하기 전 첫 달 한 달 치 수강료예요."
              placeholder="280,000"
              inputMode="numeric"
              autoComplete="off"
              error={failure?.kind === 'fee' ? failure.message : undefined}
            />
          </Form>
        </section>

        <aside
          aria-labelledby={`${formId}-steps`}
          className="rounded-lg bg-card p-[22px] min-[861px]:sticky min-[861px]:top-[84px]"
        >
          <h2 id={`${formId}-steps`} className="mb-3.5 text-[16px] font-bold text-ink">
            처리 순서
          </h2>
          <Steps
            items={[
              { title: '패스 확인', state: reverify ? 'failed' : 'done' },
              {
                title: '본인 확인',
                state: checkState,
                detail: result && (
                  <HolderCheckResultList
                    result={result}
                    nameFix="등록 서류의 이름을 확인해 주세요. 맞는데도 다르면 JEY 어학원에 확인해 주세요."
                    phoneFix="JEY 어학원에 등록된 학부모 번호를 더해 주세요. 번호는 4개까지 넣을 수 있어요."
                  />
                ),
              },
              {
                title: '받을 금액 보기',
                state: quoteState,
                detail: shownQuote && <QuoteDetail quote={shownQuote} />,
              },
              { title: '사용 처리', state: redeemState },
            ]}
          />
          {/* 결과가 나오면 화면 읽기 프로그램에 알린다. 결과 목록은 새로 그려져 그 자체로는 읽히지 않는다. */}
          <p role="status" className="sr-only">
            {stage === 'check' && result
              ? holderCheckSummary(result)
              : shownQuote
                ? `받을 금액 ${formatWon(shownQuote.payableAmount)}`
                : ''}
          </p>

          <Notice tone="info" className="mt-4">
            할인은 이 학원에 새로 등록하는 학생에게만 해요. 원래 다니던 학생인지는 앱이 알 수
            없어요. 선생님이 확인해 주세요.
          </Notice>

          {reverify && (
            <Notice tone="warning" className="mt-4">
              {failure.message}
              <Button variant="ghost" size="sm" className="mt-3" onClick={onReverify}>
                패스 다시 확인하기
              </Button>
            </Notice>
          )}
          {failure?.kind === 'notice' && (
            <Notice className="mt-4" requestId={failure.requestId}>
              {failure.message}
            </Notice>
          )}
          {unsure && (
            <Notice tone="warning" className="mt-4">
              {/* 다시 누르라는 말은 위의 실패 안내에 있다. 여기서는 칸을 잠근 까닭만 알린다. */}
              사용 처리가 됐는지 아직 몰라요. 같은 내용으로 다시 보내야 해서, 결과를 알 때까지 칸을
              잠가 두었어요.
            </Notice>
          )}

          <div className="mt-5">
            <Button
              type="submit"
              form={formId}
              block
              disabled={reason !== null}
              aria-describedby={reason ? `${formId}-reason` : undefined}
            >
              {buttonLabel()}
            </Button>
            {reason && (
              <p id={`${formId}-reason`} className="mt-2 text-[13px] text-sub">
                {reason}
              </p>
            )}
          </div>
        </aside>
      </div>

      <div className="mt-4">
        {/* 보내는 동안, 답을 받지 못한 사용 처리가 있는 동안은 넘어가지 못한다. */}
        <Button
          variant="ghost"
          disabled={guard === 'sending' || guard === 'unsure' || guard === 'unsureReverify'}
          onClick={onNext}
        >
          다음 패스 확인하기
        </Button>
      </div>

      <Modal
        open={confirming && shownQuote !== null}
        onClose={() => setConfirming(false)}
        closable={!redeem.isPending}
        title="이대로 사용 처리할까요?"
        description="사용 처리한 뒤에는 되돌릴 수 없어요. 아래 받을 금액으로 결제받아 주세요."
      >
        {shownQuote && (
          <>
            <dl className="mt-4 grid gap-2.5 rounded-md bg-field px-[18px] py-4 text-left text-[15px]">
              <SummaryRow label="원래 수강료">{formatWon(shownQuote.originalFee)}</SummaryRow>
              <SummaryRow label="할인">
                {`${formatPercent(shownQuote.discountRate)} · ${formatWon(shownQuote.discountAmount)}`}
              </SummaryRow>
              <SummaryRow label="받을 금액">{formatWon(shownQuote.payableAmount)}</SummaryRow>
            </dl>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button
                variant="ghost"
                onClick={() => setConfirming(false)}
                disabled={redeem.isPending}
              >
                다시 확인
              </Button>
              <Button onClick={runRedeem} disabled={redeem.isPending}>
                {redeem.isPending ? '처리하는 중' : '사용 처리하기'}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  )

  function buttonLabel(): string {
    if (stage === 'check') return check.isPending ? '확인하는 중' : '본인 확인하기'
    if (stage === 'quote') return quote.isPending ? '계산하는 중' : '받을 금액 보기'
    return redeem.isPending ? '사용 처리하는 중' : '사용 처리하기'
  }
}

/** 학부모 번호 칸. 하나로 시작해 4개까지 더한다. 하나라도 패스의 번호와 같으면 맞다. */
function PhoneFields({
  phones,
  onChange,
}: {
  phones: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="grid gap-2.5">
      {phones.map((phone, index) => (
        // 중간 칸을 지우면 뒤 칸의 자리 번호가 당겨지지만, 값은 phones에서 받는 제어 입력이라 입력이 섞이지 않는다.
        // 그래서 자리 번호를 키로 쓴다.
        <div key={index} className="flex items-end gap-2">
          <TextField
            className="flex-1"
            label={index === 0 ? '학부모 휴대전화' : `학부모 휴대전화 ${index + 1}`}
            value={phone}
            onChange={(event) =>
              onChange(phones.map((value, at) => (at === index ? event.target.value : value)))
            }
            placeholder="010-1234-5678"
            inputMode="tel"
            autoComplete="off"
            hint={
              index === 0 ? '등록 서류의 학부모 번호예요. 여러 개면 모두 넣어 주세요.' : undefined
            }
          />
          {index > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="mb-[5px]"
              aria-label={`학부모 휴대전화 ${index + 1} 지우기`}
              onClick={() => onChange(phones.filter((_, at) => at !== index))}
            >
              지우기
            </Button>
          )}
        </div>
      ))}
      {phones.length < MAX_PHONES && (
        <div>
          <Button variant="ghost" size="sm" onClick={() => onChange([...phones, ''])}>
            번호 더하기
          </Button>
        </div>
      )}
    </div>
  )
}

function QuoteDetail({ quote }: { quote: PartnerQuote }) {
  return (
    <dl className="mt-2 grid gap-1.5 text-[14px]">
      <SummaryRow label="원래 수강료">{formatWon(quote.originalFee)}</SummaryRow>
      <SummaryRow label={`할인 ${formatPercent(quote.discountRate)}`}>
        {`- ${formatWon(quote.discountAmount)}`}
      </SummaryRow>
      <SummaryRow label="받을 금액" strong>
        {formatWon(quote.payableAmount)}
      </SummaryRow>
    </dl>
  )
}

function SummaryRow({
  label,
  strong,
  children,
}: {
  label: string
  strong?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-sub">{label}</dt>
      <dd
        className={
          strong ? 'text-[17px] font-extrabold tabular-nums' : 'font-semibold tabular-nums'
        }
      >
        {children}
      </dd>
    </div>
  )
}

function holderInputOf(name: string, phones: string[]): HolderInput {
  const studentName = name.trim()
  if (studentName === '') return { ready: false, reason: '학생 이름을 적어 주세요.' }
  const filled = phones.map((phone) => phone.trim()).filter((phone) => phone !== '')
  if (filled.length === 0) return { ready: false, reason: '학부모 휴대전화 번호를 적어 주세요.' }
  const normalized = filled.map(normalizeMobilePhone)
  if (normalized.some((value) => value === null)) {
    return { ready: false, reason: '학부모 휴대전화 번호를 모두 맞게 적어 주세요.' }
  }
  // 같은 번호는 한 번만 보낸다.
  return { ready: true, studentName, guardianPhones: [...new Set(normalized as string[])] }
}

/** 보낸 값과 지금 입력이 같은지. 다르면 확인 결과를 보여 주지 않는다. */
function sameInput(sent: HolderCheckRequest, input: HolderInput): boolean {
  return (
    input.ready &&
    sent.studentName === input.studentName &&
    sent.guardianPhones.join() === input.guardianPhones.join()
  )
}

/** 이름·번호가 패스와 다르다는 사용 처리의 답 */
const HOLDER_MISMATCH = new Set([
  'DONGTANPASS_HOLDER_NAME_MISMATCH',
  'DONGTANPASS_HOLDER_PHONE_MISMATCH',
])

/** 앞의 시도가 처리됐는지 알려 주지 않는 답. 답을 받지 못한 사용 처리를 계속 지킨다. */
function keepsUnsure(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'DONGTANPASS_PASS_NOT_VERIFIED' ||
      error.code === 'DONGTANPASS_REDEEM_LIMITED' ||
      error.code === 'COMMON_IDEMPOTENCY_IN_PROGRESS')
  )
}

/** 이 패스로는 더 할 수 없다는 답(쓸 수 없는 패스, 이미 할인받은 학생 등) */
function isStopping(error: unknown): boolean {
  const kind = partnerStepError('redeem', error).kind
  return kind === 'unusable' || kind === 'blocked'
}

/**
 * 답을 받지 못한 사용 처리 뒤에 "이미 사용됨·이미 할인받음"이 왔다. 앞의 사용 처리가 실제로 된 것일 수 있다.
 * 그랬다면 할인은 기록됐으므로, 학원이 정가를 받지 않게 그때의 받을 금액을 알린다.
 */
export function UnsureOutcomeNotice({ unsure }: { unsure: UnsureRedeem }) {
  return (
    <Notice tone="warning">
      {`방금 한 사용 처리(${unsure.passNo})가 완료됐을 수 있어요. 완료됐다면 받을 금액은 ${formatWon(unsure.payableAmount)}이에요. JEY 어학원에 확인해 주세요.`}
    </Notice>
  )
}
