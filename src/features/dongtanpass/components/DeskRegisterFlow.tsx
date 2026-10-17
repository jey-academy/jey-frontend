import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
// 데스크 신규 등록은 학생 등록 폼을 그대로 쓴다. dongtanpass → students 한 방향만 허용한다(설계서 4장).
import { GuardiansSection } from '@/features/students/components/GuardiansSection'
import { StudentFields } from '@/features/students/components/StudentFields'
import {
  useStudentRegisterForm,
  type HolderInput,
} from '@/features/students/components/useStudentRegisterForm'
import { cn } from '@/shared/lib'
import { Button, Form, Modal, Notice, Steps, type StepState } from '@/shared/ui'
import {
  useHolderCheck,
  type HolderCheckRequest,
  type HolderCheckResult,
  type VerifiedPass,
} from '../api'
import { deskHolderCheckError } from '../deskHolderCheckError'
import { VerifiedPassPanel } from './VerifiedPassPanel'

type DeskRegisterFlowProps = {
  /** 확인을 통과한(쓸 수 있는) 패스 */
  pass: VerifiedPass
  /** 다음 패스를 확인하러 처음으로 돌아간다 */
  onNext: () => void
  /** 폼에 적은 것이 있는지 바뀔 때마다 알린다. 같은 함수를 계속 넘긴다(useState의 setter 등). */
  onDirtyChange: (dirty: boolean) => void
}

/**
 * 데스크 결과(DESIGN.md "데스크 결과 (P3)"): 왼쪽 신규 등록 폼, 오른쪽 진행 카드(처리 순서).
 * 지금은 ② 본인 확인까지 한다. ③ 학생 등록과 ④ 사용 처리는 사용 처리 API(jey-backend #70)가 생기면 붙인다.
 * 폼과 확인 결과는 이 컴포넌트가 들고 있다. 다른 패스를 확인하면 새로 그려져 비워진다.
 */
