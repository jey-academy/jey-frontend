import { useState } from 'react'
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

  const isPending = campuses.isPending || classFees.isPending
  const error = campuses.error ?? classFees.error

  const campusNames = new Map(campuses.data?.map((campus) => [campus.id, campus.name]))
  const rows = (classFees.data ?? []).filter(
    (row) => campusFilter === ALL || String(row.campusId) === campusFilter,
  )
  const activeCount = rows.filter((row) => row.active).length

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">반·수강료표</h1>
          <p className="mt-1 text-sub">반마다 8회 기준 수강료와 교재비를 정해요.</p>
        </div>
        <Button onClick={() => setForm({ mode: 'create' })} disabled={!campuses.data}>
          반 등록
        </Button>
      </div>

      {isPending && (
        <p role="status" className="py-24 text-center text-sub">
          수강료표를 불러오고 있어요.
        </p>
      )}

      {!isPending && error && (
        <div className="mt-6">
          <Notice>{error.message}</Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => {
              void campuses.refetch()
              void classFees.refetch()
            }}
          >
            다시 불러오기
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
              title="등록된 반이 없어요"
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
          />
        </>
      )}
    </>
  )
}
