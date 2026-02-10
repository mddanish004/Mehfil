import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ArrowLeft, MailCheck } from 'lucide-react'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const { forgotPassword } = useAuth()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <MailCheck className="h-7 w-7 text-muted-foreground" />
            </div>
            <CardTitle className="text-xl">Check your email</CardTitle>
            <CardDescription>
              If an account exists for <span className="font-medium text-foreground">{email}</span>,
              we&apos;ve sent a password reset link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/login">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to sign in
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link to="/" className="text-2xl font-bold tracking-tight mb-2 inline-block">
            Mehfil
          </Link>
          <CardTitle className="text-xl">Forgot your password?</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a reset link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Reset Link
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium text-foreground hover:underline">
              <ArrowLeft className="mr-1 inline h-3 w-3" />
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
