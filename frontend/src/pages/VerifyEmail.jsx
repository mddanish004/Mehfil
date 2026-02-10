import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Mail } from 'lucide-react'

export default function VerifyEmail() {
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const inputRefs = useRef([])
  const { verifyEmail, resendOTP } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const email = location.state?.email

  useEffect(() => {
    if (!email) {
      navigate('/signup')
    }
  }, [email, navigate])

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  function handleChange(index, value) {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('')
      const newOtp = [...otp]
      digits.forEach((d, i) => {
        if (index + i < 6) newOtp[index + i] = d
      })
      setOtp(newOtp)
      const nextIndex = Math.min(index + digits.length, 5)
      inputRefs.current[nextIndex]?.focus()
      return
    }

    if (!/^\d?$/.test(value)) return

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const code = otp.join('')
    if (code.length !== 6) {
      setError('Please enter the complete 6-digit code')
      return
    }

    setLoading(true)
    try {
      await verifyEmail({ email, otp: code })
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setError('')
    try {
      await resendOTP(email)
      setResendCooldown(60)
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to resend OTP')
    }
  }

  if (!email) return null

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Mail className="h-7 w-7 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">Check your email</CardTitle>
          <CardDescription>
            We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-center gap-2">
              {otp.map((digit, index) => (
                <Input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="h-12 w-12 text-center text-lg font-semibold"
                />
              ))}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify Email
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResend}
              disabled={resendCooldown > 0}
            >
              {resendCooldown > 0
                ? `Resend code in ${resendCooldown}s`
                : 'Resend code'}
            </Button>
          </div>

          <p className="mt-2 text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium text-foreground hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
