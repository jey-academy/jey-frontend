import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, supportRequestId } from '@/shared/api'
import { daysBetween, formatDate, formatPercent } from '@/shared/lib'
import {
  Button,
  ButtonLink,
  DescriptionList,
  EmptyState,
  Notice,
  PassCard,
  QrView,
  Sheet,
  Steps,
  TimeLeft,
} from '@/shared/ui'
import {
  holderPassQueryKey,
  QR_VALID_MS,
  useHolderPass,
  useHolderQr,
  type HolderPass,
  type HolderQr,
} from '../api'
import { HolderLinkCopy } from '../components/HolderLinkCopy'
import { toPassStatus } from '../passState'
import type { RelinkedState } from './HolderRelinkPage'

/**
 * 학부모 패스(`/p/:token`). 로그인 없이 링크로 연다.
 * 쓸 수 있는 패스면 QR(패스의 방향에 따라 JEY 데스크나 연계 학원에 보여 준다)과 사용 안내를, 아니면 도장 찍힌 카드만 보여 준다.
 * 발급 정보와 개인정보 안내는 늘 보인다.
 */
export function HolderPassPage() {
  const { token = '' } = useParams()
  const pass = useHolderPass(token)
  // 링크 다시 받기 화면에서 막 넘어왔는지. 새 링크를 저장하고 가족과 나눠 쓰라고 알린다.
  const relinked = (useLocation().state as RelinkedState | null)?.relinked === true

  // 링크가 바뀌었으면(다시 받기·새로 만들기) 보던 패스가 있어도 열 수 없다고 알린다.
  if (isClosedLink(pass.error)) {
    return (
      <EmptyState
        headingLevel={1}
        title="링크가 맞지 않거나 새로 바뀌었어요"
        description="링크를 같이 쓰는 가족이 링크를 다시 받았다면 예전 링크는 열리지 않아요. 새 링크를 받아 함께 나눠 써 주세요."
      >
        <ButtonLink to="/find" variant="ghost" block>
          링크 다시 받기
        </ButtonLink>
      </EmptyState>
    )
  }
  if (pass.data) return <HolderPassView token={token} pass={pass.data} relinked={relinked} />
  if (pass.error) {
    return (
      <div className="py-16">
        <h1 className="sr-only">동탄고 패스</h1>
        <Notice requestId={supportRequestId(pass.error)}>
          패스를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 불러와 주세요.
        </Notice>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={() => void pass.refetch()}
          disabled={pass.isFetching}
        >
          다시 불러오기
        </Button>
      </div>
    )
  }
  return (
    <>
      <h1 className="sr-only">동탄고 패스</h1>
      <p role="status" className="py-24 text-center text-sub">
        패스를 불러오고 있어요
      </p>
    </>
  )
}

// 없는 링크·막힌 옛 링크(404). 토큰 모양이 틀려도(400) 학부모에게는 같은 일이다.
function isClosedLink(error: unknown) {
  return error instanceof ApiError && (error.status === 404 || error.status === 400)
}

function HolderPassView({
  token,
  pass,
  relinked,
}: {
  token: string
  pass: HolderPass
  relinked: boolean
}) {
  const status = toPassStatus(pass.state)
  const texts = directionTexts(pass)
  if (status === null || texts === null) {
    // 서버에 새 상태나 방향이 생겼는데 화면을 아직 고치지 않았다. 어디서 쓰는지 모르니 QR을 보여 주지 않는다.
    return (
      <div className="py-16">
        <h1 className="sr-only">동탄고 패스</h1>
        <Notice>지금은 패스를 보여 줄 수 없어요. 패스를 발급한 학원에 문의해 주세요.</Notice>
      </div>
    )
  }
  const usable = status === 'valid'

  return (
    <>
      <h1 className="sr-only">동탄고 패스</h1>
      {relinked && (
        // 링크는 문자로 가지 않고 이 화면에만 있다. 주소를 저장하고 가족과 나눠 쓸 수 있게 링크 칸을 둔다.
        <div className="mb-4">
          <Notice tone="success">
            새 링크를 받았어요. 예전 링크는 이제 열리지 않아요. 이 화면 주소를 저장하고, 링크를 같이
            쓰는 가족에게도 보내 주세요.
          </Notice>
          <div className="mt-2.5">
            <HolderLinkCopy key={token} linkToken={token} />
          </div>
        </div>
      )}
      <PassCard
        status={status}
        benefitLabel={`${texts.usedAt} 첫 달 수강료`}
        discount={formatPercent(pass.discountRate)}
        holderName={pass.studentName}
        passNumber={pass.passNo}
        expiresOn={formatDate(pass.expiresOn)}
      />
      {usable && <HolderQrSheet token={token} passNumber={pass.passNo} place={texts.qrPlace} />}
      {usable && (
        // 남은 일수는 서버가 센 값 그대로 쓴다. 휴대폰 시계가 틀려도 서버의 만료 판정과 같다.
        // 전체 길이도 서버가 준 두 날짜로만 센다(사용 기한 당일까지 포함해 + 1).
        <TimeLeft
          className="mt-3.5"
          daysLeft={pass.daysLeft}
          totalDays={daysBetween(pass.issuedOn, pass.expiresOn) + 1}
        />
      )}
      {usable && (
        <Sheet title="이렇게 사용해요">
          <Steps
            items={[
              {
                title: `${texts.usedAt} 데스크에 방문해요`,
                description: '신규 등록할 때 한 번 쓸 수 있어요',
              },
              { title: '위 QR을 보여 주세요', description: 'QR이 안 되면 패스 번호를 알려 주세요' },
              ...texts.extraSteps,
            ]}
          />
        </Sheet>
      )}
      <Sheet title="발급 정보">
        <DescriptionList
          items={[
            { label: '발급 학원', value: texts.issuer },
            { label: '발급일', value: formatDate(pass.issuedOn) },
            // 사용일은 사용 완료 패스에만 온다(그 밖은 null). 취소일은 응답에 없다.
            ...(status === 'used' && pass.redeemedOn
              ? [{ label: '사용일', value: formatDate(pass.redeemedOn) }]
              : []),
            { label: '할인 받는 곳', value: texts.usedAt },
          ]}
        />
      </Sheet>
      <Sheet title="개인정보 안내">
        {/* 서버 문구의 줄바꿈을 살린다. */}
        <Notice tone="info" collapsible className="whitespace-pre-line">
          {pass.noticeText}
        </Notice>
        <p className="mt-2.5 text-[13px] text-sub">안내문 버전 {pass.noticeVersion}</p>
      </Sheet>
    </>
  )
}

