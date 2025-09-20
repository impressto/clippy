import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import SocketConnectionTest from './SocketConnectionTest.jsx'
import ErrorPage from './components/ErrorPage.jsx'
import { ThemeProvider } from './theme/ThemeContext.jsx'

// Create router with all routes
const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <ErrorPage title="Page Not Found" message="Sorry, the page you're looking for doesn't exist." />,
  },
  {
    path: '/share/:id',
    element: <App />,
    errorElement: <ErrorPage title="Session Error" message="There was a problem loading the shared session." />
  },
  {
    path: '/share/:id/seed/:seedData',
    element: <App />,
    errorElement: <ErrorPage title="Session Error" message="There was a problem loading the shared session with seed data." />
  },
  {
    path: '/socket-test',
    element: <SocketConnectionTest />
  },
  {
    path: '/socket-test/:sessionId',
    element: <SocketConnectionTest />
  }
]);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
)
