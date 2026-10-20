import { useState } from 'react'
import { Link } from 'react-router'
import { ApiError, CODE_ERROR_MESSAGE, isOutcomeUnknown, supportRequestId } from '@/shared/api'
import { formatDate } from '@/shared/lib'
import { usePartners, type Partner } from '@/shared/partner'
import { Button, EmptyState, Notice, Pill, Table, Td, Th } from '@/shared/ui'
import { useSetPartnerActive } from '../api'
import { CampusBenefitSection } from '../components/CampusBenefitSection'
import { PartnerAccountFormModal } from '../components/PartnerAccountFormModal'
import { PartnerDeactivateModal } from '../components/PartnerDeactivateModal'
import { PartnerFormModal } from '../components/PartnerFormModal'

/** 연계 학원 계정만 걸러 본 계정 관리 화면. 계정의 이름 고치기·차단·비밀번호는 그 화면에서 한다. */
const PARTNER_ACCOUNTS_PATH = '/admin/settings/accounts?role=PARTNER'

const linkClassName =
  'rounded-btn-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

// 날짜를 읽지 못해도 화면 전체를 내리지 않는다. 그 칸만 받은 값 그대로 보여준다.
function displayDate(value: string): string {
  try {
    return formatDate(value)
  } catch {
    return value
  }
}

/** 켜기가 실패했을 때 화면에 보여줄 문구. */
function activateErrorMessage(error: unknown): string {
  // 화면 코드의 버그다.
  if (!(error instanceof ApiError)) return CODE_ERROR_MESSAGE
  // 응답을 받지 못했다. 같은 요청을 다시 보내도 결과가 같다.
  if (isOutcomeUnknown(error))
    return `${error.message} 켜졌는지 확인하지 못했어요. 그대로 다시 눌러도 돼요.`
  return error.message
}

/** 방금 끝난 일의 안내. `accountsLink`면 계정 관리로 가는 링크를 붙인다. */
type DoneNotice = { message: string; accountsLink?: boolean }

/**
 * 연계 학원 관리. 관리자 전용이다. 동탄고 패스를 발급하는 학원을 만들고, 학원마다 공용 계정을 만들고, 학원을 끄고 켠다.
 * 만든 계정의 이름 고치기·차단·비밀번호는 계정 관리 화면에서 한다.
 */