export function DeskRegisterFlow({ pass, onNext, onDirtyChange }: DeskRegisterFlowProps) {
  const form = useStudentRegisterForm()
  const check = useHolderCheck(pass.passId)
  const formId = useId()
  const doneRef = useRef<HTMLParagraphElement>(null)
  const unusableRef = useRef<HTMLElement>(null)
  const [confirmingNext, setConfirmingNext] = useState(false)
  const [leaving, setLeaving] = useState(false)

  // "지우고 다음 패스": 창이 실제로 닫힌 뒤(Modal의 효과 뒤)에 처음으로 돌아간다. 창이 열려 있는 동안에는
  // 바깥이 막혀 있어 검색 칸으로 포커스를 옮기지 못하고, 그대로 창이 사라지면 포커스를 잃는다(Chrome에서 확인).
  useEffect(() => {
    if (leaving && !confirmingNext) onNext()
  }, [leaving, confirmingNext, onNext])

  const input = form.holderInput
  const failure = check.error ? deskHolderCheckError(check.error) : null
  // 확인한 뒤 이름이나 번호를 고쳤으면, 그 결과는 지금 입력에 대한 것이 아니다. 다시 확인하게 한다.
  const result =
    check.data && check.variables && sameInput(check.variables, input) ? check.data : null
  const matched = result !== null && result.nameMatches && result.phoneMatches

  const unusable = failure?.kind === 'unusable'
  // 폼과 누른 버튼이 사라지므로, 포커스를 바뀐 결과로 옮겨 무엇이 바뀌었는지 읽게 한다.
  useEffect(() => {
    if (unusable) unusableRef.current?.focus()
  }, [unusable])

  // 바깥(데스크 화면)이 다른 패스를 확인하기 전에 지울지 묻도록, 적은 것이 있는지 알린다.
  useEffect(() => {
    onDirtyChange(form.dirty && !unusable)
  }, [form.dirty, unusable, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  // 확인하는 사이 패스를 쓸 수 없게 됐다(그사이 사용·만료·취소). 그 상태만 보여 주고 폼은 거둔다.
  if (failure?.kind === 'unusable') {
    return (
      <div className="mt-[22px] grid gap-4">
        <VerifiedPassPanel
          status={failure.status}
          message={failure.message}
          ref={unusableRef}
          focusable
        />
        <div>
          <Button variant="ghost" onClick={onNext}>
            다음 패스 확인하기
          </Button>
        </div>
      </div>
    )
  }

  function runCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // 확인하는 중에 다시 누르거나, 이미 둘 다 맞았으면 보내지 않는다.
    if (check.isPending || matched || !input.ready) return
    const body: HolderCheckRequest = {
      studentName: input.studentName,
      guardianPhones: input.guardianPhones,
    }
    check.mutate(body, {
      onSuccess: (data) => {
        // 둘 다 맞으면 누른 버튼이 사라진다. 포커스가 갈 곳을 잃지 않게 끝났다는 글로 옮긴다.
        if (data.nameMatches && data.phoneMatches) {
          requestAnimationFrame(() => doneRef.current?.focus())
        }
      },
    })
  }

  const checkState: StepState = check.isPending
    ? 'current'
    : result === null
      ? 'current'
      : matched
        ? 'done'
        : 'failed'

  return (
    <>
      <div className="mt-[22px] grid items-start gap-[18px] min-[861px]:grid-cols-[minmax(0,1fr)_340px]">
        <VerifiedPassPanel pass={pass}>
          <Form
            id={formId}
            saving={check.isPending}
            onSubmit={runCheck}
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
                detail: result && <CheckResult result={result} />,
              },
              { title: '학생 등록', state: matched ? 'current' : 'todo' },
              { title: '패스 사용 처리', state: 'todo' },
            ]}
          />
          {/* 결과가 나오면 화면 읽기 프로그램에 알린다. 결과 목록은 새로 그려져 그 자체로는 읽히지 않는다. */}
          <p role="status" className="sr-only">
            {result && resultSummary(result)}
          </p>

          {failure && (
            <Notice className="mt-4" requestId={failure.requestId}>
              {failure.message}
            </Notice>
          )}

          <div className="mt-5">
            {matched ? (
              <p
                ref={doneRef}
                tabIndex={-1}
                className="text-[14px] text-sub outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                본인 확인을 마쳤어요. 학생 등록과 패스 사용 처리는 준비 중이에요.
              </p>
            ) : (
              <>
                <Button
                  type="submit"
                  form={formId}
                  block
                  disabled={!input.ready}
                  aria-describedby={input.ready ? undefined : `${formId}-reason`}
                >
                  {check.isPending ? '확인하는 중' : '본인 확인하기'}
                </Button>
                {!input.ready && (
                  <p id={`${formId}-reason`} className="mt-2 text-[13px] text-sub">
                    {input.reason}
                  </p>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      <div className="mt-4">
        <Button variant="ghost" onClick={() => (form.dirty ? setConfirmingNext(true) : onNext())}>
          다음 패스 확인하기
        </Button>
      </div>

      <Modal
        open={confirmingNext}
        onClose={() => setConfirmingNext(false)}
        title="입력한 내용을 지울까요?"
        description="다음 패스를 확인하면 지금 적은 등록 정보가 사라져요."
      >
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setConfirmingNext(false)}>
            계속 입력
          </Button>
          <Button
            onClick={() => {
              setConfirmingNext(false)
              setLeaving(true)
            }}
          >
            지우고 다음 패스
          </Button>
        </div>
      </Modal>
    </>
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

function resultSummary(result: HolderCheckResult): string {
  const name = result.nameMatches ? '학생 이름 맞음' : '학생 이름 맞지 않음'
  const phone = result.phoneMatches ? '학부모 번호 맞음' : '학부모 번호 맞지 않음'
  return `본인 확인 결과: ${name}, ${phone}`
}

// 본인 확인 결과(DESIGN.md 진행 카드): 맞음은 체크, 맞지 않음은 ×와 다음 행동.
function CheckResult({ result }: { result: HolderCheckResult }) {
  return (
    <ul className="mt-2 grid gap-2 text-[14px]">
      <ResultLine
        ok={result.nameMatches}
        label="학생 이름"
        fix="등록 폼의 이름을 확인해 주세요. 패스의 이름이 틀렸다면 발급한 학원에 다시 발급을 요청해 주세요."
      />
      <ResultLine
        ok={result.phoneMatches}
        label="학부모 번호"
        fix="패스를 받을 때 알려 준 학부모 번호를 등록 폼에 더해 주세요."
      />
    </ul>
  )
}

function ResultLine({ ok, label, fix }: { ok: boolean; label: string; fix: string }) {
  return (
    <li className="grid grid-cols-[18px_1fr] items-start gap-2">
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid size-[18px] place-items-center rounded-full text-[11px] font-bold text-white',
          ok ? 'bg-pill-valid' : 'bg-pill-expired',
        )}
      >
        {ok ? '✓' : '×'}
      </span>
      <div>
        <ResultLabel ok={ok}>{`${label} ${ok ? '맞음' : '맞지 않음'}`}</ResultLabel>
        {!ok && <p className="mt-0.5 text-sub">{fix}</p>}
      </div>
    </li>
  )
}

function ResultLabel({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <p className={cn('font-semibold', ok ? 'text-pill-valid' : 'text-pill-expired')}>{children}</p>
  )
}
