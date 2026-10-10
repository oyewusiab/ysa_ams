import React from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LoginView } from './components/LoginView'
import { AuthenticatedShell } from './components/AuthenticatedShell'
import { RefreshCw } from 'lucide-react'

const AppContent: React.FC = () => {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-emerald-700 text-white rounded-xl flex items-center justify-center mx-auto mb-3 shadow-md">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
          <p className="text-sm font-medium text-slate-700">Connecting to Obantoko Stake AMS...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <LoginView />
  }

  return <AuthenticatedShell />
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
