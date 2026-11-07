import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

import { App } from './App'
import './index.css'
import { Landing } from './pages/Landing'
import { Create } from './pages/Create'
import { History } from './pages/History'
import { Analytics } from './pages/Analytics'
import { JobProgress } from './pages/JobProgress'
import { Review } from './pages/Review'
import { Settings } from './pages/Settings'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Landing /> },
      { path: 'create', element: <Create /> },
      { path: 'history', element: <History /> },
      { path: 'analytics', element: <Analytics /> },
      { path: 'jobs/:jobId', element: <JobProgress /> },
      { path: 'jobs/:jobId/clips', element: <Review /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
