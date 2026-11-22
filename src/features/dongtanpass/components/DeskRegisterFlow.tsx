import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
// 데스크 한 화면에서 청구·결제까지 한다(#228). dongtanpass → billing 한 방향만 허용한다(설계서 4장).
import {
  useDiscountTypes,
  useIssueInvoiceForRedemption,
  type Payment,
  type RedemptionInvoiceRequest,
} from '@/features/billing/api'
import { formatMonth } from '@/features/billing/invoiceInput'
import {
  ALREADY_INVOICED,
  MONTH_ALREADY_INVOICED,
  redemptionInvoiceErrors,
} from '@/features/billing/redemptionInvoiceErrors'
// 데스크 신규 등록은 학생 등록 폼을 그대로 쓴다. dongtanpass → students 한 방향만 허용한다(설계서 4장).
import { GuardiansSection } from '@/features/students/components/GuardiansSection'
import { StudentFields } from '@/features/students/components/StudentFields'
import {
  useStudentRegisterForm,
  type HolderInput,
} from '@/features/students/components/useStudentRegisterForm'
import { invoicePath, studentEditPath, studentPath } from '@/shared/paths'
import { ApiError, IDEMPOTENCY_IN_PROGRESS, isOutcomeUnknown } from '@/shared/api'
import { formatWon, todayInSeoul } from '@/shared/lib'
import { Button, ButtonLink, Form, Modal, Notice, Steps, type StepState } from '@/shared/ui'
import { useHolderCheck, useRedeemPass, type HolderCheckRequest, type VerifiedPass } from '../api'
import { deskHolderCheckError } from '../deskHolderCheckError'
import { holderCheckSummary } from '../holderCheck'
import { leaveText, type DeskLeaveGuard } from '../deskLeave'
import { deskRedeemError, type RedeemFix } from '../deskRedeemError'
import {
  feeRequest,
  initialFee,
  wantsInvoice,
  type DeskFeeField,
  type DeskFeeInput,
} from '../deskFee'
import type { DeskDoneInvoice, DeskDoneSummary } from './DeskDone'
import { DeskFeeSection } from './DeskFeeSection'
import { DeskPaymentStep } from './DeskPaymentStep'
import { HolderCheckResultList } from './HolderCheckResult'
import { VerifiedPassPanel } from './VerifiedPassPanel'

type DeskRegisterFlowProps = {
  /** 확인을 통과한(쓸 수 있는) 패스 */
  pass: VerifiedPass
  /** 다음 패스를 확인하러 처음으로 돌아간다 */
  onNext: () => void
  /** 떠나기 전에 물을 것이 바뀔 때마다 알린다. 같은 함수를 계속 넘긴다(useState의 setter 등). */
  onLeaveGuardChange: (guard: DeskLeaveGuard) => void
  /**
   * 사용 처리까지 끝났다. 바깥이 이 컴포넌트를 내리고 완료 화면을 그린다. 내려가야 폼과 요청 기록
   * (학부모 번호 원문)이 바로 지워진다(gcTime 0).
   */
  onDone: (summary: DeskDoneSummary) => void
}

/** 등록한 학생. 사용 처리가 실패하면 이 학생으로 사용 처리만 다시 한다. */
type Registered = { id: number; name: string; classId: number | null }
/** 사용 처리 결과. 청구가 실패하면 이 기록으로 청구만 다시 만든다. */
type Redeemed = { redemptionId: number; redeemedAt: string }
/** 만든 청구. 결제를 기록하거나 나중으로 미룬다. */
type Invoiced = { invoiceId: number; totalAmount: number; targetMonth: string }

/**
 * 데스크 결과(DESIGN.md "데스크 결과 (P3)"): 왼쪽 신규 등록 폼, 오른쪽 진행 카드(처리 순서).
 * ① 패스 확인(바깥) → ② 본인 확인 → ③ 학생 등록 → ④ 사용 처리(ADR-0033) → ⑤ 수강료 청구 → ⑥ 결제 기록(#228).
 * ③④⑤는 버튼 하나로 이어서 한다(수강료 칸을 비우면 ④까지). ⑥은 실제 청구의 영수증을 보고 포스기 결제 뒤에 따로 누른다
 * (카드는 청구가 생긴 뒤에만 긁는다. 앞 단계가 실패하면 돈을 받기 전에 멈춘다). 단계마다 멱등 키가 따로다.
 * 중간에 실패하면 끝난 단계는 건너뛰고 이어서 한다.
 * 다 끝나면 요약을 바깥에 넘긴다(onDone). 바깥이 완료 화면(DeskDone)을 그린다.
 * 폼과 결과는 이 컴포넌트가 들고 있다. 다른 패스를 확인하면 새로 그려져 비워진다.
 */
