import { useState, type FormEvent } from 'react'
import {
  ApiError,
  isOutcomeUnknown,
  NO_SERVER_ERRORS,
  splitServerError,
  supportRequestId,
  type FieldErrors,
  type ServerErrors,
} from '@/shared/api'
import { PASSWORD_RULE_HINT, passwordError } from '@/shared/auth'
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
  UNSURE_RETRY,
  useAccount,
  useCreateAccount,
  useUpdateAccount,
  type Account,
  type AccountCreateRequest,
} from '../api'
import { ASSIGNABLE_ROLES, isAssignableRole, roleLabel, type AssignableRole } from '../labels'

type AccountFormModalProps = {
  open: boolean
  onClose: () => void
  /** 고칠 계정. 없으면 새로 만든다. 창을 열 때 이 계정을 새로 받아 폼을 채운다(목록의 값은 낡았을 수 있다). */
  editing?: Pick<Account, 'id' | 'loginId'>
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
  const form = { onClose, onDone, saving, runSaving }

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
      {editing ? (
        <AccountEditLoader key={editing.id} target={editing} self={self} {...form} />
      ) : (
        <AccountForm self={false} {...form} />
      )}
    </Modal>
  )
}

type FormHandlers = {
  onClose: () => void
  onDone: (message: string) => void
  saving: boolean
  /** 저장을 맡긴다. 맡긴 일이 끝나면 `saving`이 풀린다(useSaving). */
  runSaving: RunSaving
}

type AccountEditLoaderProps = FormHandlers & {
  target: Pick<Account, 'id' | 'loginId'>
  self: boolean
}

