import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError, supportRequestId } from '@/shared/api'
import { useMe } from '@/shared/auth'
import { readCampusId, useCampuses } from '@/shared/campus'
import { readPage } from '@/shared/lib'
import {
  Button,
  EmptyState,
  Notice,
  Pagination,
  Pill,
  SelectField,
  Table,
  Td,
  Th,
} from '@/shared/ui'
import { useAccounts, type Account, type AccountFilters } from '../api'
import { AccountFormModal } from '../components/AccountFormModal'
import { AccountStatusModal, type StatusChange } from '../components/AccountStatusModal'
import { PasswordResetModal } from '../components/PasswordResetModal'
import { roleLabel, roleOptions, statusLabel, statusOptions } from '../labels'

// 선택 상자의 "전체". 조건 값과 겹치지 않게 빈 값으로 둔다.
const ALL = ''

/** 주소의 조건을 읽는다. 선택지에 없는 값은 없는 조건으로 본다(주소를 손으로 고친 경우). */
function readFilters(params: URLSearchParams): AccountFilters {
  const role = roleOptions.find((option) => option.value === params.get('role'))?.value
  const status = statusOptions.find((option) => option.value === params.get('status'))?.value
  return {
    role,
    campusId: readCampusId(params.get('campusId')),
    status,
    page: readPage(params.get('page')),
  }
}

// 닫혀 있거나, 새로 만들거나, 어느 계정을 고치는 중이거나.
type FormState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; target: Account }

/**
 * 계정 관리. 관리자 전용이다. 직원 계정을 만들고, 고치고, 차단하고, 비밀번호를 다시 정한다.
 * 직원마다 자기 계정으로 로그인해야 기록(누가 무엇을 했는지)과 지점 범위가 사람 단위로 맞는다.
 * 조건과 페이지는 주소에 둔다. 아이디와 이름은 조건이 아니라 주소에 남지 않는다.
 */