type DirectionTexts = {
  /** 발급 정보의 "발급 학원" */
  issuer: string
  /** 할인을 받는 곳. 카드의 혜택, 사용 안내, 발급 정보에 쓴다 */
  usedAt: string
  /** QR을 보여 줄 곳 */
  qrPlace: string
  /** 사용 안내의 QR 다음 단계 */
  extraSteps: { title: string; description: string }[]
}

/**
 * 패스의 방향(ADR-0040)에 맞는 문구. 모르는 방향이면 null.
 * campusName은 연계 학원 발급이면 받는 지점, JEY 발급이면 발급한 지점이다.
 */
function directionTexts(pass: HolderPass): DirectionTexts | null {
  const campus = `JEY 어학원 ${pass.campusName}`
  switch (pass.direction) {
    case 'PARTNER_ISSUED':
      return {
        issuer: pass.partnerName ?? '연계 학원',
        usedAt: campus,
        qrPlace: '데스크',
        extraSteps: [
          {
            title: '학생 이름과 학부모 번호를 확인해요',
            description: '패스를 받을 때 알려 준 번호로 등록해 주세요',
          },
        ],
      }
    // 아무 연계 학원에서나 쓴다(발급 때 정하지 않는다). 연계 학원도 등록 서류의 이름과 번호로 본인을 확인한다(ADR-0041).
    // 패스의 번호는 JEY 어학원에 등록된 대표 연락처다.
    case 'CAMPUS_ISSUED':
      return {
        issuer: campus,
        usedAt: '연계 학원',
        qrPlace: '연계 학원',
        extraSteps: [
          {
            title: '학생 이름과 학부모 번호를 확인해요',
            description: 'JEY 어학원에 등록한 학부모 번호로 등록해 주세요',
          },
        ],
      }
    default:
      return null
  }
}

/**
 * 보여 줄 곳(place)에 내미는 QR. 받은 지 59초가 지나도 새 QR이 없을 때만 흐리게 하고 "다시 불러오기"를 둔다.
 * 그 전에 미리 새로 받는 동안에는 지금 QR을 그대로 둔다.
 */
function HolderQrSheet({
  token,
  passNumber,
  place,
}: {
  token: string
  passNumber: string
  place: string
}) {
  const queryClient = useQueryClient()
  const qr = useHolderQr(token, { enabled: true })
  const expired = useExpired(qr.data)
  const { error } = qr

  // 보는 사이에 패스가 쓸 수 없게 됐다(데스크가 사용 처리, 기간이 지남, 발급 취소는 409, 링크가 바뀌면 404).
  // 패스를 다시 받아 바뀐 상태를 보여 준다. 쓸 수 없게 되면 이 QR 영역은 사라진다.
  useEffect(() => {
    if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
      void queryClient.invalidateQueries({ queryKey: holderPassQueryKey(token) })
    }
  }, [error, queryClient, token])

  if (qr.data && !expired)
    return <QrView state="shown" value={qr.data.qrToken} passNumber={passNumber} place={place} />
  // 처음 받는 중이거나, 만료된 뒤 새로 받는 중이다.
  if (qr.isFetching || (!qr.data && !qr.isError)) {
    return <QrView state="loading" passNumber={passNumber} place={place} />
  }
  return (
    <QrView
      state="failed"
      value={qr.data?.qrToken}
      passNumber={passNumber}
      place={place}
      onRetry={() => void qr.refetch()}
    />
  )
}

/** 받은 QR이 쓸 수 있는 시간(QR_VALID_MS)을 넘겼는지. 넘기는 순간 다시 그린다. */
function useExpired(qr: HolderQr | undefined) {
  const [expiredAt, setExpiredAt] = useState<number | null>(null)
  const receivedAt = qr?.receivedAt

  useEffect(() => {
    if (receivedAt === undefined) return
    const left = Math.max(0, receivedAt + QR_VALID_MS - Date.now())
    const timer = window.setTimeout(() => setExpiredAt(receivedAt), left)
    return () => window.clearTimeout(timer)
  }, [receivedAt])

  return receivedAt !== undefined && expiredAt === receivedAt
}
