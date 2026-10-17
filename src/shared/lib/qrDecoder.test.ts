import { afterEach, expect, test, vi } from 'vitest'
import { createQrDetector } from './qrDecoder'

const ponyfill = vi.hoisted(() => ({
  detect: vi.fn(async () => [{ rawValue: 'WASM-QR' }]),
  constructed: vi.fn(),
  prepareZXingModule: vi.fn(),
}))

vi.mock('barcode-detector/ponyfill', () => ({
  BarcodeDetector: class {
    constructor(options: unknown) {
      ponyfill.constructed(options)
    }
    detect = ponyfill.detect
  },
  prepareZXingModule: ponyfill.prepareZXingModule,
}))

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'BarcodeDetector')
  vi.clearAllMocks()
})

const video = document.createElement('video')

function installNative(formats: string[], found: { rawValue: string }[]) {
  const constructed = vi.fn()
  Object.defineProperty(globalThis, 'BarcodeDetector', {
    configurable: true,
    value: class {
      static getSupportedFormats = async () => formats
      constructor(options: unknown) {
        constructed(options)
      }
      detect = async () => found
    },
  })
  return constructed
}

test('브라우저에 QR을 읽는 내장 판독기가 있으면 그것을 쓰고 WASM은 받지 않는다', async () => {
  const constructed = installNative(['ean_13', 'qr_code'], [{ rawValue: 'NATIVE-QR' }])

  const detector = await createQrDetector()

  expect(await detector.detect(video)).toBe('NATIVE-QR')
  expect(constructed).toHaveBeenCalledWith({ formats: ['qr_code'] })
  expect(ponyfill.constructed).not.toHaveBeenCalled()
  expect(ponyfill.prepareZXingModule).not.toHaveBeenCalled()
})

test.each([
  ['내장 판독기가 없으면', () => {}],
  ['내장 판독기가 QR을 못 읽으면', () => installNative(['ean_13'], [])],
])(
  '%s WASM 판독기를 쓰고, WASM 파일은 CDN이 아니라 우리 사이트에서 받는다',
  async (_name, install) => {
    install()

    const detector = await createQrDetector()

    expect(await detector.detect(video)).toBe('WASM-QR')
    expect(ponyfill.constructed).toHaveBeenCalledWith({ formats: ['qr_code'] })
    const [[options]] = ponyfill.prepareZXingModule.mock.calls as unknown as [
      [{ overrides: { locateFile: (path: string, prefix: string) => string } }],
    ]
    const wasm = options.overrides.locateFile('zxing_reader.wasm', 'https://cdn.jsdelivr.net/x/')
    expect(wasm).not.toContain('jsdelivr')
    expect(wasm).toMatch(/zxing_reader\.wasm/)
  },
)

test('찾은 QR이 없으면 null이다', async () => {
  installNative(['qr_code'], [])

  expect(await (await createQrDetector()).detect(video)).toBeNull()
})
