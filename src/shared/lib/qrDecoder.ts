/** 카메라 화면 한 장에서 QR을 찾는다. 없으면 null. */
export type QrDetector = {
  detect: (source: HTMLVideoElement) => Promise<string | null>
}

type DetectedBarcode = { rawValue: string }
type BarcodeDetectorLike = { detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]> }
type BarcodeDetectorClass = {
  new (options: { formats: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<readonly string[]>
}

function fromDetector(detector: BarcodeDetectorLike): QrDetector {
  return {
    detect: async (source) => (await detector.detect(source))[0]?.rawValue ?? null,
  }
}

/**
 * QR 판독기를 만든다. 스캔 창을 열 때 부른다.
 * - 브라우저에 내장된 `BarcodeDetector`가 QR을 읽을 수 있으면 그것을 쓴다(안드로이드 Chrome 등). 더 받을 것이 없다.
 * - 없으면(아이폰 Safari, Windows의 Chrome 등) `barcode-detector`의 WASM 판독기를 그때 받는다(gzip 약 450kB).
 *   WASM 파일은 외부 CDN이 아니라 우리 사이트에서 준다(Vite가 빌드 결과에 넣는다).
 */
export async function createQrDetector(): Promise<QrDetector> {
  const native = (globalThis as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector
  if (native) {
    const formats = (await native.getSupportedFormats?.()) ?? []
    if (formats.includes('qr_code')) return fromDetector(new native({ formats: ['qr_code'] }))
  }

  const [{ BarcodeDetector, prepareZXingModule, purgeZXingModule }, { default: wasmUrl }] =
    await Promise.all([
      import('barcode-detector/ponyfill'),
      // barcode-detector가 쓰는 zxing-wasm의 판독기 파일. 기본값은 jsDelivr CDN에서 받는다.
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ])
  wasmOverrides ??= {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? wasmUrl : prefix + path,
  }
  // WASM을 지금 받아 둔다. 라이브러리는 받지 못해도 판독기를 만들어 주고, 실패는 화면 한 장을 읽을 때에야
  // 드러난다. 그러면 스캔 창이 "한 장 실패"로 보고 계속 읽으려 해서, 안내 없이 카메라만 켜져 있게 된다.
  try {
    await prepareZXingModule({ overrides: wasmOverrides, fireImmediately: true })
  } catch (error) {
    // 실패한 결과를 라이브러리가 기억한다. 지워 두어야 다음에 창을 열 때 다시 받는다.
    purgeZXingModule()
    throw error
  }
  return fromDetector(new BarcodeDetector({ formats: ['qr_code'] }))
}

// 같은 설정을 넘겨야 라이브러리가 이미 받은 WASM을 다시 쓴다(두 번째 학생부터는 바로 열린다).
let wasmOverrides: { locateFile: (path: string, prefix: string) => string } | undefined