export function DeskRegisterFlow({
  pass,
  onNext,
  onLeaveGuardChange,
  onDone,
}: DeskRegisterFlowProps) {
  const form = useStudentRegisterForm()
  const check = useHolderCheck(pass.passId)
  const redeem = useRedeemPass(pass.passId)
  const issue = useIssueInvoiceForRedemption()
  const discountTypes = useDiscountTypes()
  const [fee, setFee] = useState<DeskFeeInput>(() => initialFee(todayInSeoul().slice(0, 7)))
  const [feeErrors, setFeeErrors] = useState<Partial<Record<DeskFeeField, string>>>({})
  const [redeemed, setRedeemed] = useState<Redeemed | null>(null)
  const [invoiced, setInvoiced] = useState<Invoiced | null>(null)
  // 결제 기록을 보내고 답을 기다리거나, 답을 몰라 같은 키로 다시 보내야 하는지(DeskPaymentStep이 알린다)
  const [paymentBusy, setPaymentBusy] = useState(false)
  const formId = useId()
  const unusableRef = useRef<HTMLElement>(null)
  const [registered, setRegistered] = useState<Registered | null>(null)
  const [confirmingNext, setConfirmingNext] = useState(false)
  const [leaving, setLeaving] = useState(false)

  // "다음 패스"를 묻고 넘어갈 때: 창이 실제로 닫힌 뒤(Modal의 효과 뒤)에 처음으로 돌아간다. 창이 열려 있는 동안에는
  // 바깥이 막혀 있어 검색 칸으로 포커스를 옮기지 못하고, 그대로 창이 사라지면 포커스를 잃는다(Chrome에서 확인).
  useEffect(() => {
    if (leaving && !confirmingNext) onNext()
  }, [leaving, confirmingNext, onNext])

  const input = form.holderInput
  const checkFailure = check.error ? deskHolderCheckError(check.error) : null
  const redeemFailure = redeem.error ? deskRedeemError(redeem.error) : null
  // 확인한 뒤 이름이나 번호를 고쳤으면, 그 결과는 지금 입력에 대한 것이 아니다. 다시 확인하게 한다.
  // 학생을 등록한 뒤에는 폼이 잠겨 고칠 수 없다.
  const result =
    check.data && check.variables && sameInput(check.variables, input) ? check.data : null
  const matched = result !== null && result.nameMatches && result.phoneMatches

  // 확인하거나 사용 처리하는 사이 패스를 쓸 수 없게 됐다(그사이 사용·만료·취소).
  const unusable =
    checkFailure?.kind === 'unusable'
      ? checkFailure
      : redeemFailure?.kind === 'unusable'
        ? redeemFailure
        : null

  // 폼과 누른 버튼이 사라지므로, 포커스를 바뀐 결과로 옮겨 무엇이 바뀌었는지 읽게 한다.
  useEffect(() => {
    if (unusable) unusableRef.current?.focus()
  }, [unusable])

  // 다시 해도 같은 답인 사용 처리 오류. 더 할 것이 없다.
  const final = redeemFailure?.kind === 'notice' && redeemFailure.final === true
  const invoiceError = issue.isError ? issue.error : null
  const invoiceCode = invoiceError instanceof ApiError ? invoiceError.code : null
  // 청구 답을 모른다. 칸을 잠그고 같은 내용(같은 키)으로만 다시 보내 처음 결과를 받는다.
  const invoiceUnsure =
    invoiceError !== null &&
    (isOutcomeUnknown(invoiceError) || invoiceCode === IDEMPOTENCY_IN_PROGRESS)
  // 이 사용 기록에 이미 청구가 있다. 다시 해도 같은 답이라 그 청구를 보게 한다.
  const alreadyInvoiced = invoiceCode === ALREADY_INVOICED
  const invoiceServer = redemptionInvoiceErrors(invoiceError)

  // 학생 등록, 사용 처리, 청구, 결제를 보내고 답을 기다리는 중. 이때 떠나면 답을 받을 곳이 없다.
  // 답을 모르는 청구도 같다(같은 키로 다시 보내야 결과를 안다).
  const sending = form.saving || redeem.isPending || issue.isPending || paymentBusy || invoiceUnsure

  // 바깥(데스크 화면)이 다른 패스를 확인하거나 다른 화면으로 가기 전에 물을 수 있게 알린다.
  const guard: DeskLeaveGuard =
    unusable || final
      ? 'none'
      : sending
        ? 'sending'
        : redeemed
          ? 'redeemed'
          : registered
            ? 'registered'
            : form.dirty
              ? 'typed'
              : 'none'
  useEffect(() => {
    onLeaveGuardChange(guard)
  }, [guard, onLeaveGuardChange])
  useEffect(() => () => onLeaveGuardChange('none'), [onLeaveGuardChange])

  if (unusable) {
    return (
      <div className="mt-[22px] grid gap-4">
        <VerifiedPassPanel
          status={unusable.status}
          message={unusable.message}
          ref={unusableRef}
          focusable
        />
        {registered && (
          <Notice tone="warning">
            {registered.name} 학생은 등록됐어요. 패스는 사용 처리되지 않았어요.
          </Notice>
        )}
        <div className="flex flex-wrap gap-2">
          {registered && (
            <ButtonLink variant="ghost" to={studentPath(registered.id)}>
              학생 정보 보기
            </ButtonLink>
          )}
          <Button variant="ghost" onClick={onNext}>
            다음 패스 확인하기
          </Button>
        </div>
      </div>
    )
  }

  const busy = check.isPending || form.saving || redeem.isPending || issue.isPending
  const stage = !matched
    ? 'check'
    : registered === null
      ? 'register'
      : redeemed === null
        ? 'redeem'
        : invoiced === null
          ? 'invoice'
          : 'pay'
  // 수강료 칸의 반은 등록 폼의 반이다. 등록한 뒤에는 등록한 학생의 반이다(폼이 잠겨 같다).
  const feeClassId = registered
    ? registered.classId === null
      ? ''
      : String(registered.classId)
    : form.student.classId
  const feeClassName =
    form.lookups.classes.find((item) => String(item.id) === feeClassId)?.name ?? null
  // 수강료 칸은 보내는 동안, 청구를 만든 뒤, 청구 답을 모를 때 잠근다.
  const feeLocked = busy || invoiced !== null || invoiceUnsure

  // 버튼은 폼 밖(진행 카드)에 있고 form 속성으로 폼과 잇는다. 폼 칸에서 Enter도 여기로 온다.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // 보내는 중에 다시 누르면 보내지 않는다. 다시 해도 같은 답이면 보내지 않는다.
    if (busy || final) return
    if (stage === 'check') runCheck()
    else if (stage === 'register') runRegister()
    else if (stage === 'redeem' && registered) runRedeem(registered)
    else if (stage === 'invoice' && registered && redeemed) runInvoice(registered, redeemed)
  }

  function runCheck() {
    if (!input.ready) return
    const body: HolderCheckRequest = {
      studentName: input.studentName,
      guardianPhones: input.guardianPhones,
    }
    // 둘 다 맞으면 버튼 이름이 "등록하고 패스 사용하기"로 바뀐다. 버튼은 그대로라 포커스를 옮기지 않고,
    // 결과는 아래 role="status"가 읽어 준다.
    check.mutate(body)
  }

  // 학생 등록이 끝나면 바로 사용 처리를 보낸다. 등록에서 막히면(칸 오류 등) 폼에 알리고 멈춘다.
  // 수강료 칸이 틀렸으면 등록하기 전에 멈춘다(등록 뒤에는 되돌릴 수 없다).
  function runRegister() {
    const plan = feeRequest(fee, form.student.classId)
    setFeeErrors(plan.errors)
    if (Object.keys(plan.errors).length > 0) return
    form.submit((created) => {
      const student = { id: created.id, name: created.name, classId: created.classId }
      setRegistered(student)
      runRedeem(student)
    })
  }

  // 사용 처리가 끝나면 수강료 칸을 채웠을 때 바로 청구를 만든다. 비웠으면 여기서 끝낸다.
  function runRedeem(student: Registered) {
    redeem.mutate(
      { studentId: student.id },
      {
        onSuccess: (data) => {
          const done = { redemptionId: data.redemptionId, redeemedAt: data.redeemedAt }
          setRedeemed(done)
          if (wantsInvoice(fee)) runInvoice(student, done)
          else finish(student, done, null)
        },
      },
    )
  }

  // 청구를 만든다. "지금 결제 받음"이면 영수증과 결제 기록 칸을 보여 주고, 아니면 여기서 끝낸다.
  // 이어서 할 때 수업 횟수를 지웠으면 청구 없이 끝낸다.
  function runInvoice(student: Registered, done: Redeemed) {
    const plan = feeRequest(fee, student.classId === null ? '' : String(student.classId))
    setFeeErrors(plan.errors)
    if (Object.keys(plan.errors).length > 0) return
    const body: RedemptionInvoiceRequest | null = plan.body
    if (body === null) {
      finish(student, done, null)
      return
    }
    const payNow = fee.payNow
    issue.mutate(
      { redemptionId: done.redemptionId, body },
      {
        onSuccess: (result) => {
          const made = {
            invoiceId: result.invoiceId,
            totalAmount: result.totalAmount,
            targetMonth: body.targetMonth,
          }
          if (payNow) setInvoiced(made)
          else finish(student, done, { ...made, paidWith: null })
        },
      },
    )
  }

  function finish(student: Registered, done: Redeemed, invoice: DeskDoneInvoice | null) {
    onDone({
      studentId: student.id,
      studentName: student.name,
      className: form.lookups.classes.find((item) => item.id === student.classId)?.name ?? null,
      passNo: pass.passNo,
      redeemedAt: done.redeemedAt,
      redemptionId: done.redemptionId,
      invoice,
    })
  }

  function changeFee(change: (current: DeskFeeInput) => DeskFeeInput) {
    setFee(change)
    setFeeErrors({})
    // 서버가 짚었던 오류는 고친 칸에 남기지 않는다. 답을 모를 때는 칸이 잠겨 있다.
    if (issue.isError && !invoiceUnsure) issue.reset()
  }

  const checkState: StepState =
    check.isPending || result === null ? 'current' : matched ? 'done' : 'failed'
  const registerState: StepState = registered ? 'done' : matched ? 'current' : 'todo'
  const redeemState: StepState = redeemed
    ? 'done'
    : !registered
      ? 'todo'
      : redeemFailure
        ? 'failed'
        : 'current'
  const invoiceState: StepState = invoiced
    ? 'done'
    : !redeemed
      ? 'todo'
      : invoiceError || Object.keys(feeErrors).length > 0
        ? 'failed'
        : 'current'
  const showInvoiceStep = wantsInvoice(fee) || redeemed !== null
  // 등록 응답을 받지 못했다는 안내는 이름이나 번호를 고쳐 ②로 돌아가도 남긴다. 고쳐서 다시 보내면 새 등록이 되므로
  // 등록됐을 수 있다는 것을 계속 알린다.
  const registerNotice = !registered && form.server.form

  return (
    <>
      <div className="mt-[22px] grid items-start gap-[18px] min-[861px]:grid-cols-[minmax(0,1fr)_340px]">
        <VerifiedPassPanel pass={pass}>
          <Form
            id={formId}
            // 보내는 동안 잠근다. 학생을 등록한 뒤에도 잠근다(고쳐도 등록된 학생은 바뀌지 않는다).
            saving={busy || registered !== null}
            onSubmit={handleSubmit}
            aria-labelledby={`${formId}-title`}
            className="grid gap-[18px] border-t border-line px-[22px] pt-5 pb-6"
          >
            <h2 id={`${formId}-title`} className="text-[15px] font-semibold text-sub">
              신규 등록 정보
            </h2>
            <StudentFields
              value={form.student}
              onChange={form.setStudent}
              errors={form.errors}
              campuses={form.lookups.campuses}
              classes={form.lookups.classes}
              phoneHint="없으면 비워 두세요."
            />
            <div className="border-t border-line pt-[18px]">
              <GuardiansSection form={form} />
            </div>
            {form.lookups.errorNotice}
          </Form>
          <Form
            saving={feeLocked}
            onSubmit={handleSubmit}
            aria-label="이번 달 수강료"
            className="border-t border-line px-[22px] pt-5 pb-6"
          >
            <DeskFeeSection
              value={fee}
              onChange={changeFee}
              className={feeClassName}
              discountTypes={discountTypes.data ?? null}
              onRetryDiscounts={
                discountTypes.isError && !discountTypes.isFetching
                  ? () => void discountTypes.refetch()
                  : null
              }
              errors={{
                targetMonth: invoiceServer.fields.targetMonth,
                discountCodes: invoiceServer.fields.discountCodes,
                ...feeErrors,
              }}
              classError={invoiceServer.fields.lines}
            />
          </Form>
        </VerifiedPassPanel>

        <aside
          aria-labelledby={`${formId}-steps`}
          className="rounded-lg bg-card p-[22px] min-[861px]:sticky min-[861px]:top-[84px]"
        >
          <h2 id={`${formId}-steps`} className="mb-3.5 text-[16px] font-bold text-ink">
            처리 순서
          </h2>
          <Steps
            items={[
              { title: '패스 확인', state: 'done' },
              {
                title: '본인 확인',
                state: checkState,
                detail: result && (
                  <HolderCheckResultList
                    result={result}
                    nameFix="등록 폼의 이름을 확인해 주세요. 패스의 이름이 틀렸다면 발급한 학원에 다시 발급을 요청해 주세요."
                    phoneFix="패스를 받을 때 알려 준 학부모 번호를 등록 폼에 더해 주세요."
                  />
                ),
              },
              {
                title: '학생 등록',
                state: registerState,
                detail: registered && (
                  <p className="mt-1 text-[14px] text-sub">{registered.name} 학생을 등록했어요.</p>
                ),
              },
              { title: '패스 사용 처리', state: redeemState },
              ...(showInvoiceStep
                ? [
                    {
                      title: '수강료 청구',
                      state: invoiceState,
                      detail: invoiced && (
                        <p className="mt-1 text-[14px] text-sub">
                          {`${formatMonth(invoiced.targetMonth)} 청구 ${formatWon(invoiced.totalAmount)}`}
                        </p>
                      ),
                    },
                  ]
                : []),
              ...(showInvoiceStep && fee.payNow
                ? [{ title: '결제 기록', state: (invoiced ? 'current' : 'todo') as StepState }]
                : []),
            ]}
          />
          {/* 결과가 나오면 화면 읽기 프로그램에 알린다. 결과 목록은 새로 그려져 그 자체로는 읽히지 않는다. */}
          <p role="status" className="sr-only">
            {result && !registered && holderCheckSummary(result)}
          </p>

          {checkFailure?.kind === 'notice' && stage === 'check' && (
            <Notice className="mt-4" requestId={checkFailure.requestId}>
              {checkFailure.message}
            </Notice>
          )}
          {registerNotice && (
            <Notice className="mt-4" requestId={form.server.requestId}>
              {registerNotice}
            </Notice>
          )}
          {redeemFailure?.kind === 'notice' && registered && (
            <Notice className="mt-4" requestId={redeemFailure.requestId}>
              {redeemFailure.message}
              {redeemFailure.fix && <FixLink fix={redeemFailure.fix} studentId={registered.id} />}
            </Notice>
          )}

          {stage === 'invoice' && invoiceError !== null && (
            <Notice className="mt-4" requestId={invoiceServer.requestId}>
              {invoiceServer.form ??
                (invoiceCode === MONTH_ALREADY_INVOICED
                  ? '그 달에 이 학생의 청구가 이미 있어요. 대상 월을 바꾸거나 수업 횟수를 지우고 이어서 해 주세요.'
                  : '청구를 만들지 못했어요. 수강료 칸을 확인해 주세요.')}
              <span className="mt-1 block font-normal">
                패스 사용 처리는 끝났어요. 청구는 패스 사용 내역에서도 만들 수 있어요.
              </span>
            </Notice>
          )}

          <div className="mt-5">
            {stage === 'register' && (
              <p className="mb-3 text-[14px] text-sub">
                본인 확인을 마쳤어요. 등록 정보를 확인하고 등록해 주세요.
              </p>
            )}
            {stage === 'pay' && invoiced && registered && redeemed ? (
              <DeskPaymentStep
                invoiceId={invoiced.invoiceId}
                totalAmount={invoiced.totalAmount}
                onBusyChange={setPaymentBusy}
                onPaid={(payment: Payment) =>
                  finish(registered, redeemed, { ...invoiced, paidWith: payment.method })
                }
                onLater={() => finish(registered, redeemed, { ...invoiced, paidWith: null })}
              />
            ) : stage === 'invoice' && alreadyInvoiced && registered && redeemed ? (
              <div className="grid gap-2.5">
                {invoiceError instanceof ApiError && invoiceError.id('invoiceId') !== null && (
                  <ButtonLink block to={invoicePath(invoiceError.id('invoiceId') ?? 0)}>
                    청구 보기
                  </ButtonLink>
                )}
                <Button variant="ghost" block onClick={() => finish(registered, redeemed, null)}>
                  청구 없이 끝내기
                </Button>
              </div>
            ) : final && registered ? (
              <ButtonLink variant="ghost" block to={studentPath(registered.id)}>
                학생 정보 보기
              </ButtonLink>
            ) : (
              <Button
                type="submit"
                form={formId}
                block
                disabled={
                  (stage === 'check' && !input.ready) ||
                  (stage === 'register' && !form.lookups.ready)
                }
                aria-describedby={
                  stage === 'check' && !input.ready ? `${formId}-reason` : undefined
                }
              >
                {buttonLabel()}
              </Button>
            )}
            {stage === 'check' && !input.ready && (
              <p id={`${formId}-reason`} className="mt-2 text-[13px] text-sub">
                {input.reason}
              </p>
            )}
          </div>
        </aside>
      </div>

      <div className="mt-4">
        {/* 보내는 동안에는 막는다. 답을 받기 전에 떠나면 등록·처리 결과를 놓친다. */}
        <Button
          variant="ghost"
          disabled={guard === 'sending'}
          onClick={() => (guard === 'none' ? onNext() : setConfirmingNext(true))}
        >
          다음 패스 확인하기
        </Button>
      </div>

      <LeaveModal
        open={confirmingNext}
        guard={guard}
        onStay={() => setConfirmingNext(false)}
        onLeave={() => {
          setConfirmingNext(false)
          setLeaving(true)
        }}
      />
    </>
  )

  function buttonLabel(): string {
    if (stage === 'check') return check.isPending ? '확인하는 중' : '본인 확인하기'
    if (stage === 'register') {
      if (form.saving) return '등록하는 중'
      if (redeem.isPending) return '사용 처리하는 중'
      return '등록하고 패스 사용하기'
    }
    if (stage === 'redeem') return redeem.isPending ? '사용 처리하는 중' : '사용 처리 다시 하기'
    if (issue.isPending) return '청구를 만드는 중'
    if (invoiceUnsure) return '그대로 다시 보내기'
    return wantsInvoice(fee) ? '이어서 하기' : '청구 없이 끝내기'
  }
}

