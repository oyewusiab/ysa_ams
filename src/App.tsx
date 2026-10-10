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
            // Once logged in, route will render AuthenticatedShell
            setCurrentPath('/la')
          }}
        />
      )
    }
    // Authenticated leader/admin: display the authorized management console
    return <AuthenticatedShell />
  }

  // If user is already authenticated and visits root '/', they can access the shell or public form
  // But by default root '/' is the public YSA attendance interface
  return <PublicAttendanceFormView />
}

export function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}

export default App
