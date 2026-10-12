import { useState } from 'react'
import { Link } from 'react-router'
import { ApiError, isOutcomeUnknown, supportRequestId } from '@/shared/api'
import { useCampuses, useClasses } from '@/shared/campus'
import { formatDate } from '@/shared/lib'
import { Button, ButtonLink, Card, DescriptionList, Modal, Notice, Pill } from '@/shared/ui'
import { useRemoveStudentPhone, useUnlinkGuardian, type Guardian, type Student } from '../api'
import { GuardianAddModal, type GuardianAdded } from '../components/GuardianAddModal'
import { GuardianEditModal } from '../components/GuardianEditModal'
import { GuardianUnlinkModal } from '../components/GuardianUnlinkModal'
import { PhoneReveal } from '../components/PhoneReveal'
import { RegisteredNoticeBanner } from '../components/RegisteredNoticeBanner'
import { StudentLoader } from '../components/StudentLoader'
import { contactOwnerLabel, gradeLabel, relationLabel, statusLabel } from '../labels'
import { studentEditPath, studentPath, STUDENTS_PATH } from '@/shared/paths'

const linkClassName =
  'rounded-btn-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

// 날짜를 읽지 못해도 화면 전체를 내리지 않는다. 그 칸만 받은 값 그대로 보여준다.
function displayDate(value: string): string {
  try {
    return formatDate(value)
  } catch {
    return value
  }
}

function removeErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '지우지 못했어요. 잠시 후 다시 시도해 주세요.'
  if (error.code === 'MEMBER_LAST_CONTACT') {
    return '하나 남은 연락처라 지울 수 없어요. 다른 연락처를 먼저 넣어 주세요.'
  }
  // 응답을 받지 못했을 뿐 지워졌을 수 있다. 상세를 다시 받으므로, 지워졌으면 곧 지웠다는 안내로 바뀐다.
  if (error.kind !== 'http' || (error.status !== null && error.status >= 500)) {
    return `${error.message} 지워졌을 수도 있어요. 본인 번호가 그대로면 다시 지워 주세요.`
  }
  return error.message
}

function unlinkErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '끊지 못했어요. 잠시 후 다시 시도해 주세요.'
  if (error.code === 'MEMBER_LAST_CONTACT') {
    return '하나 남은 연락처라 끊을 수 없어요. 다른 연락처를 먼저 넣어 주세요.'
  }
  // 응답을 받지 못했을 뿐 끊겼을 수 있다. 상세를 다시 받으므로, 끊겼으면 곧 끊었다는 안내로 바뀐다.
  if (isOutcomeUnknown(error)) {
    return `${error.message} 끊겼을 수도 있어요. 학부모가 그대로 보이면 다시 끊어 주세요.`
  }
  return error.message
}

// 같은 번호의 학부모가 이미 있으면 서버는 새로 만들지 않고 그 학부모에 연결한다.
// 입력한 이름이 아니라 저장돼 있던 이름을 보여, 번호를 잘못 넣어 남의 학부모에 붙였는지 바로 알아챌 수 있게 한다.
function addedMessage({ name, linked }: GuardianAdded): string {
  return linked
    ? `이미 등록된 학부모(${linked.name}, ${linked.phone})에 연결했어요. 입력한 이름은 쓰이지 않았어요. 다른 사람이라면 연결을 끊고 번호를 확인해 주세요.`
    : `${name} 학부모를 추가했어요.`
}

/** 학생 상세. 기본 정보, 대표 연락처, 학부모, 형제를 보여준다. 전화번호는 서버가 가려서 준 값이다. */
export function StudentDetailPage() {
  return (
    <StudentLoader>
      {(student, { refetchFailed, refetchRequestId }) => (
        // 다른 학생으로 넘어가면(형제 링크, 뒤로 가기) 열어 둔 창과 안내를 새로 시작한다.
        <StudentDetail
          key={student.id}
          student={student}
          refetchFailed={refetchFailed}
          refetchRequestId={refetchRequestId}
        />
      )}
    </StudentLoader>
  )
}

type StudentDetailProps = {
  student: Student
  refetchFailed: boolean
  refetchRequestId: string | null
}

