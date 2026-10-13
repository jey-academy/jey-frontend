import { useState, type FormEvent } from 'react'
import { NO_SERVER_ERRORS, type FieldErrors } from '@/shared/api'
import { useCampuses } from '@/shared/campus'
import {
  Button,
  Form,
  Modal,
  Notice,
  PasswordField,
  Segmented,
  SelectField,
  TextField,
  useSaving,
  type RunSaving,
} from '@/shared/ui'
import {
  splitAccountError,
  UNSURE_RETRY,
  useCreateAccount,
  useUpdateAccount,
  type Account,
} from '../api'
import { ASSIGNABLE_ROLES, isAssignableRole, roleLabel, type AssignableRole } from '../labels'
import { PASSWORD_RULE_HINT, passwordError } from '../password'

type AccountFormModalProps = {
  open: boolean
  onClose: () => void
  /** 고칠 계정. 없으면 새로 만든다. */
  editing?: Account
  /** 고치는 계정이 지금 로그인한 자기 자신인지. 자기 역할과 지점은 바꿀 수 없다. */
  self?: boolean
  /** 저장에 성공했을 때. 화면에 남길 안내 문구를 넘긴다. */
  onDone: (message: string) => void
}

/** 계정 만들기·고치기 창. 닫히면 안의 폼이 사라지므로, 다시 열 때마다 입력값(비밀번호 포함)이 처음 상태로 돌아간다. */
export function AccountFormModal({
  open,
  onClose,
  editing,
  self = false,
  onDone,
}: AccountFormModalProps) {
  // 저장하는 동안에는 닫지 못하게 한다(closable). 닫아도 요청은 끝까지 가므로, 취소한 줄 알았는데 저장되거나
  // 실패했는데 안내를 볼 곳이 없어지는 일이 생긴다.
  const [saving, runSaving] = useSaving()

  return (
    <Modal
      open={open}
      onClose={onClose}
      closable={!saving}
      title={editing ? '계정 수정' : '계정 만들기'}
      // 입력하던 내용이 실수로 사라지지 않게 배경을 눌러도 닫지 않는다.
      closeOnBackdrop={false}
      className="max-w-[460px]"
    >
      <AccountForm
        // 대상이 바뀌면 폼을 새로 만든다. 앞의 것에 쓰던 값이 다른 수정 창에 남지 않게 한다.
        key={editing?.id ?? 'new'}
        onClose={onClose}
        editing={editing}
        self={self}
        onDone={onDone}
        saving={saving}
        runSaving={runSaving}
      />
    </Modal>
  )
}

type FieldName = 'loginId' | 'name' | 'password' | 'role' | 'campusId'

// 서버가 errors[].field로 주는 이름과 같다(요청 본문의 필드 이름).
const fieldNames: FieldName[] = ['loginId', 'name', 'password', 'role', 'campusId']
// 필드 목록 없이 코드로만 오는 에러가 어느 칸의 문제인지.
const codeFields: Record<string, FieldName> = {
  AUTH_LOGIN_ID_DUPLICATED: 'loginId',
  AUTH_PASSWORD_NOT_ACCEPTABLE: 'password',
  AUTH_CAMPUS_NOT_FOUND: 'campusId',
  AUTH_ROLE_CAMPUS_MISMATCH: 'campusId',
  AUTH_PARTNER_ACCOUNT_NOT_SUPPORTED: 'role',
  AUTH_SELF_CHANGE_NOT_ALLOWED: 'role',
  AUTH_LAST_ADMIN: 'role',
}

// 서버가 받는 아이디의 꼴: 영문 소문자, 숫자, 점, 밑줄, 하이픈으로 3~50자이고 첫 글자는 영문이나 숫자다.
const LOGIN_ID = /^[a-z0-9][a-z0-9._-]{2,49}$/
const LOGIN_ID_HINT =
  '영문 소문자, 숫자, 점(.), 밑줄(_), 하이픈(-)으로 3~50자. 만든 뒤에는 바꿀 수 없어요. 예: desk.dongtan'