export function AccountsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readFilters(searchParams)
  const { data: me } = useMe()
  const campuses = useCampuses()
  const accounts = useAccounts(filters)
  const [form, setForm] = useState<FormState>({ mode: 'closed' })
  const [resetTarget, setResetTarget] = useState<Account | null>(null)
  const [statusChange, setStatusChange] = useState<StatusChange | null>(null)
  // 방금 끝난 일의 안내. 다음 일을 시작하면 지운다.
  const [doneNotice, setDoneNotice] = useState<string | null>(null)

  const campusNames = new Map(campuses.data?.map((campus) => [campus.id, campus.name]))

  // 주소에는 이 화면이 쓰는 값만 남긴다. 없는 조건과 첫 페이지(0)는 적지 않는다.
  function goTo(next: Partial<AccountFilters>) {
    const params = new URLSearchParams()
    if (next.role) params.set('role', next.role)
    if (next.campusId) params.set('campusId', String(next.campusId))
    if (next.status) params.set('status', next.status)
    if (next.page) params.set('page', String(next.page))
    setSearchParams(params)
  }

  // 조건이 바뀌면 첫 페이지부터 다시 본다.
  function changeFilter(next: Partial<AccountFilters>) {
    goTo({ ...filters, ...next, page: 0 })
  }

  function start(open: () => void) {
    setDoneNotice(null)
    open()
  }

  const data = accounts.data
  const error = accounts.error
  const filtered =
    filters.role !== undefined || filters.campusId !== undefined || filters.status !== undefined
  // 같은 조건의 다음 페이지를 받는 동안 보여주는 이전 페이지인지
  const showingPreviousPage = accounts.isPlaceholderData

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">계정</h1>
          <p className="mt-1 text-sub">
            직원마다 계정을 따로 만들어요. 퇴사한 직원의 계정은 차단해요.
          </p>
        </div>
        <Button onClick={() => start(() => setForm({ mode: 'create' }))}>계정 만들기</Button>
      </div>

      {doneNotice && (
        <Notice tone="success" className="mt-6">
          {doneNotice}
        </Notice>
      )}

      <div className="mt-7 grid max-w-[480px] grid-cols-3 items-start gap-3">
        <SelectField
          label="역할"
          name="roleFilter"
          value={filters.role ?? ALL}
          onChange={(event) =>
            changeFilter({
              role: roleOptions.find((option) => option.value === event.target.value)?.value,
            })
          }
        >
          <option value={ALL}>전체</option>
          {roleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="지점"
          name="campusFilter"
          value={filters.campusId === undefined ? ALL : String(filters.campusId)}
          onChange={(event) => changeFilter({ campusId: readCampusId(event.target.value) })}
        >
          <option value={ALL}>전체</option>
          {/* 주소의 지점이 선택지에 없으면(지점 목록을 못 받았거나 없는 지점) 그대로 선택지로 보여준다. */}
          {filters.campusId !== undefined && !campusNames.has(filters.campusId) && (
            <option value={filters.campusId}>{`지점 ${filters.campusId}`}</option>
          )}
          {campuses.data?.map((campus) => (
            <option key={campus.id} value={campus.id}>
              {campus.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="상태"
          name="statusFilter"
          value={filters.status ?? ALL}
          onChange={(event) =>
            changeFilter({
              status: statusOptions.find((option) => option.value === event.target.value)?.value,
            })
          }
        >
          <option value={ALL}>전체</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </div>

      {campuses.error && !campuses.data && (
        <div className="mt-6">
          <Notice>지점 이름을 불러오지 못했어요. 표의 지점이 비어 보일 수 있어요.</Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void campuses.refetch()}
            disabled={campuses.isFetching}
          >
            지점 다시 불러오기
          </Button>
        </div>
      )}

      {!data && !error && (
        <p role="status" className="py-24 text-center text-sub">
          계정 목록을 불러오고 있어요.
        </p>
      )}

      {error && (
        <div className="mt-6">
          <Notice requestId={supportRequestId(error)}>
            {data
              ? '최신 내용을 불러오지 못했어요. 아래 표는 이전 내용일 수 있어요.'
              : error instanceof ApiError
                ? error.message
                : '계정 목록을 불러오지 못했어요.'}
          </Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void accounts.refetch()}
            disabled={accounts.isFetching}
          >
            {accounts.isFetching ? '불러오는 중' : '다시 불러오기'}
          </Button>
        </div>
      )}

      {data && data.totalElements === 0 && (
        <EmptyState
          title={filtered ? '조건에 맞는 계정이 없어요' : '계정이 없어요'}
          className="py-16"
        >
          {filtered && (
            <Button variant="ghost" onClick={() => goTo({})}>
              조건 지우기
            </Button>
          )}
        </EmptyState>
      )}

      {/* 계정은 있는데 이 페이지가 비어 있다. 없는 페이지로 들어온 경우다. 계정이 없다고 하면 안 된다. */}
      {data && data.totalElements > 0 && data.items.length === 0 && (
        <EmptyState
          title="이 페이지에는 계정이 없어요"
          description={`조건에 맞는 계정은 모두 ${data.totalElements}개예요.`}
          className="py-16"
        >
          <Button onClick={() => goTo({ ...filters, page: 0 })}>첫 페이지로</Button>
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        // 다음 페이지를 받는 동안에는 이전 페이지가 보인다. 숫자와 표를 함께 흐리게 해서 아직 바뀌지 않았음을 알린다.
        <div
          className={showingPreviousPage ? 'opacity-60' : undefined}
          aria-busy={showingPreviousPage}
        >
          <p className="mt-7 text-right text-[14px] text-sub">{`전체 ${data.totalElements}개`}</p>
          {/* 저장한 뒤 새 목록이 늦으면 창이 먼저 닫힌다. 그동안 표가 옛 내용임을 흐리게 해서 알린다.
              페이지를 넘기는 중에는 바깥 묶음이 이미 흐리게 한다. 두 번 흐려지지 않게 그때는 끈다. */}
          <Table
            caption="계정 목록"
            wide
            refreshing={accounts.isFetching && !showingPreviousPage}
            className="mt-4"
          >
            <thead>
              <tr>
                <Th>아이디</Th>
                <Th>이름</Th>
                <Th>역할</Th>
                <Th>지점</Th>
                <Th>상태</Th>
                <Th>
                  <span className="sr-only">관리</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((account) => {
                // 이 화면은 로그인 가드 안이라 me가 있다. 없더라도 내 줄의 버튼이 보일 뿐이고, 눌러도 서버가 거부한다(409).
                const mine = account.id === me?.id
                const disabled = account.status === 'DISABLED'
                return (
                  // 차단된 계정은 흐리게 보여 쓰는 계정과 한눈에 구분되게 한다. 흐림은 DISABLED일 때만 건다(모르는 상태는 그대로).
                  <tr key={account.id} className={disabled ? 'text-sub' : undefined}>
                    <Td className="font-semibold">{account.loginId}</Td>
                    <Td>
                      {account.name}
                      {mine && <span className="ml-2 text-[13px] text-sub">나</span>}
                    </Td>
                    <Td>{roleLabel(account.role)}</Td>
                    <Td className="text-sub">
                      {account.campusId === null
                        ? '-'
                        : (campusNames.get(account.campusId) ??
                          // 지점이 있는 계정이다. 이름을 못 받았어도 지점이 없는 계정("-")과 같게 보이면 안 된다.
                          (campuses.data ? '목록에 없는 지점' : `지점 ${account.campusId}`))}
                    </Td>
                    <Td>
                      <Pill status={account.status === 'ACTIVE' ? 'valid' : 'used'}>
                        {statusLabel(account.status)}
                      </Pill>
                    </Td>
                    <Td>
                      <span className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`${account.loginId} 수정`}
                          onClick={() => start(() => setForm({ mode: 'edit', target: account }))}
                        >
                          수정
                        </Button>
                        {/* 자기 자신은 차단할 수 없고, 자기 비밀번호는 여기서 다시 정하지 않는다(서버도 409로 거부한다). 내 비밀번호 변경(POST /auth/password)으로 바꾼다. */}
                        {!mine && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`${account.loginId} 비밀번호 다시 정하기`}
                              onClick={() => start(() => setResetTarget(account))}
                            >
                              비밀번호
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`${account.loginId} ${disabled ? '차단 풀기' : '차단'}`}
                              onClick={() =>
                                start(() => setStatusChange({ account, disable: !disabled }))
                              }
                            >
                              {disabled ? '차단 풀기' : '차단'}
                            </Button>
                          </>
                        )}
                      </span>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            onChange={(page) => goTo({ ...filters, page })}
            disabled={showingPreviousPage}
            className="mt-6"
          />
        </div>
      )}

      <AccountFormModal
        open={form.mode !== 'closed'}
        onClose={() => setForm({ mode: 'closed' })}
        editing={form.mode === 'edit' ? form.target : undefined}
        self={form.mode === 'edit' && form.target.id === me?.id}
        onDone={setDoneNotice}
      />
      <PasswordResetModal
        onClose={() => setResetTarget(null)}
        account={resetTarget}
        onDone={setDoneNotice}
      />
      <AccountStatusModal
        onClose={() => setStatusChange(null)}
        change={statusChange}
        onDone={setDoneNotice}
      />
    </>
  )
}
