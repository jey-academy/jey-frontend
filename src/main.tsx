import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { Providers } from './app/providers'
import { router } from './app/router'
import './index.css'

// 화면을 그리다 난 에러는 에러 화면(RouteErrorPage)이 안내한다.
// 에러 내용에 개인정보가 섞일 수 있어, 배포 환경에서는 React와 React Router가 콘솔에 남기지 않게 한다.
// 개발 서버에서는 원인을 볼 수 있게 남긴다.
const logInDevOnly = (error: unknown) => {
  if (import.meta.env.DEV) console.error(error)
}

createRoot(document.getElementById('root')!, {
  // 개발 서버에서는 React 기본 동작(컴포넌트 위치까지 출력)을 그대로 쓴다.
  onCaughtError: import.meta.env.DEV ? undefined : () => {},
}).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} onError={logInDevOnly} />
    </Providers>
  </StrictMode>,
)