/** 고칠 계정을 새로 받아 폼을 채운다. 받는 동안과 받지 못했을 때는 폼 대신 안내를 보여준다. */
function AccountEditLoader({ target, self, ...form }: AccountEditLoaderProps) {
  const account = useAccount(target.id)
  // 폼은 처음 받은 값으로 시작하고, 고치는 동안 그 값이 바뀌지 않는다(useAccount가 다시 받지 않는다).
  if (account.data) return <AccountForm editing={account.data} self={self} {...form} />

  return (
    <div className="mt-5 text-left">
      {account.error ? (
        <Notice requestId={supportRequestId(account.error)}>
          {account.error instanceof ApiError ? account.error.message : '계정을 불러오지 못했어요.'}
        </Notice>
      ) : (
        <p role="status" className="py-6 text-center text-sub">
          {`${target.loginId} 계정을 불러오고 있어요.`}
        </p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={form.onClose}>
          닫기
        </Button>
        <Button onClick={() => void account.refetch()} disabled={account.isFetching}>
          {account.isFetching ? '불러오는 중' : '다시 불러오기'}
        </Button>
      </div>
    </div>
  )
}

// 서버가 errors[].field로 주는 이름과 같다(요청 본문의 필드 이름). 서버가 이름을 바꾸면 여기서 컴파일 에러가 난다.
const fieldNames = [
  'loginId',
  'name',
  'password',
  'role',
  'campusId',
] as const satisfies readonly (keyof AccountCreateRequest)[]
type FieldName = (typeof fieldNames)[number]

// 필드 목록 없이 코드로만 오는 에러가 어느 칸의 문제인지.
const codeFields: Record<string, FieldName> = {
  AUTH_LOGIN_ID_DUPLICATED: 'loginId',
  AUTH_PASSWORD_NOT_ACCEPTABLE: 'password',
  AUTH_CAMPUS_NOT_FOUND: 'campusId',
  AUTH_ROLE_CAMPUS_MISMATCH: 'campusId',
  AUTH_PARTNER_ACCOUNT_NOT_SUPPORTED: 'role',
  // 아래 둘은 이 창에서는 역할이나 지점을 바꿀 때만 온다.
  AUTH_SELF_CHANGE_NOT_ALLOWED: 'role',
  AUTH_LAST_ADMIN: 'role',
}
const LOGIN_ID_DUPLICATED = 'AUTH_LOGIN_ID_DUPLICATED'

// 서버가 받는 아이디의 꼴: 영문 소문자, 숫자, 점, 밑줄, 하이픈으로 3~50자이고 첫 글자는 영문이나 숫자다.
const LOGIN_ID = /^[a-z0-9][a-z0-9._-]{2,49}$/
const LOGIN_ID_HINT =
  '영문 소문자, 숫자, 점(.), 밑줄(_), 하이픈(-)으로 3~50자. 만든 뒤에는 바꿀 수 없어요. 예: desk.dongtan'
// 서버가 받는 이름의 최대 길이
const NAME_MAX_LENGTH = 50

type AccountFormProps = FormHandlers & {
  /** 고칠 계정(방금 받은 값). 없으면 새로 만든다. */
  editing?: Account
  self: boolean
}

function AccountForm({ onClose, editing, self, onDone, saving, runSaving }: AccountFormProps) {
  const campuses = useCampuses()
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()
  const mutation = editing ? updateAccount : createAccount

  // 고를 수 없는 역할의 계정(연계 학원, 또는 이 화면이 아직 모르는 역할)은 이름만 고칠 수 있다.
  // 역할과 지점은 받은 값을 그대로 돌려보낸다.
  const fixedRole = editing !== undefined && !isAssignableRole(editing.role)
  const roleLocked = fixedRole || (editing !== undefined && self)

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
  // 만들기 요청을 보냈는데 만들어졌는지 알 수 없게 끝난(응답 없음, 서버 오류) 아이디.
  const [unsureLoginId, setUnsureLoginId] = useState<string | null>(null)

  const staff = !fixedRole && role === 'STAFF'
  // 지금 화면에 그려진 칸. 그려지지 않은 칸의 오류는 폼 아래로 내린다.
  const shown: Record<FieldName, boolean> = {
    loginId: true,
    name: true,
    password: !editing,
    role: true,
    campusId: staff,
  }

  const server: ServerErrors<FieldName> = mutation.isError
    ? splitServerError(mutation.error, {
        fields: fieldNames,
        codes: codeFields,
        unsure: editing
          ? UNSURE_RETRY
          : // 만들기는 멱등 키가 없다. 그대로 다시 보내면 "이미 사용 중인 아이디"가 온다. 다시 누르라고 하지 않는다.
            `만들어졌을 수도 있어요. 다시 만들기 전에, 창을 닫고 목록에 ${unsureLoginId ?? '그'} 계정이 있는지 먼저 확인해 주세요.`,
      })
    : NO_SERVER_ERRORS
  // 응답을 놓친 만들기를 같은 아이디로 다시 보내 "이미 사용 중"이 왔다. 남이 쓰는 아이디가 아니라 방금 만든 계정일 수 있다.
  // 그대로 두면 아이디를 바꿔 계정을 하나 더 만들기 쉽다.
  const createdEarlier =
    !editing &&
    unsureLoginId !== null &&
    createAccount.error instanceof ApiError &&
    createAccount.error.code === LOGIN_ID_DUPLICATED &&
    createAccount.variables?.loginId === unsureLoginId
  const errors: FieldErrors<FieldName> = {
    ...server.fields,
    ...(createdEarlier
      ? {
          loginId: `앞서 보낸 요청으로 이미 만들어졌을 수 있어요. 창을 닫고 목록에서 ${unsureLoginId} 계정을 확인해 주세요.`,
        }
      : {}),
    ...localErrors,
  }
  // 서버가 그려지지 않은 칸을 짚었다(예: 관리자인데 지점의 오류). 칸 밑에 보일 곳이 없으니 폼 아래에 보여준다.
  const hiddenErrors = fieldNames
    .filter((field) => !shown[field])
    .flatMap((field) => server.fields[field] ?? [])
  const formError = server.form ?? (hiddenErrors.length > 0 ? hiddenErrors.join(' ') : null)

  // 지점 목록이 없으면 고를 수 없다. "골라 주세요"가 아니라 왜 못 고르는지를 알린다.
  const campusUnavailable = campuses.data
    ? undefined
    : campuses.error
      ? '지점을 불러오지 못했어요. 아래에서 다시 불러와 주세요.'
      : '지점을 불러오고 있어요. 잠시만 기다려 주세요.'

  // 지점 칸의 지난 오류를 지운다.
  function clearCampusError() {
    setLocalErrors((current) => {
      const rest = { ...current }
      delete rest.campusId
      return rest
    })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // 문제가 없는 칸은 키를 넣지 않는다. undefined로 넣어도 키로 세어져 아래에서 보내지 않게 되고,
    // 위에서 합칠 때 서버가 준 오류도 가린다.
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
    if (staff && campusId === '') nextErrors.campusId = campusUnavailable ?? '지점을 골라 주세요.'
    setLocalErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      // 보내지 않았으니 지난번 서버 오류는 지금 입력에 대한 것이 아니다.
      mutation.reset()
      return
    }

    // 직원이면 지점을 반드시 넣고, 관리자면 null로 보낸다(서버 규칙).
    const assignment = fixedRole
      ? { role: editing.role, campusId: editing.campusId }
      : { role, campusId: staff ? Number(campusId) : null }

    void runSaving(async () => {
      try {
        if (editing) {
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
      } catch (error) {
        // 요청의 실패는 mutation.error로 화면에 보여준다.
        // 만들기는 서버에 만들어졌을 수 있다. 어느 아이디였는지 적어 둔다.
        if (!editing && isOutcomeUnknown(error)) setUnsureLoginId(id)
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
          // 저장된 (관리자 자신의) 비밀번호를 채워 넣지 말라고 브라우저에 알린다.
          autoComplete="new-password"
          hint={PASSWORD_RULE_HINT}
          error={errors.password}
        />
      )}
      {fixedRole ? (
        <TextField
          label="역할"
          name="role"
          value={roleLabel(editing.role)}
          readOnly
          disabled
          hint={
            editing.role === 'PARTNER'
              ? '연계 학원 계정은 역할과 지점을 바꿀 수 없어요.'
              : '이 화면이 모르는 역할이에요. 이름만 고칠 수 있어요.'
          }
          error={errors.role}
        />
      ) : (
        <>
          <Segmented
            label="역할"
            name="role"
            value={role}
            onChange={(value) => {
              if (isAssignableRole(value)) setRole(value)
            }}
            options={ASSIGNABLE_ROLES.map((value) => ({ value, label: roleLabel(value) }))}
            disabled={roleLocked}
            hint={
              roleLocked
                ? '내 역할과 지점은 바꿀 수 없어요.'
                : editing
                  ? '역할이나 지점을 바꾸면 그 계정은 바로 로그아웃돼요.'
                  : '관리자는 계정과 설정을 관리하고 모든 지점을 봐요.'
            }
            error={errors.role}
          />
          {staff && (
            <div>
              <SelectField
                label="지점"
                name="campusId"
                value={campusId}
                onChange={(event) => {
                  setCampusId(event.target.value)
                  // 골랐으니 "골라 주세요"나 "불러오지 못했어요"는 맞지 않는다.
                  clearCampusError()
                }}
                disabled={roleLocked || !campuses.data}
                hint={campusUnavailable}
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
              {/* 창을 닫았다 열면 입력한 아이디와 비밀번호를 잃는다. 창 안에서 다시 받게 한다. */}
              {campuses.error && !campuses.data && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    clearCampusError()
                    void campuses.refetch()
                  }}
                  disabled={campuses.isFetching}
                >
                  {campuses.isFetching ? '불러오는 중' : '지점 다시 불러오기'}
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {formError && <Notice requestId={server.requestId}>{formError}</Notice>}
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onClose}>
          취소
        </Button>
        <Button type="submit">{saving ? '저장하는 중' : editing ? '저장' : '만들기'}</Button>
      </div>
    </Form>
  )
}
