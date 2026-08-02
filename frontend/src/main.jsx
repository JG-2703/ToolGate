import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider, useAuth } from './auth/AuthContext'
import LoginPage from './auth/LoginPage'
import Shell from './Shell'
import './index.css'

function Gate() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg-base)',
        color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12, letterSpacing: '0.1em',
      }}>
        LOADING…
      </div>
    )
  }
  return user ? <Shell /> : <LoginPage />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <Gate />
    </AuthProvider>
  </React.StrictMode>
)
