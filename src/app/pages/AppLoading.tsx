/**
 * 처음 연 화면의 코드를 받는 동안의 자리. 보통 순식간이라 글자를 띄우면 깜빡이기만 한다.
 * 화면에는 바탕만 두고, 화면 낭독기에만 불러오는 중이라고 알린다.
 */
export function AppLoading() {
  return (
    <p role="status" className="sr-only">
      화면을 불러오고 있어요
    </p>
  )
}