function LeaveModal({
  open,
  guard,
  onStay,
  onLeave,
}: {
  open: boolean
  guard: DeskLeaveGuard
  onStay: () => void
  onLeave: () => void
}) {
  // 창이 닫히는 사이 guard가 none으로 바뀌어도 문구가 비지 않게, 닫혀 있을 때도 typed 문구를 둔다.
  // 보내는 동안(sending)에는 이 창을 여는 버튼이 막혀 있다.
  const text = leaveText(guard === 'registered' ? 'registered' : 'typed', 'next')
  return (
    <Modal open={open} onClose={onStay} title={text.title} description={text.description}>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onStay}>
          {text.stay}
        </Button>
        <Button onClick={onLeave}>{text.leave}</Button>
      </div>
    </Modal>
  )
}

// 사용 처리가 학생 정보 때문에 막혔을 때 고칠 화면. 새 탭으로 연다. 이 화면을 떠나면 등록한 학생으로
// 사용 처리를 다시 할 수 없게 되기 때문이다. 고친 뒤 돌아와 "사용 처리 다시 하기"를 누른다.
function FixLink({ fix, studentId }: { fix: RedeemFix; studentId: number }) {
  const to = fix === 'studentEdit' ? studentEditPath(studentId) : studentPath(studentId)
  return (
    <p className="mt-2">
      <Link to={to} target="_blank" rel="noopener" className="underline underline-offset-2">
        {fix === 'studentEdit' ? '학생 정보 고치기' : '학생 정보 열기'} (새 탭)
      </Link>
    </p>
  )
}

/** 보낸 값과 지금 폼의 값이 같은지. 다르면 확인 결과를 보여 주지 않는다. */
function sameInput(sent: HolderCheckRequest, input: HolderInput): boolean {
  return (
    input.ready &&
    sent.studentName === input.studentName &&
    sent.guardianPhones.join() === input.guardianPhones.join()
  )
}
