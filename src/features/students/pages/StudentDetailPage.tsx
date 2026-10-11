import { useState } from 'react'
import { Link } from 'react-router'
import { ApiError } from '@/shared/api'
import { useCampuses, useClasses } from '@/shared/campus'
import { formatDate } from '@/shared/lib'
import { Button, ButtonLink, Card, DescriptionList, Modal, Notice, Pill } from '@/shared/ui'
import { useRemoveStudentPhone, type Student } from '../api'
import { RegisteredNoticeBanner } from '../components/RegisteredNoticeBanner'
import { StudentLoader } from '../components/StudentLoader'
import { contactOwnerLabel, gradeLabel, relationLabel, statusLabel } from '../labels'
import { studentEditPath, studentPath, STUDENTS_PATH } from '../paths'

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

/** 학생 상세. 기본 정보, 대표 연락처, 학부모, 형제를 보여준다. 전화번호는 서버가 가려서 준 값이다. */
export function StudentDetailPage() {
  return (
    <StudentLoader>
      {(student, { refetchFailed }) => (
        // 다른 학생으로 넘어가면(형제 링크, 뒤로 가기) 열어 둔 창과 안내를 새로 시작한다.
        <StudentDetail key={student.id} student={student} refetchFailed={refetchFailed} />
      )}
    </StudentLoader>
  )
}

function StudentDetail({ student, refetchFailed }: { student: Student; refetchFailed: boolean }) {
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
        <Notice className="mt-6">
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
        <Notice className="mt-6">{removeErrorMessage(remove.error)}</Notice>
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
                      {/* 서버가 가운데를 가려서 준 번호를 그대로 보여준다. */}
                      <span className="tabular-nums">{student.phone}</span>
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
                  <span className="tabular-nums">{guardian.phone}</span>
                </li>
              ))}
            </ul>
          )}
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
        {removeFailed && <Notice className="text-left">{removeErrorMessage(remove.error)}</Notice>}
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
    </>
  )
}
