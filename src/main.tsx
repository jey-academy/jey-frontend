import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { createErrorLogging } from './app/errorLogging'
import { Providers } from './app/providers'
import { router } from './app/router'
import './index.css'

// 화면을 그리다 난 에러는 에러 화면(RouteErrorPage)이 안내하고, 콘솔에는 errorLogging이 정한 만큼만 남긴다.
const { onCaughtError, onRouterError } = createErrorLogging(import.meta.env.DEV)

createRoot(document.getElementById('root')!, { onCaughtError }).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} onError={onRouterError} />
    </Providers>
  </StrictMode>,
)