export function PartnersPage() {
  const partners = usePartners()
  const activate = useSetPartnerActive()
  const [creating, setCreating] = useState(false)
  const [accountFor, setAccountFor] = useState<Pick<Partner, 'id' | 'name'> | null>(null)
  const [deactivating, setDeactivating] = useState<Pick<Partner, 'id' | 'name'> | null>(null)
  // 켜려는 학원. 실패했을 때 안내에 이름을 쓴다.
  const [activating, setActivating] = useState<Pick<Partner, 'id' | 'name'> | null>(null)
  // 방금 끝난 일의 안내. 다음 일을 시작하면 지운다.
  const [done, setDone] = useState<DoneNotice | null>(null)

  // 다음 일을 시작할 때 지난 안내를 지운다. 켜는 중에는 모든 버튼이 막혀 있어 부르지 않는다.
  // 부르면 reset이 진행 중인 켜기에서 떨어져, 켜기의 결과 안내(성공이든 실패든)를 받지 못한다.
  function start(open: () => void) {
    setDone(null)
    activate.reset()
    open()
  }

  function turnOn(partner: Partner) {
    start(() => setActivating(partner))
    activate.mutate(
      { id: partner.id, active: true },
      {
        // 끌 때 차단된 계정은 풀리지 않는다. 계정 관리에서 따로 풀어야 한다.
        onSuccess: () =>
          setDone({
            message: `${partner.name} 학원을 켰어요. 끌 때 차단된 계정은 계정 관리에서 따로 풀어 주세요.`,
            accountsLink: true,
          }),
      },
    )
  }

  const rows = partners.data
  const error = partners.error
  const activeCount = rows?.filter((row) => row.active).length ?? 0
  const anyInactive = rows !== undefined && rows.length > activeCount

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">연계 학원</h1>
          <p className="mt-1 text-sub">
            학원마다 공용 계정을 만들어 동탄고 패스를 발급하게 해요. 만든 계정의
            이름·차단·비밀번호는{' '}
            <Link to={PARTNER_ACCOUNTS_PATH} className={linkClassName}>
              계정 관리
            </Link>
            에서 고쳐요.
          </p>
        </div>
        {/* 만들기 창은 목록을 받은 뒤에 연다. 받기 전에 만들면 표가 비어 있어 결과를 확인할 곳이 없다. */}
        <Button
          onClick={() => start(() => setCreating(true))}
          disabled={!rows || activate.isPending}
        >
          연계 학원 만들기
        </Button>
      </div>

      {done && (
        <Notice tone="success" className="mt-6">
          {done.message}
          {done.accountsLink && (
            <>
              {' '}
              <Link to={PARTNER_ACCOUNTS_PATH} className={linkClassName}>
                연계 학원 계정 보기
              </Link>
            </>
          )}
        </Notice>
      )}
      {activate.isError && activating && (
        <Notice className="mt-6" requestId={supportRequestId(activate.error)}>
          {`${activating.name} 학원을 켜지 못했어요. ${activateErrorMessage(activate.error)}`}
        </Notice>
      )}

      {!rows && !error && (
        <p role="status" className="py-24 text-center text-sub">
          연계 학원을 불러오고 있어요.
        </p>
      )}

      {error && (
        <div className="mt-6">
          <Notice requestId={supportRequestId(error)}>
            {rows
              ? // 전에 받은 목록이 아래에 남아 있다. 방금 바꾼 내용이 빠져 있을 수 있다는 것을 알린다.
                '최신 내용을 불러오지 못했어요. 아래 표는 이전 내용일 수 있어요.'
              : error instanceof ApiError
                ? error.message
                : '연계 학원을 불러오지 못했어요.'}
          </Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void partners.refetch()}
            disabled={partners.isFetching}
          >
            {partners.isFetching ? '불러오는 중' : '다시 불러오기'}
          </Button>
        </div>
      )}

      {rows &&
        (rows.length === 0 ? (
          <EmptyState
            title="연계 학원이 없어요"
            description="학원을 만들고 그 학원의 계정을 만들면, 그 계정으로 동탄고 패스를 발급할 수 있어요."
            className="py-16"
          >
            <Button onClick={() => start(() => setCreating(true))}>연계 학원 만들기</Button>
          </EmptyState>
        ) : (
          <>
            <p className="mt-7 text-right text-[14px] text-sub">
              켜진 학원 {activeCount}곳{anyInactive && `, 꺼진 학원 ${rows.length - activeCount}곳`}
            </p>
            {/* 바꾼 뒤 새 목록이 늦으면 창이 먼저 닫힌다. 그동안 표가 옛 내용임을 흐리게 해서 알린다. */}
            <Table caption="연계 학원" stack refreshing={partners.isFetching} className="mt-4">
              <thead>
                <tr>
                  <Th>이름</Th>
                  <Th>상태</Th>
                  <Th>만든 날</Th>
                  <Th>
                    <span className="sr-only">관리</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const turningOn = activate.isPending && activating?.id === row.id
                  return (
                    // 꺼진 학원은 흐리게 보여 켜진 학원과 한눈에 구분되게 한다.
                    <tr key={row.id} className={row.active ? undefined : 'text-sub'}>
                      <Td className="font-semibold">{row.name}</Td>
                      <Td label="상태">
                        <Pill status={row.active ? 'valid' : 'used'}>
                          {row.active ? '켜짐' : '꺼짐'}
                        </Pill>
                      </Td>
                      <Td label="만든 날" className="text-sub tabular-nums">
                        {displayDate(row.createdAt)}
                      </Td>
                      <Td actions>
                        {/* 꺼진 학원에는 계정을 만들 수 없다(서버도 409로 거부한다). 까닭은 표 아래에 적어 둔다. */}
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`${row.name} 계정 만들기`}
                          onClick={() => start(() => setAccountFor(row))}
                          disabled={!row.active || activate.isPending}
                        >
                          계정 만들기
                        </Button>
                        {row.active ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`${row.name} 끄기`}
                            onClick={() => start(() => setDeactivating(row))}
                            disabled={activate.isPending}
                          >
                            끄기
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`${row.name} 켜기`}
                            onClick={() => turnOn(row)}
                            disabled={activate.isPending}
                          >
                            {turningOn ? '켜는 중' : '켜기'}
                          </Button>
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            {anyInactive && (
              <p className="mt-3 text-[14px] text-sub">
                꺼진 학원에는 계정을 만들 수 없어요. 먼저 켜 주세요.
              </p>
            )}
          </>
        ))}

      {/* 반대 방향(JEY 발급 → 연계 학원 사용)의 할인율. 연계 학원 쪽 일이라 이 화면에 둔다. */}
      <CampusBenefitSection />

      <PartnerFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onDone={(message) => setDone({ message })}
      />
      <PartnerAccountFormModal
        partner={accountFor}
        onClose={() => setAccountFor(null)}
        onDone={(message) => setDone({ message, accountsLink: true })}
      />
      <PartnerDeactivateModal
        partner={deactivating}
        onClose={() => setDeactivating(null)}
        onDone={(message) => setDone({ message })}
      />
    </>
  )
}
