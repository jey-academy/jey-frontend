import { afterEach, beforeEach, vi, type Mock } from 'vitest'

/** 가짜 카메라 영상. 꺼졌는지(track.stop) 확인할 수 있다. */
export function fakeStream() {
  const track = { stop: vi.fn() }
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track }
}

/**
 * 카메라를 쓰는 화면을 테스트할 때 파일 맨 위에서 한 번 부른다.
 * jsdom에는 카메라(`navigator.mediaDevices`)와 영상 재생이 없어서 흉내 낸다. 영상은 늘 준비된 것으로 본다.
 * 테스트마다 `getUserMedia`가 무엇을 돌려줄지 정한다(기본은 응답 없음).
 * 실제 카메라가 켜지는지, QR이 읽히는지는 실기기에서 확인한다.
 */
export function setupCamera() {
  const camera: {
    getUserMedia: Mock<(constraints: MediaStreamConstraints) => Promise<MediaStream>>
  } = { getUserMedia: vi.fn(() => new Promise<MediaStream>(() => {})) }

  beforeEach(() => {
    camera.getUserMedia.mockReset()
    camera.getUserMedia.mockImplementation(() => new Promise<MediaStream>(() => {}))
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: camera.getUserMedia },
    })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4)
  })

  afterEach(() => {
    // 카메라가 없는 기본 jsdom으로 되돌린다(다른 테스트는 카메라가 없다고 본다).
    Reflect.deleteProperty(navigator, 'mediaDevices')
    vi.restoreAllMocks()
  })

  return camera
}