// 서버가 받는 이름의 최대 길이
const NAME_MAX_LENGTH = 50

type AccountFormProps = Omit<AccountFormModalProps, 'open' | 'self'> & {
  self: boolean
  saving: boolean
  /** 저장을 맡긴다. 맡긴 일이 끝나면 `saving`이 풀린다(useSaving). */
  runSaving: RunSaving
}

function AccountForm({ onClose, editing, self, onDone, saving, runSaving }: AccountFormProps) {
  const campuses = useCampuses()
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()
  const mutation = editing ? updateAccount : createAccount

  // 연계 학원 계정은 이름만 고칠 수 있다. 역할과 지점은 받은 값을 그대로 돌려보낸다.
  const partner = editing !== undefined && !isAssignableRole(editing.role)
  const roleLocked = partner || self

  const [loginId, setLoginId] = useState(editing?.loginId ?? '')
  const [name, setName] = useState(editing?.name ?? '')
  // 비밀번호 원문. 이 폼의 state와 요청 본문 밖으로 내보내지 않는다.
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AssignableRole>(
    editing && isAssignableRole(editing.role) ? editing.role : 'STAFF',
  )
  const [campusId, setCampusId] = useState(editing?.campusId ? String(editing.campusId) : '')
  // 보내기 전에 걸러 낸 오류. 서버가 준 오류는 mutation.error에서 읽는다.
  const [localErrors, setLocalErrors] = useState<FieldErrors<FieldName>>({})

  const server = mutation.isError
    ? splitAccountError(mutation.error, {
        fields: fieldNames,
        codes: codeFields,
        // 만들기는 멱등 키가 없어 다시 보내면 "이미 사용 중인 아이디"가 온다. 기본 안내(목록 확인)를 쓴다.
        ...(editing ? { unsure: UNSURE_RETRY } : {}),
      })
    : NO_SERVER_ERRORS
  const errors: FieldErrors<FieldName> = { ...server.fields, ...localErrors }

  const staff = !partner && role === 'STAFF'

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // 문제가 없는 칸은 키를 넣지 않는다. undefined로 넣으면 위에서 합칠 때 서버가 준 오류를 지워 버린다.
    const nextErrors: FieldErrors<FieldName> = {}
    const id = loginId.trim()
    if (!editing) {
      if (id === '') nextErrors.loginId = '아이디를 입력해 주세요.'
      else if (!LOGIN_ID.test(id)) {
        nextErrors.loginId =
          '영문 소문자, 숫자, 점(.), 밑줄(_), 하이픈(-)으로 3~50자여야 해요. 첫 글자는 영문이나 숫자예요.'
      }
      const invalidPassword = passwordError(password, id)
      if (invalidPassword) nextErrors.password = invalidPassword
    }
    if (name.trim() === '') nextErrors.name = '이름을 입력해 주세요.'
    if (staff && campusId === '') nextErrors.campusId = '지점을 골라 주세요.'
    setLocalErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      // 보내지 않았으니 지난번 서버 오류는 지금 입력에 대한 것이 아니다.
      mutation.reset()
      return
    }

    // 직원이면 지점을 반드시 넣고, 그 밖의 역할이면 null로 보낸다(서버 규칙).
    const assignment = partner
      ? { role: editing.role, campusId: null }
      : { role, campusId: role === 'STAFF' ? Number(campusId) : null }

    void runSaving(async () => {
      try {
        if (editing) {
          // 통째로 바꾸는 요청이다. 그대로 둘 값도 모두 보낸다.
          await updateAccount.mutateAsync({
            id: editing.id,
            body: { name: name.trim(), ...assignment },
          })
        } else {
          await createAccount.mutateAsync({
            loginId: id,
            name: name.trim(),
            password,
            ...assignment,
          })
        }
      } catch {
        // 요청의 실패는 mutation.error로 화면에 보여준다.
        return
      }
      onDone(
        editing
          ? `${editing.loginId} 계정을 고쳤어요.`
          : // 서버는 처음 비밀번호를 바꾸라고 강제하지 않는다. 전하는 사람이 안내해야 한다.
            `${id} 계정을 만들었어요. 처음 비밀번호를 직접 전하고, 로그인한 뒤 바꾸게 안내해 주세요.`,
      )
      onClose()
    })
  }

  return (
    <Form saving={saving} onSubmit={handleSubmit} className="mt-5 grid gap-4 text-left">
      <TextField
        label="아이디"
        name="loginId"
        value={loginId}
        // 아이디는 소문자만 받는다. 대문자로 쳐도 소문자로 바꿔 준다.
        onChange={(event) => setLoginId(event.target.value.toLowerCase())}
        maxLength={50}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        // 아이디는 만든 뒤 바꿀 수 없다.
        disabled={Boolean(editing)}
        hint={editing ? '아이디는 바꿀 수 없어요.' : LOGIN_ID_HINT}
        error={errors.loginId}
      />
      <TextField
        label="이름"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={NAME_MAX_LENGTH}
        autoComplete="off"
        hint={
          editing ? '로그인돼 있는 화면에는 다음 로그인부터 보여요.' : '화면에 보일 이름이에요.'
        }
        error={errors.name}
      />
      {!editing && (
        <PasswordField
          label="처음 비밀번호"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          // 브라우저가 관리자 자신의 비밀번호를 채워 넣지 않게 한다.
          autoComplete="new-password"
          hint={PASSWORD_RULE_HINT}
          error={errors.password}
        />
      )}
      {partner ? (
        <TextField
          label="역할"
          name="role"
          value={roleLabel(editing.role)}
          readOnly
          disabled
          hint="연계 학원 계정은 역할과 지점을 바꿀 수 없어요."
          error={errors.role}
        />
      ) : (
        <>
          <div>
            <Segmented
              label="역할"
              name="role"
              value={role}
              onChange={(value) => {
                if (isAssignableRole(value)) setRole(value)
              }}
              options={ASSIGNABLE_ROLES.map((value) => ({ value, label: roleLabel(value) }))}
              disabled={roleLocked}
            />
            {/* 역할 칸의 오류와 안내. Segmented에는 안내 자리가 없어 바로 아래에 둔다. */}
            {errors.role ? (
              <p className="mt-1.5 text-[13px] font-semibold text-pill-expired">{errors.role}</p>
            ) : (
              <p className="mt-1.5 text-[13px] text-sub">
                {self
                  ? '내 역할과 지점은 바꿀 수 없어요.'
                  : editing
                    ? '역할이나 지점을 바꾸면 그 계정은 바로 로그아웃돼요.'
                    : '관리자는 계정과 설정을 관리하고 모든 지점을 봐요.'}
              </p>
            )}
          </div>
          {staff && (
            <SelectField
              label="지점"
              name="campusId"
              value={campusId}
              onChange={(event) => setCampusId(event.target.value)}
              disabled={roleLocked || !campuses.data}
              hint={
                campuses.data
                  ? undefined
                  : campuses.error
                    ? '지점을 불러오지 못했어요. 창을 닫고 다시 열어 주세요.'
                    : '지점을 불러오고 있어요.'
              }
              error={errors.campusId}
            >
              <option value="">지점을 골라 주세요</option>
              {/* 지점 목록에 없는 지점(받지 못했거나 없어진 지점)도 지금 값은 선택지로 남긴다. */}
              {campusId !== '' &&
                !campuses.data?.some((campus) => String(campus.id) === campusId) && (
                  <option value={campusId}>{`지점 ${campusId}`}</option>
                )}
              {campuses.data?.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </SelectField>
          )}
        </>
      )}
      {server.form && <Notice requestId={server.requestId}>{server.form}</Notice>}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          취소
        </Button>
        <Button type="submit">{saving ? '저장하는 중' : editing ? '저장' : '만들기'}</Button>
      </div>
    </Form>
  )
}
