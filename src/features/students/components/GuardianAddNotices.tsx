import { Button, Notice } from '@/shared/ui'
import type { Guardian, GuardianAddedNotice, UnsureGuardianAdd } from '../api'

// 같은 번호의 학부모가 이미 있으면 서버는 새로 만들지 않고 그 학부모에 연결한다.
// 입력한 이름이 아니라 저장돼 있던 이름을 보여, 번호를 잘못 넣어 남의 학부모에 붙였는지 바로 알아챌 수 있게 한다.
function addedMessage({ typedName, linked }: GuardianAddedNotice): string {
  return linked
    ? `이미 등록된 학부모(${linked.name}, ${linked.phone})에 연결했어요. 입력한 이름은 쓰이지 않았어요. 다른 사람이라면 연결을 끊고 번호를 확인해 주세요.`
    : `${typedName} 학부모를 추가했어요.`
}

type GuardianAddNoticesProps = {
  /** 지금 이 학생에게 연결된 학부모 */
  guardians: readonly Guardian[]
  /** 추가가 끝났다는 안내. 없으면 그리지 않는다 */
  added: GuardianAddedNotice | undefined
  onDismissAdded: () => void
  /** 추가됐는지 알 수 없게 끝난 시도. 추가 창이 열려 있는 동안에는 null을 넘긴다 */
  unsure: UnsureGuardianAdd | null
  /** 그 뒤로 학생을 다시 받았는지 */
  unsureChecked: boolean
  /** 학생을 받는 중인지 */
  fetching: boolean
  onRecheck: () => void
  /** 추가됐는지 모른다는 안내를 닫는다 */
  onDismissUnsure: () => void
  /** 놓친 추가로 붙었다고 알린 학부모 한 명의 안내를 닫는다. 다른 학부모의 안내는 남는다 */
  onAcknowledge: (guardianId: number) => void
}

/**
 * 학부모 추가의 결과 안내. 학생 상세 화면이 쓴다.
 * 확인이 필요한 안내(기존 학부모에 연결했다, 놓친 추가로 학부모가 붙어 있다, 추가됐는지 모른다)는 닫기를 눌러야 사라진다.
 * 다음 일을 시작한다고 지우면, 안내를 보고 연결을 끊으려는 순간 이름과 번호가 사라진다.
 */
export function GuardianAddNotices({
  guardians,
  added,
  onDismissAdded,
  unsure,
  unsureChecked,
  fetching,
  onRecheck,
  onDismissUnsure,
  onAcknowledge,
}: GuardianAddNoticesProps) {
  // 기존 학부모에 연결했다는 안내는 그 학부모가 연결돼 있는 동안만 보인다. 연결을 끊었으면 더 알릴 것이 없다.
  const linkedId = added?.linked?.id
  const showAdded =
    added !== undefined &&
    (linkedId === undefined || guardians.some((guardian) => guardian.id === linkedId))
  // 응답을 받지 못했는데, 시도하기 전에 없던 학부모가 있다. 놓친 추가로 붙은 것으로 본다.
  const appeared = unsure
    ? guardians.filter((guardian) => !unsure.knownIds.includes(guardian.id))
    : []

  return (
    <>
      {added && showAdded && (
        <Notice tone={added.linked ? 'warning' : 'success'} className="mt-6">
          <p>{addedMessage(added)}</p>
          {added.linked && (
            <Button variant="ghost" size="sm" className="mt-3" onClick={onDismissAdded}>
              닫기
            </Button>
          )}
        </Notice>
      )}
      {unsure &&
        appeared.map((guardian) => {
          // 이 화면의 추가로 붙은 것으로 본다(그 사이 다른 직원이 붙였을 수도 있어 "추가했어요"가 아니라 "추가돼 있어요"라고 한다).
          // 이름이 같아도 가린 번호를 보여준다. 번호를 잘못 넣었는데 하필 같은 이름인 경우를 뒷자리로 알아챌 수 있다.
          const who = `${guardian.name}(${guardian.phone})`
          // 저장된 이름이 입력한 이름과 다르면 같은 번호의 다른 학부모에 연결됐을 수 있다. 이것도 단정하지 않는다.
          const sameName = unsure.typedNames.includes(guardian.name)
          return (
            <Notice key={guardian.id} tone={sameName ? 'success' : 'warning'} className="mt-6">
              <p>
                {sameName
                  ? `${who} 학부모가 추가돼 있어요.`
                  : `${who} 학부모가 추가돼 있어요. 입력한 이름(${unsure.typedNames.join(', ')})과 달라요. 이미 등록된 학부모에 연결된 것일 수 있으니, 다른 사람이라면 연결을 끊고 번호를 확인해 주세요.`}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={() => onAcknowledge(guardian.id)}
              >
                닫기
              </Button>
            </Notice>
          )
        })}
      {unsure && appeared.length === 0 && (
        // 추가됐는지 아직 모른다. 침묵하면 추가되지 않은 것으로 알고 넘어간다.
        <Notice tone="warning" className="mt-6">
          <p>
            {unsureChecked
              ? // 다시 받은 학생에 없다. 추가되지 않았거나, 서버가 아직 처리하는 중이다.
                // 한 번 확인한 뒤에는 다시 받는 동안에도 문구를 바꾸지 않는다(탭을 오갈 때마다 다시 받는다).
                `${unsure.typedNames.join(', ')} 학부모는 지금은 보이지 않아요. 추가되지 않았을 수 있어요. 잠시 뒤 다시 확인하거나 다시 추가해 주세요.`
              : fetching
                ? `${unsure.typedNames.join(', ')} 학부모가 추가됐는지 확인하고 있어요.`
                : `${unsure.typedNames.join(', ')} 학부모가 추가됐는지 확인하지 못했어요. 아래 학부모는 이전 내용일 수 있어요.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              // 받는 동안에도 버튼을 그대로 둔다. 없애거나 disabled로 막으면 누른 버튼이 포커스를 잃는다.
              onClick={() => {
                if (!fetching) onRecheck()
              }}
              aria-disabled={fetching || undefined}
              className="aria-disabled:cursor-default aria-disabled:hover:bg-field aria-disabled:active:scale-100"
            >
              {fetching ? '확인하는 중' : '다시 확인'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDismissUnsure}>
              닫기
            </Button>
          </div>
        </Notice>
      )}
    </>
  )
}
