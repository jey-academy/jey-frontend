import { useState } from 'react'
import { ApiError, supportRequestId } from '@/shared/api'
import { formatPercent } from '@/shared/lib'
import { Button, EmptyState, Notice, Pill, Table, Td, Th } from '@/shared/ui'
import { useDiscountTypes, type DiscountType } from '../api'
import { DiscountTypeFormModal } from '../components/DiscountTypeFormModal'

// 닫혀 있거나, 새로 등록하거나, 어느 할인 유형을 고치는 중이거나.
type FormState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; target: DiscountType }

/** 할인 유형 관리. 관리자 전용이다. 여기서 정한 할인을 수납할 때 직원이 골라 적용한다. */
export function DiscountTypesPage() {
  const discountTypes = useDiscountTypes()
  const [form, setForm] = useState<FormState>({ mode: 'closed' })

  const rows = discountTypes.data
  const error = discountTypes.error
  const activeCount = rows?.filter((row) => row.active).length ?? 0

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-night">할인 유형</h1>
          <p className="mt-1 text-sub">수납할 때 고를 수 있는 할인과 할인율을 정해요.</p>
        </div>
        {/* 등록 창은 목록을 받은 뒤에 그려진다. 그 전에는 눌러도 열 수 없으므로 막아 둔다. */}
        <Button onClick={() => setForm({ mode: 'create' })} disabled={!rows}>
          할인 유형 등록
        </Button>
      </div>

      {!rows && !error && (
        <p role="status" className="py-24 text-center text-sub">
          할인 유형을 불러오고 있어요.
        </p>
      )}

      {error && (
        <div className="mt-6">
          <Notice requestId={supportRequestId(error)}>
            {rows
              ? // 전에 받은 목록이 아래에 남아 있다. 방금 저장한 내용이 빠져 있을 수 있다는 것을 알린다.
                '최신 내용을 불러오지 못했어요. 아래 표는 이전 내용일 수 있어요.'
              : error instanceof ApiError
                ? error.message
                : '할인 유형을 불러오지 못했어요.'}
          </Notice>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => void discountTypes.refetch()}
            disabled={discountTypes.isFetching}
          >
            {discountTypes.isFetching ? '불러오는 중' : '다시 불러오기'}
          </Button>
        </div>
      )}

      {rows && (
        <>
          {rows.length === 0 ? (
            <EmptyState
              title="등록된 할인 유형이 없어요"
              description="할인 유형을 등록하면 수납할 때 고를 수 있어요."
              className="py-16"
            >
              <Button onClick={() => setForm({ mode: 'create' })}>할인 유형 등록</Button>
            </EmptyState>
          ) : (
            <>
              <p className="mt-7 text-right text-[14px] text-sub">
                사용 중인 할인 {activeCount}개
                {rows.length > activeCount && `, 꺼진 할인 ${rows.length - activeCount}개`}
              </p>
              {/* 저장한 뒤 새 목록이 늦으면 창이 먼저 닫힌다. 그동안 표가 옛 내용임을 흐리게 해서 알린다. */}
              <Table caption="할인 유형" refreshing={discountTypes.isFetching} className="mt-4">
                <thead>
                  <tr>
                    <Th>이름</Th>
                    <Th>코드</Th>
                    <Th numeric>할인율</Th>
                    <Th>상태</Th>
                    <Th>
                      <span className="sr-only">수정</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    // 꺼진 할인은 흐리게 보여 사용 중인 것과 한눈에 구분되게 한다.
                    <tr key={row.id} className={row.active ? undefined : 'text-sub'}>
                      <Td className="font-semibold">{row.name}</Td>
                      <Td className="text-[14px] text-sub">{row.code}</Td>
                      <Td numeric>{formatPercent(row.rate)}</Td>
                      <Td>
                        <Pill status={row.active ? 'valid' : 'used'}>
                          {row.active ? '사용 중' : '꺼짐'}
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
            </>
          )}

          <DiscountTypeFormModal
            open={form.mode !== 'closed'}
            onClose={() => setForm({ mode: 'closed' })}
            editing={form.mode === 'edit' ? form.target : undefined}
          />
        </>
      )}
    </>
  )
}
