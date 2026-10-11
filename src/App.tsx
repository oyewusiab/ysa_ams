import React, { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AuthenticatedShell } from './components/AuthenticatedShell'
import { PublicAttendanceFormView } from './components/PublicAttendanceFormView'
import { LeaderAdminLoginView } from './components/LeaderAdminLoginView'
import { RefreshCw } from 'lucide-react'

const AppRouter: React.FC = () => {
  const { session, loading } = useAuth()
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigateTo = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path)
    }
    setCurrentPath(path)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
          <p className="text-sm font-semibold text-slate-300">Connecting to Obantoko Stake AMS...</p>
        </div>
      </div>
    )
  }

  // Check if visitor is accessing the leadership/administrative route
  const isLeaderAdminRoute = currentPath === '/la' || currentPath.startsWith('/la/')

  if (isLeaderAdminRoute) {
    // If not authenticated, show dedicated leader/admin login screen
    if (!session) {
      return (
        <LeaderAdminLoginView
          onSuccess={() => {
            const target = currentPath === '/la' || currentPath === '/la/' ? '/la/dashboard' : currentPath
            navigateTo(target)
          }}
        />
      )
    }

    // Bare /la or /la/ redirects directly to /la/dashboard
    if (currentPath === '/la' || currentPath === '/la/') {
      navigateTo('/la/dashboard')
      return <AuthenticatedShell currentSubpath="dashboard" onNavigate={navigateTo} />
    }

    // Redirect legacy administrative /la/terminal to /la/dashboard (terminal is accessed via public code-based flow)
    if (currentPath === '/la/terminal' || currentPath === '/la/terminal/') {
      navigateTo('/la/dashboard')
      return <AuthenticatedShell currentSubpath="dashboard" onNavigate={navigateTo} />
    }

    // Extract subpath after /la/
    const subpath = currentPath.substring(4)
    return <AuthenticatedShell currentSubpath={subpath} onNavigate={navigateTo} />
  }

  // Check for direct session code link (e.g. /5BV21F or ?code=5BV21F)
  const codeRegex = /^\/([2-9A-HJ-NP-Za-z0-9]{6})\/?$/
  const codeMatch = currentPath.match(codeRegex)
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const queryCode = urlParams?.get('code')
  const initialCode = codeMatch ? codeMatch[1].toUpperCase() : (queryCode ? queryCode.toUpperCase() : undefined)

  // Root '/' or direct session code path renders public attendance terminal
  return <PublicAttendanceFormView initialCode={initialCode} />
}

export function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}

export default App
