import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const fetchUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me')
      setUser(data.data.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  useEffect(() => {
    function handleForceLogout() {
      setUser(null)
    }
    window.addEventListener('auth:logout', handleForceLogout)
    return () => window.removeEventListener('auth:logout', handleForceLogout)
  }, [])

  const signup = async ({ name, email, password }) => {
    const { data } = await api.post('/auth/signup', { name, email, password })
    return data
  }

  const login = async ({ email, password }) => {
    const { data } = await api.post('/auth/login', { email, password })
    setUser(data.data.user)
    return data
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setUser(null)
      navigate('/login')
    }
  }

  const verifyEmail = async (payload) => {
    const { data } = await api.post('/auth/verify-email', payload)
    if (data?.data?.user) {
      setUser(data.data.user)
    }
    return data
  }

  const resendOTP = async (payloadOrEmail) => {
    const payload =
      typeof payloadOrEmail === 'string'
        ? { email: payloadOrEmail }
        : payloadOrEmail
    const { data } = await api.post('/auth/resend-otp', payload)
    return data
  }

  const forgotPassword = async (email) => {
    const { data } = await api.post('/auth/forgot-password', { email })
    return data
  }

  const resetPassword = async ({ token, password }) => {
    const { data } = await api.post('/auth/reset-password', { token, password })
    return data
  }

  const value = {
    user,
    loading,
    signup,
    login,
    logout,
    verifyEmail,
    resendOTP,
    forgotPassword,
    resetPassword,
    refreshUser: fetchUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