function StudentDetail({ student, refetchFailed, refetchRequestId }: StudentDetailProps) {
  const campuses = useCampuses()
  const classes = useClasses()
  const remove = useRemoveStudentPhone(student.id)
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  // 이름을 못 받은 것과 값이 없는 것("-")을 구분해 보여준다.
  const missingName = (query: { error: unknown }) =>
    query.error ? '이름을 불러오지 못했어요' : '불러오는 중'
  const campusName = campuses.data
    ? (campuses.data.find((campus) => campus.id === student.campusId)?.name ?? '목록에 없는 지점')
    : missingName(campuses)
  const className =
    student.classId === null
      ? '-'
      : classes.data
        ? // 반 목록에는 운영 중인 반만 온다. 이름을 못 찾은 반은 꺼졌거나 방금 바뀐 반이다.
          (classes.data.find((item) => item.id === student.classId)?.name ?? '목록에 없는 반')
        : missingName(classes)
  const lookupFailed =
    (!campuses.data && campuses.error !== null) || (!classes.data && classes.error !== null)
  const contact = student.primaryContact

  // 응답을 받지 못했어도 다시 받은 학생에 번호가 없으면 지워진 것이다.
  const removed = remove.isSuccess || (remove.isError && student.phone === null)
  const removeFailed = remove.isError && student.phone !== null
  // 번호가 없어지면 창도 닫힌다.
  const removeOpen = confirmingRemove && student.phone !== null

  // ── 학부모 ──
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  // 추가·수정이 끝났다는 안내. 다음 일을 시작하면 지운다.
  const [guardianNotice, setGuardianNotice] = useState<string | null>(null)
  const unlink = useUnlinkGuardian(student.id)
  // 끊으려는 학부모. 끊긴 뒤에도 안내에 이름을 쓰려고 남겨 둔다.
  const [unlinkTarget, setUnlinkTarget] = useState<Guardian | null>(null)
  const [confirmingUnlink, setConfirmingUnlink] = useState(false)
  // 학부모 일을 시작할 때마다 올린다. 보여주던 학부모의 전체 번호를 버리는 데 쓴다.
  const [revealEpoch, setRevealEpoch] = useState(0)

  const linked = (id: number) => student.guardians.some((guardian) => guardian.id === id)
  const editing = student.guardians.find((guardian) => guardian.id === editingId)
  // 고치려던 학부모가 학생에게 없다(그 사이 연결이 끊겼다).
  const editingGone = editingId !== null && editing === undefined
  const stillLinked = unlinkTarget !== null && linked(unlinkTarget.id)
  // 응답을 받지 못했어도 다시 받은 학생에 그 학부모가 없으면 끊긴 것이다.
  const unlinked = unlinkTarget !== null && (unlink.isSuccess || (unlink.isError && !stillLinked))
  const unlinkFailed = unlink.isError && stillLinked
  // 끊을지 묻는 사이에(아직 보내기 전) 다른 곳에서 연결이 끊겼다.
  const unlinkGone = confirmingUnlink && unlinkTarget !== null && !stillLinked && unlink.isIdle
  // 학부모가 없어지면 창도 닫힌다.
  const unlinkOpen = confirmingUnlink && stillLinked

  // 지난 일의 안내는 지우고 새 일을 시작한다.
  // 끊는 중에는 부르지 않는다(버튼을 막아 둔다). reset을 부르면 진행 중인 끊기의 결과를 받지 못해 안내가 사라진다.
  function startGuardianAction() {
    setGuardianNotice(null)
    // 수정으로 번호가 바뀔 수 있다. 보여주던 전체 번호가 옛 번호로 남지 않게 미리 가린다.
    setRevealEpoch((epoch) => epoch + 1)
    setEditingId(null)
    setUnlinkTarget(null)
    setConfirmingUnlink(false)
    unlink.reset()
  }

  return (
    <>
      <Link to={STUDENTS_PATH} className={`text-[14px] text-sub ${linkClassName}`}>
        학생 목록
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">
            {student.name}
          </h1>
          <Pill status={student.status === 'ENROLLED' ? 'valid' : 'used'}>
            {statusLabel(student.status)}
          </Pill>
        </div>
        <ButtonLink to={studentEditPath(student.id)}>정보 수정</ButtonLink>
      </div>

      <RegisteredNoticeBanner studentId={student.id} className="mt-6" />
      {refetchFailed && (
        <Notice className="mt-6" requestId={refetchRequestId}>
          최신 내용을 불러오지 못했어요. 아래는 이전 내용일 수 있어요.
        </Notice>
      )}
      {removed && (
        <Notice tone="success" className="mt-6">
          본인 번호를 지웠어요.
        </Notice>
      )}
      {/* 창을 닫은 뒤에 실패한 경우에도 결과를 볼 수 있게 화면에 남긴다. */}
      {removeFailed && !removeOpen && (
        <Notice className="mt-6" requestId={supportRequestId(remove.error)}>
          {removeErrorMessage(remove.error)}
        </Notice>
      )}
      {guardianNotice && (
        <Notice tone="success" className="mt-6">
          {guardianNotice}
        </Notice>
      )}
      {editingGone && <Notice className="mt-6">고치려던 학부모는 이미 연결이 끊겼어요.</Notice>}
      {unlinkGone && (
        <Notice className="mt-6">{`${unlinkTarget.name} 학부모는 이미 연결이 끊겼어요.`}</Notice>
      )}
      {unlinked && (
        <Notice tone="success" className="mt-6">
          {`${unlinkTarget.name} 학부모의 연결을 끊었어요.`}
        </Notice>
      )}
      {/* 창을 닫은 뒤에 실패한 경우에도 결과를 볼 수 있게 화면에 남긴다. */}
      {unlinkFailed && !unlinkOpen && (
        <Notice className="mt-6" requestId={supportRequestId(unlink.error)}>
          {unlinkErrorMessage(unlink.error)}
        </Notice>
      )}
      {lookupFailed && (
        <div className="mt-6">
          <Notice>지점·반 이름을 불러오지 못했어요.</Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => {
              void campuses.refetch()
              void classes.refetch()
            }}
            disabled={campuses.isFetching || classes.isFetching}
          >
            지점·반 다시 불러오기
          </Button>
        </div>
      )}

      <div className="mt-7 grid max-w-[860px] gap-5">
        <Card>
          <h2 className="mb-4 text-[18px] font-bold text-ink">기본 정보</h2>
          <DescriptionList
            items={[
              { label: '학년', value: gradeLabel(student.grade) },
              { label: '학교', value: student.school ?? '-' },
              { label: '지점', value: campusName },
              { label: '반', value: className },
              { label: '등록일', value: displayDate(student.registeredAt) },
              {
                label: '본인 번호',
                value:
                  student.phone === null ? (
                    '-'
                  ) : (
                    <span className="flex flex-wrap items-center gap-3">
                      {/* 가린 번호가 바뀌면 보여주던 전체 번호를 버린다(key). */}
                      <PhoneReveal
                        key={student.phone}
                        masked={student.phone}
                        studentId={student.id}
                        owner="본인"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // 지난번 결과는 지우고 새로 묻는다.
                          remove.reset()
                          setConfirmingRemove(true)
                        }}
                        disabled={remove.isPending}
                      >
                        {remove.isPending ? '지우는 중' : '번호 지우기'}
                      </Button>
                    </span>
                  ),
              },
            ]}
          />
        </Card>

        <Card>
          <h2 className="mb-4 text-[18px] font-bold text-ink">대표 연락처</h2>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="w-[76px] shrink-0 text-[14px] text-sub">
              {contactOwnerLabel(contact.relation)}
            </span>
            <span className="font-semibold">{contact.name}</span>
            <span className="tabular-nums">{contact.phone}</span>
          </p>
          {/* 직접 고를 수 없다. 왜 이 번호인지 알 수 있게 서버의 규칙을 적어 둔다. */}
          <p className="mt-2 text-[14px] text-sub">
            어머니, 먼저 연결된 학부모, 학생 본인 번호 순으로 정해져요.
          </p>
        </Card>

        <Card>
          <h2 className="mb-4 text-[18px] font-bold text-ink">학부모</h2>
          {student.guardians.length === 0 ? (
            <p className="text-sub">연결된 학부모가 없어요.</p>
          ) : (
            <ul className="grid gap-3">
              {student.guardians.map((guardian) => (
                <li
                  key={guardian.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-3 first:border-t-0 first:pt-0"
                >
                  <span className="w-[76px] shrink-0 text-[14px] text-sub">
                    {relationLabel(guardian.relation)}
                  </span>
                  <span className="font-semibold">{guardian.name}</span>
                  <PhoneReveal
                    // 가린 번호가 바뀌면 보여주던 전체 번호를 버린다. 뒷자리가 같은 번호로 바뀐 것은 가린 번호로 알 수 없어서,
                    // 학부모 일을 시작할 때에도 버린다(revealEpoch). 다른 직원이 그렇게 바꾼 것까지는 알 수 없다.
                    key={`${guardian.phone}:${revealEpoch}`}
                    masked={guardian.phone}
                    studentId={student.id}
                    guardianId={guardian.id}
                    owner={guardian.name}
                  />
                  <span className="ml-auto flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`${guardian.name} 수정`}
                      onClick={() => {
                        startGuardianAction()
                        setEditingId(guardian.id)
                      }}
                      disabled={unlink.isPending}
                    >
                      수정
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`${guardian.name} 연결 끊기`}
                      onClick={() => {
                        startGuardianAction()
                        setUnlinkTarget(guardian)
                        setConfirmingUnlink(true)
                      }}
                      disabled={unlink.isPending}
                    >
                      연결 끊기
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="mt-4"
            onClick={() => {
              startGuardianAction()
              setAdding(true)
            }}
            disabled={unlink.isPending}
          >
            학부모 추가
          </Button>
        </Card>

        {student.siblings.length > 0 && (
          <Card>
            <h2 className="mb-4 text-[18px] font-bold text-ink">형제</h2>
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {student.siblings.map((sibling) => (
                <li key={sibling.id} className="flex items-baseline gap-2">
                  <Link to={studentPath(sibling.id)} className={`font-semibold ${linkClassName}`}>
                    {sibling.name}
                  </Link>
                  {/* 퇴원한 형제도 온다. */}
                  <span className="text-[14px] text-sub">{statusLabel(sibling.status)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Modal
        open={removeOpen}
        // 지우는 중에도 닫을 수 있다. 결과는 화면의 안내로 남는다.
        onClose={() => setConfirmingRemove(false)}
        title="본인 번호를 지울까요?"
        description={`${student.name} 학생의 본인 번호(${student.phone ?? ''})를 지워요. 학부모 번호는 그대로예요.`}
      >
        {removeFailed && (
          <Notice className="text-left" requestId={supportRequestId(remove.error)}>
            {removeErrorMessage(remove.error)}
          </Notice>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setConfirmingRemove(false)}>
            닫기
          </Button>
          <Button
            onClick={() =>
              remove.mutate(undefined, { onSuccess: () => setConfirmingRemove(false) })
            }
            disabled={remove.isPending}
          >
            {remove.isPending ? '지우는 중' : '지우기'}
          </Button>
        </div>
      </Modal>

      <GuardianAddModal
        open={adding}
        onClose={() => setAdding(false)}
        student={student}
        onAdded={(added) => setGuardianNotice(addedMessage(added))}
      />
      <GuardianEditModal
        onClose={() => setEditingId(null)}
        studentId={student.id}
        guardian={editing}
        onSaved={() => setGuardianNotice('학부모 정보를 고쳤어요.')}
      />
      <GuardianUnlinkModal
        onClose={() => setConfirmingUnlink(false)}
        studentName={student.name}
        guardian={unlinkOpen ? unlinkTarget : null}
        onConfirm={(guardian) =>
          // 끊긴 뒤 그 학부모가 다시 연결돼도(다른 직원이 다시 붙임) 창이 저절로 열리지 않게 내려 둔다.
          unlink.mutate(guardian.id, { onSuccess: () => setConfirmingUnlink(false) })
        }
        pending={unlink.isPending}
        error={unlinkFailed ? unlinkErrorMessage(unlink.error) : null}
        requestId={unlinkFailed ? supportRequestId(unlink.error) : null}
      />
    </>
  )
}
