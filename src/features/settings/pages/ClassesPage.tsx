import { useState } from 'react'
import { ApiError } from '@/shared/api'
import { formatWon } from '@/shared/lib'
import { Button, EmptyState, Notice, Pill, Segmented, Table, Td, Th } from '@/shared/ui'
import { useCampuses, useClassFees, type ClassFee } from '../api'
import { ClassFormModal } from '../components/ClassFormModal'

const ALL = 'all'

// 닫혀 있거나, 새로 등록하거나, 어느 반을 고치는 중이거나.
type FormState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; target: ClassFee }

/** 반과 수강료표 관리. 관리자 전용이다. */
export function ClassesPage() {
  const campuses = useCampuses()
  const classFees = useClassFees()
  const [campusFilter, setCampusFilter] = useState(ALL)
  const [form, setForm] = useState<FormState>({ mode: 'closed' })

  const loaded = campuses.data !== undefined && classFees.data !== undefined
  const error = campuses.error ?? classFees.error
  const isRefetching = campuses.isFetching || classFees.isFetching

  const campusNames = new Map(campuses.data?.map((campus) => [campus.id, campus.name]))
  const rows = (classFees.data ?? []).filter(
    (row) => campusFilter === ALL || String(row.campusId) === campusFilter,
  )
  const activeCount = rows.filter((row) => row.active).length

  function reload() {
    void campuses.refetch()
    void classFees.refetch()
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">반·수강료표</h1>
          <p className="mt-1 text-sub">반마다 8회 기준 수강료와 교재비를 정해요.</p>
        </div>
        {/* 등록 창은 목록까지 받은 뒤에 그려진다. 그 전에는 눌러도 열 수 없으므로 막아 둔다. */}
        <Button onClick={() => setForm({ mode: 'create' })} disabled={!loaded}>
          반 등록
        </Button>
      </div>

      {!loaded && !error && (
        <p role="status" className="py-24 text-center text-sub">
          수강료표를 불러오고 있어요.
        </p>
      )}

      {error && (
        <div className="mt-6">
          <Notice>
            {loaded
              ? // 전에 받은 목록이 아래에 남아 있다. 방금 저장한 내용이 빠져 있을 수 있다는 것을 알린다.
                '최신 내용을 불러오지 못했어요. 아래 표는 이전 내용일 수 있어요.'
              : error instanceof ApiError
                ? error.message
                : '수강료표를 불러오지 못했어요.'}
          </Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={reload}
            disabled={isRefetching}
          >
            {isRefetching ? '불러오는 중' : '다시 불러오기'}
          </Button>
        </div>
      )}

      {campuses.data && classFees.data && (
        <>
          <div className="mt-7 flex flex-wrap items-end justify-between gap-3">
            <Segmented
              label="지점"
              name="campusFilter"
              value={campusFilter}
              onChange={setCampusFilter}
              options={[
                { value: ALL, label: '전체' },
                ...campuses.data.map((campus) => ({
                  value: String(campus.id),
                  label: campus.name,
                })),
              ]}
              className="w-full max-w-[380px]"
            />
            {rows.length > 0 && (
              <p className="text-[14px] text-sub">
                운영 중인 반 {activeCount}개
                {rows.length > activeCount && `, 꺼진 반 ${rows.length - activeCount}개`}
              </p>
            )}
          </div>

          {rows.length === 0 ? (
            <EmptyState
              // 지점을 골라서 비어 보이는 것과 반이 하나도 없는 것을 구분한다.
              title={campusFilter === ALL ? '등록된 반이 없어요' : '이 지점에는 등록된 반이 없어요'}
              description="반을 등록하면 수강료표에 나타나요."
              className="py-16"
            >
              <Button onClick={() => setForm({ mode: 'create' })}>반 등록</Button>
            </EmptyState>
          ) : (
            <Table caption="반·수강료표" className="mt-4">
              <thead>
                <tr>
                  <Th>반</Th>
                  <Th>지점</Th>
                  <Th numeric>수강료 (8회)</Th>
                  <Th numeric>교재비</Th>
                  <Th>상태</Th>
                  <Th>
                    <span className="sr-only">수정</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  // 꺼진 반은 흐리게 보여 운영 중인 반과 한눈에 구분되게 한다.
                  <tr key={row.id} className={row.active ? undefined : 'text-sub'}>
                    <Td className="font-semibold">{row.name}</Td>
                    <Td className="text-sub">{campusNames.get(row.campusId) ?? '-'}</Td>
                    <Td numeric>{formatWon(row.baseFee8)}</Td>
                    <Td numeric>{formatWon(row.bookFee)}</Td>
                    <Td>
                      <Pill status={row.active ? 'valid' : 'used'}>
                        {row.active ? '운영 중' : '꺼짐'}
                      </Pill>
                    </Td>
                    <Td className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`${row.name} 수정`}
                        onClick={() => setForm({ mode: 'edit', target: row })}
                      >
                        수정
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          <ClassFormModal
            open={form.mode !== 'closed'}
            onClose={() => setForm({ mode: 'closed' })}
            campuses={campuses.data}
            editing={form.mode === 'edit' ? form.target : undefined}
            defaultCampusId={campusFilter === ALL ? undefined : Number(campusFilter)}
            onSaved={(saved) => {
              // 다른 지점을 보고 있으면 방금 저장한 반이 목록에 안 보여 실패한 것처럼 보인다. 그 지점으로 옮긴다.
              if (campusFilter !== ALL) setCampusFilter(String(saved.campusId))
            }}
          />
        </>
      )}
    </>
  )
}
