import { expect, test } from 'vitest'
import { toVerifyRequest } from './deskInput'

const QR = 'eyJ2IjoxLCJwIjo0Mn0.aGVsbG8td29ybGQtc2lnbmF0dXJlLXRoYXQtaXMtbG9uZw-abcDEF_123'

test.each([
  ['DT-ABC234', 'DT-ABC234'],
  ['dt-abc234', 'DT-ABC234'],
  ['  dt-abc234  ', 'DT-ABC234'],
  ['DT - ABC 234', 'DT-ABC234'],
  // 형식이 틀려도 그대로 보낸다. 서버가 칸 오류로 알려 준다.
  ['abc234', 'ABC234'],
])('사람이 친 짧은 값(%s)은 공백을 떼고 대문자로 바꾼 패스 번호다', (input, passNo) => {
  expect(toVerifyRequest(input)).toEqual({ passNo })
})

test('스캐너가 넣은 긴 값은 QR 글자다. 대소문자를 바꾸지 않고 앞뒤 공백만 뗀다', () => {
  expect(toVerifyRequest(QR)).toEqual({ qrToken: QR })
  expect(toVerifyRequest(`  ${QR}\n`)).toEqual({ qrToken: QR })
})

test('20자까지는 패스 번호, 21자부터는 QR 글자로 본다', () => {
  expect(toVerifyRequest('a'.repeat(20))).toEqual({ passNo: 'A'.repeat(20) })
  expect(toVerifyRequest('a'.repeat(21))).toEqual({ qrToken: 'a'.repeat(21) })
})

test.each(['', '   ', '\n'])('비어 있으면(%j) 보내지 않는다', (input) => {
  expect(toVerifyRequest(input)).toBeNull()
})
