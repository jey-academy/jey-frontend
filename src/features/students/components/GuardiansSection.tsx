import { Button, Notice } from '@/shared/ui'
import { GuardianFields } from './GuardianFields'
import { MAX_GUARDIANS } from './guardianForm'
import { guardianField, type StudentRegisterForm } from './useStudentRegisterForm'

/** 학생 등록 폼의 학부모 칸 묶음: 제목, 학부모 줄들, 학부모 추가. 감싸는 상자는 쓰는 쪽이 정한다. */
export function GuardiansSection({ form }: { form: StudentRegisterForm }) {
  const { guardians, errors } = form
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-[18px] font-bold text-ink">학부모</h2>
        <p className="text-[14px] text-sub">{`최대 ${MAX_GUARDIANS}명`}</p>
      </div>
      <div className="grid gap-4">
        {guardians.map((guardian, index) => (
          <GuardianFields
            key={guardian.key}
            order={index + 1}
            value={guardian}
            errors={{
              relation: errors[guardianField(index, 'relation')],
              name: errors[guardianField(index, 'name')],
              phone: errors[guardianField(index, 'phone')],
            }}
            onChange={(next) => form.changeGuardian(guardian.key, next)}
            onRemove={() => form.removeGuardian(guardian.key)}
          />
        ))}
      </div>
      {guardians.length === 0 && (
        <p className="text-sub">학부모 없이 등록하려면 학생 휴대전화가 있어야 해요.</p>
      )}
      {errors.guardians && <Notice className="mt-4">{errors.guardians}</Notice>}
      {guardians.length < MAX_GUARDIANS && (
        <Button variant="ghost" size="sm" className="mt-4" onClick={form.addGuardian}>
          학부모 추가
        </Button>
      )}
    </div>
  )
}
