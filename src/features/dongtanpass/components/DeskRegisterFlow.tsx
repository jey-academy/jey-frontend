import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
// 데스크 신규 등록은 학생 등록 폼을 그대로 쓴다. dongtanpass → students 한 방향만 허용한다(설계서 4장).
import { GuardiansSection } from '@/features/students/components/GuardiansSection'
import { StudentFields } from '@/features/students/components/StudentFields'
import {
  useStudentRegisterForm,
  type HolderInput,
} from '@/features/students/components/useStudentRegisterForm'
import { studentEditPath, studentPath } from '@/shared/paths'
import { Button, ButtonLink, Form, Modal, Notice, Steps, type StepState } from '@/shared/ui'
import { useHolderCheck, useRedeemPass, type HolderCheckRequest, type VerifiedPass } from '../api'
import { deskHolderCheckError } from '../deskHolderCheckError'
import { holderCheckSummary } from '../holderCheck'
import { leaveText, type DeskLeaveGuard } from '../deskLeave'
import { deskRedeemError, type RedeemFix } from '../deskRedeemError'
import type { DeskDoneSummary } from './DeskDone'
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

/**
 * 데스크 결과(DESIGN.md "데스크 결과 (P3)"): 왼쪽 신규 등록 폼, 오른쪽 진행 카드(처리 순서).
 * ① 패스 확인(바깥) → ② 본인 확인 → ③ 학생 등록 → ④ 사용 처리(ADR-0033). ③④는 버튼 하나로 이어서 한다.
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
  // 학생 등록이나 사용 처리를 보내고 답을 기다리는 중. 이때 떠나면 답을 받을 곳이 없다.
  const sending = form.saving || redeem.isPending

  // 바깥(데스크 화면)이 다른 패스를 확인하거나 다른 화면으로 가기 전에 물을 수 있게 알린다.
  const guard: DeskLeaveGuard =
    unusable || final
      ? 'none'
      : sending
        ? 'sending'
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

  const busy = check.isPending || form.saving || redeem.isPending
  const stage = !matched ? 'check' : registered === null ? 'register' : 'redeem'

  // 버튼은 폼 밖(진행 카드)에 있고 form 속성으로 폼과 잇는다. 폼 칸에서 Enter도 여기로 온다.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // 보내는 중에 다시 누르면 보내지 않는다. 다시 해도 같은 답이면 보내지 않는다.
    if (busy || final) return
    if (stage === 'check') runCheck()
    else if (stage === 'register') runRegister()
    else if (registered) runRedeem(registered)
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
  function runRegister() {
    form.submit((created) => {
      const student = { id: created.id, name: created.name, classId: created.classId }
      setRegistered(student)
      runRedeem(student)
    })
  }

  function runRedeem(student: Registered) {
    redeem.mutate(
      { studentId: student.id },
      {
        onSuccess: (data) =>
          onDone({
            studentId: student.id,
            studentName: student.name,
            className:
              form.lookups.classes.find((item) => item.id === student.classId)?.name ?? null,
            passNo: pass.passNo,
            redeemedAt: data.redeemedAt,
            redemptionId: data.redemptionId,
          }),
      },
    )
  }

  const checkState: StepState =
    check.isPending || result === null ? 'current' : matched ? 'done' : 'failed'
  const registerState: StepState = registered ? 'done' : matched ? 'current' : 'todo'
  const redeemState: StepState = !registered ? 'todo' : redeemFailure ? 'failed' : 'current'
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

          <div className="mt-5">
            {stage === 'register' && (
              <p className="mb-3 text-[14px] text-sub">
                본인 확인을 마쳤어요. 등록 정보를 확인하고 등록해 주세요.
              </p>
            )}
            {final && registered ? (
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
    if (stage === 'register') return form.saving ? '등록하는 중' : '등록하고 패스 사용하기'
    return redeem.isPending ? '사용 처리하는 중' : '사용 처리 다시 하기'
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
