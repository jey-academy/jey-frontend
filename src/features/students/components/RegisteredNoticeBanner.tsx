import { Button, Notice } from '@/shared/ui'
import { useRegisteredNotice } from '../api'
import { relationLabel } from '../labels'

type RegisteredNoticeBannerProps = {
  /** 주면 그 학생의 안내만 보여준다(상세 화면). 주지 않으면 어느 학생의 안내든 보여준다(목록 화면). */
  studentId?: number
  className?: string
}

/** 방금 등록한 학생에 대한 안내. 저절로 사라지지 않고, 닫거나 화면을 떠날 때까지 보인다. */
export function RegisteredNoticeBanner({ studentId, className }: RegisteredNoticeBannerProps) {
  const [registered, dismiss] = useRegisteredNotice(studentId)
  if (!registered) return null
  const hasLinked = registered.linkedGuardians.length > 0
  // 닫기는 하나만, 맨 아래 안내에 둔다. 두 안내를 함께 닫는다.
  const close = (
    <Button variant="ghost" size="sm" className="mt-3" onClick={dismiss}>
      닫기
    </Button>
  )

  return (
    <div className={className}>
      <Notice tone="success">
        <p>{`${registered.name} 학생을 등록했어요.`}</p>
        {!hasLinked && close}
      </Notice>
      {/* 같은 번호의 학부모가 이미 있으면 서버는 새로 만들지 않고 그 학부모에 연결한다.
          입력한 이름이 아니라 저장돼 있던 이름을 보여, 번호를 잘못 넣어 남의 학부모에 붙였는지 등록 직후에 알아챌 수 있게 한다.
          끝난 일이 아니라 확인할 일이라, 등록했다는 안내와 색을 달리해 따로 보여준다. */}
      {hasLinked && (
        <Notice tone="warning" className="mt-3">
          {registered.linkedGuardians.map((guardian) => (
            // 가린 번호는 뒷자리가 같은 두 학부모에서 겹친다. id로 구분한다.
            <p key={guardian.id} className="mt-1 first:mt-0">
              {`${relationLabel(guardian.relation)}는 이미 등록된 학부모(${guardian.name}, ${guardian.phone})에 연결했어요. 다른 사람이라면 번호를 확인해 주세요.`}
            </p>
          ))}
          {close}
        </Notice>
      )}
    </div>
  )
}
