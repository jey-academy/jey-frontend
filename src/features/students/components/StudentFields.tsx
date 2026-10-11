import type { AcademyClass, Campus } from '@/shared/campus'
import { SelectField, TextField } from '@/shared/ui'
import { gradeOptions, statusOptions, type Grade, type Status } from '../labels'
import { REGISTERED_AT_MAX, REGISTERED_AT_MIN } from '../registeredAt'

/** 학생 칸의 입력값. 선택 상자의 값은 문자열로 들고 있고, 고르지 않았으면 빈 문자열이다. */
export type StudentInput = {
  name: string
  grade: Grade | ''
  campusId: string
  classId: string
  school: string
  registeredAt: string
  /** 입력한 휴대전화 번호 원문. 화면과 요청 본문 밖으로 내보내지 않는다. */
  phone: string
}

export type StudentFieldErrors = Partial<Record<keyof StudentInput | 'status', string>>

type StudentFieldsProps = {
  value: StudentInput
  onChange: (next: StudentInput) => void
  errors: StudentFieldErrors
  campuses: Campus[]
  /** 전 지점의 운영 중인 반. 고른 지점의 반만 선택지로 보여준다. */
  classes: AcademyClass[]
  /** 학생 휴대전화 칸의 도움말. 등록과 수정이 다르다. */
  phoneHint: string
  /** 재원 상태. 주면 상태 칸을 보여준다(수정 화면). */
  status?: { value: Status; onChange: (next: Status) => void }
  /**
   * 학생이 지금 속한 반. 반 목록에 없어도(꺼졌거나 방금 바뀐 반) 선택지로 남긴다.
   * 남기지 않으면 칸에는 "정하지 않음"이 보이는데 저장할 때는 지금 반이 그대로 보내지고,
   * 다른 반을 골랐다가 지금 반으로 되돌릴 수도 없다.
   */
  currentClass?: { id: number; campusId: number }
  disabled?: boolean
}

/** 학생 정보의 입력칸 묶음. 등록 화면과 수정 화면이 같이 쓴다. */
export function StudentFields({
  value,
  onChange,
  errors,
  campuses,
  classes,
  phoneHint,
  status,
  currentClass,
  disabled = false,
}: StudentFieldsProps) {
  const classOptions = classes.filter((item) => String(item.campusId) === value.campusId)
  const keepsCurrentClass =
    currentClass !== undefined &&
    String(currentClass.campusId) === value.campusId &&
    !classOptions.some((item) => item.id === currentClass.id)

  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="mb-4 text-[18px] font-bold text-ink">학생</legend>
      <TextField
        label="이름"
        name="name"
        value={value.name}
        onChange={(event) => onChange({ ...value, name: event.target.value })}
        maxLength={50}
        autoComplete="off"
        disabled={disabled}
        error={errors.name}
      />
      <SelectField
        label="학년"
        name="grade"
        value={value.grade}
        onChange={(event) => onChange({ ...value, grade: event.target.value as Grade | '' })}
        disabled={disabled}
        error={errors.grade}
      >
        <option value="">골라 주세요</option>
        {gradeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="지점"
        name="campusId"
        value={value.campusId}
        // 반은 지점에 속한다. 지점을 바꾸면 골라 둔 반은 맞지 않는다.
        onChange={(event) => onChange({ ...value, campusId: event.target.value, classId: '' })}
        disabled={disabled}
        error={errors.campusId}
      >
        <option value="">골라 주세요</option>
        {campuses.map((campus) => (
          <option key={campus.id} value={campus.id}>
            {campus.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="반"
        name="classId"
        value={value.classId}
        onChange={(event) => onChange({ ...value, classId: event.target.value })}
        disabled={disabled || value.campusId === ''}
        hint={
          value.campusId === '' ? '지점을 먼저 골라 주세요.' : '아직 정하지 않았으면 비워 두세요.'
        }
        error={errors.classId}
      >
        <option value="">정하지 않음</option>
        {keepsCurrentClass && <option value={currentClass.id}>지금 반 (목록에 없는 반)</option>}
        {classOptions.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </SelectField>
      <TextField
        label="학교"
        name="school"
        value={value.school}
        onChange={(event) => onChange({ ...value, school: event.target.value })}
        maxLength={50}
        autoComplete="off"
        disabled={disabled}
        error={errors.school}
      />
      <TextField
        label="등록일"
        name="registeredAt"
        type="date"
        value={value.registeredAt}
        onChange={(event) => onChange({ ...value, registeredAt: event.target.value })}
        min={REGISTERED_AT_MIN}
        max={REGISTERED_AT_MAX}
        disabled={disabled}
        error={errors.registeredAt}
      />
      <TextField
        label="학생 휴대전화"
        name="phone"
        type="tel"
        inputMode="tel"
        value={value.phone}
        onChange={(event) => onChange({ ...value, phone: event.target.value })}
        autoComplete="off"
        placeholder="010-1234-5678"
        disabled={disabled}
        hint={phoneHint}
        error={errors.phone}
      />
      {status !== undefined && (
        <SelectField
          label="상태"
          name="status"
          value={status.value}
          onChange={(event) => status.onChange(event.target.value as Status)}
          disabled={disabled}
          error={errors.status}
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      )}
    </fieldset>
  )
}
