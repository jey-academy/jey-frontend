import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button, Card, Form, Modal, Notice, useIsShown } from '@/shared/ui'
import { studentPath, STUDENTS_PATH } from '@/shared/paths'
import { GuardiansSection } from '../components/GuardiansSection'
import { StudentFields } from '../components/StudentFields'
import { useStudentRegisterForm } from '../components/useStudentRegisterForm'

/** 학생 등록. 학생과 학부모 연락처를 한 번에 등록한다. */
export function StudentNewPage() {
  const navigate = useNavigate()
  const isShown = useIsShown()
  const form = useStudentRegisterForm()
  const { lookups, saving, server } = form
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // 응답을 기다리다 다른 화면으로 떠났으면 상세로 끌고 가지 않는다(useIsShown).
    form.submit((created) => {
      if (isShown()) navigate(studentPath(created.id))
    })
  }

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">학생 등록</h1>
      <p className="mt-1 text-sub">학생과 학부모 연락처를 함께 등록해요.</p>

      <Form saving={saving} onSubmit={handleSubmit} className="mt-7 grid max-w-[860px] gap-5">
        <Card>
          <StudentFields
            value={form.student}
            onChange={form.setStudent}
            errors={form.errors}
            campuses={lookups.campuses}
            classes={lookups.classes}
            phoneHint="없으면 비워 두세요."
          />
        </Card>

        <Card>
          <GuardiansSection form={form} />
        </Card>

        {server.form && <Notice requestId={server.requestId}>{server.form}</Notice>}

        {lookups.errorNotice}

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => (form.dirty ? setConfirmingCancel(true) : navigate(STUDENTS_PATH))}
          >
            취소
          </Button>
          <Button type="submit" disabled={!lookups.ready}>
            {saving ? '등록하는 중' : '등록'}
          </Button>
        </div>
      </Form>

      <Modal
        open={confirmingCancel}
        onClose={() => setConfirmingCancel(false)}
        title="입력한 내용을 지울까요?"
        description="등록하지 않고 나가면 입력한 내용이 사라져요."
      >
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setConfirmingCancel(false)}>
            계속 입력
          </Button>
          <Button onClick={() => navigate(STUDENTS_PATH)}>지우고 나가기</Button>
        </div>
      </Modal>
    </>
  )
}
