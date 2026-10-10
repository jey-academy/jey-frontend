import type { ReactNode } from 'react'
import { Button, Card, Pill } from '@/shared/ui'
import './prototype-reference.css'

// 왼쪽: shared/ui 컴포넌트 / 오른쪽: 프로토타입 원본 CSS. 같은 줄끼리 똑같아 보여야 한다.
export function UiPreviewPage() {
  return (
    <main className="mx-auto max-w-[1080px] px-6 pt-7 pb-16">
      <h1 className="text-[26px] font-bold tracking-[-0.03em]">UI 미리보기</h1>
      <p className="mb-5 text-sub">왼쪽은 shared/ui, 오른쪽은 프로토타입 원본이에요.</p>

      <div className="mb-2 grid grid-cols-2 gap-6 text-[14px] font-semibold text-sub">
        <span>shared/ui</span>
        <span>프로토타입</span>
      </div>

      <Row title="Button 기본">
        <Button>확인하기</Button>
        <button className="btn">확인하기</button>
      </Row>
      <Row title="Button 비활성">
        <Button disabled>확인 중</Button>
        <button className="btn" disabled>
          확인 중
        </button>
      </Row>
      <Row title="Button ghost">
        <Button variant="ghost">링크 복사</Button>
        <button className="btn ghost">링크 복사</button>
      </Row>
      <Row title="Button sm · ghost sm (터치 영역은 44px)">
        <div className="flex gap-2">
          <Button size="sm">QR 보기</Button>
          <Button size="sm" variant="ghost">
            링크 복사
          </Button>
        </div>
        <div className="flex gap-2">
          <button className="btn sm">QR 보기</button>
          <button className="btn sm ghost">링크 복사</button>
        </div>
      </Row>
      <Row title="Button block · ghost block">
        <div className="grid gap-2">
          <Button block>패스 발급하기</Button>
          <Button block variant="ghost">
            닫기
          </Button>
        </div>
        <div className="grid gap-2">
          <button className="btn block">패스 발급하기</button>
          <button className="btn ghost block">닫기</button>
        </div>
      </Row>

      <Row title="Pill">
        <div className="flex gap-2">
          <Pill status="valid" />
          <Pill status="used" />
          <Pill status="expired" />
        </div>
        <div className="flex gap-2">
          <span className="pill valid">사용 가능</span>
          <span className="pill used">사용 완료</span>
          <span className="pill expired">기간 만료</span>
        </div>
      </Row>

      <Row title="Card">
        <Card>
          <h2 className="mb-1 text-[19px] font-bold tracking-[-0.03em]">발급 정보</h2>
          <p className="mb-[18px] text-[14px] text-sub">
            발급 후 나오는 링크를 학부모님께 카카오톡이나 문자로 보내 주세요.
          </p>
          <Button block>패스 발급하기</Button>
        </Card>
        <section className="card">
          <h2>발급 정보</h2>
          <p className="sub">발급 후 나오는 링크를 학부모님께 카카오톡이나 문자로 보내 주세요.</p>
          <button className="btn block">패스 발급하기</button>
        </section>
      </Row>
    </main>
  )
}

function Row({ title, children }: { title: string; children: [ReactNode, ReactNode] }) {
  const [ours, proto] = children
  return (
    <section className="border-t border-line py-5">
      <h2 className="mb-3 text-[15px] font-semibold text-sub">{title}</h2>
      <div className="grid grid-cols-2 items-start gap-6">
        <div>{ours}</div>
        <div className="proto">{proto}</div>
      </div>
    </section>
  )
}
