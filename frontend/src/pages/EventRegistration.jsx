import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getEventByShortId, registerForEvent } from '@/lib/events-api'

function getErrorMessage(error) {
  return error?.response?.data?.error?.message || error?.message || 'Something went wrong'
}

function formatStatus(status) {
  if (!status) return 'pending'
  return status.replace('_', ' ')
}

function getStatusClass(status) {
  if (status === 'registered') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (status === 'approved') {
    return 'bg-sky-100 text-sky-700'
  }

  return 'bg-amber-100 text-amber-700'
}

function EventRegistration() {
  const { shortId } = useParams()
  const navigate = useNavigate()
  const { user, verifyEmail, resendOTP } = useAuth()
  const [event, setEvent] = useState(null)
  const [loadingEvent, setLoadingEvent] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [registration, setRegistration] = useState(null)
  const [otp, setOtp] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    socialProfileLink: user?.socialProfileLink || '',
  })
  const [responses, setResponses] = useState({})

  useEffect(() => {
    let active = true

    async function loadEvent() {
      try {
        const data = await getEventByShortId(shortId)
        if (active) {
          setEvent(data)
          if (data.viewerRegistration) {
            setRegistration(data.viewerRegistration)
            setForm((previous) => ({
              ...previous,
              name: data.viewerRegistration.name || previous.name,
              email: data.viewerRegistration.email || previous.email,
            }))
          }
        }
      } catch (error) {
        toast.error(getErrorMessage(error))
        if (active) {
          setEvent(null)
        }
      } finally {
        if (active) {
          setLoadingEvent(false)
        }
      }
    }

    loadEvent()

    return () => {
      active = false
    }
  }, [shortId])

  useEffect(() => {
    if (resendCooldown <= 0) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setResendCooldown((previous) => previous - 1)
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [resendCooldown])

  const questions = useMemo(() => event?.registrationQuestions || [], [event])
  const status = registration?.status || null
  const canViewTicket =
    registration?.emailVerified &&
    (registration?.status === 'approved' || registration?.status === 'registered')

  function onFieldChange(key, value) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }))
  }

  function onResponseChange(question, value) {
    setResponses((previous) => ({
      ...previous,
      [question.id]: value,
    }))
  }

  function onCheckboxResponseChange(question, option, checked) {
    const current = Array.isArray(responses[question.id]) ? responses[question.id] : []
    const next = checked
      ? [...new Set([...current, option])]
      : current.filter((item) => item !== option)

    onResponseChange(question, next)
  }

  async function handleSubmit(eventObject) {
    eventObject.preventDefault()

    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Name and email are required')
      return
    }

    setSubmitting(true)
    try {
      const result = await registerForEvent(shortId, {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        socialProfileLink: form.socialProfileLink || null,
        registrationResponses: responses,
      })
      setRegistration(result.registration)
      if (!result.alreadyRegistered) {
        setResendCooldown(60)
        toast.success('OTP sent to your email')
      } else {
        toast.success('You are already registered for this event')
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerifyOtp(eventObject) {
    eventObject.preventDefault()

    if (otp.length !== 6) {
      toast.error('Enter the 6-digit OTP')
      return
    }

    setVerifying(true)
    try {
      const result = await verifyEmail({
        email: form.email,
        otp,
        purpose: 'event_registration',
        shortId,
      })
      setRegistration(result.data.registration)
      toast.success('Email verified successfully')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setVerifying(false)
    }
  }

  async function handleResendOtp() {
    try {
      await resendOTP({
        email: form.email,
        purpose: 'event_registration',
        shortId,
      })
      setResendCooldown(60)
      toast.success('OTP sent')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  if (loadingEvent) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">Event not found</h1>
        <Button className="mt-4" asChild>
          <Link to="/">Back to Home</Link>
        </Button>
      </div>
    )
  }

  const needsOtpVerification = registration && !registration.emailVerified

  return (
    <div className="container mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-6">
        <Link to={`/events/${shortId}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to Event
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Register for {event.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {status ? (
              <div className={`inline-flex rounded-full px-3 py-1 text-xs font-medium capitalize ${getStatusClass(status)}`}>
                {formatStatus(status)}
              </div>
            ) : null}

            {!registration ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(eventObject) => onFieldChange('name', eventObject.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(eventObject) => onFieldChange('email', eventObject.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(eventObject) => onFieldChange('phone', eventObject.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="socialProfileLink">Social Profile</Label>
                  <Input
                    id="socialProfileLink"
                    type="url"
                    placeholder="https://"
                    value={form.socialProfileLink}
                    onChange={(eventObject) => onFieldChange('socialProfileLink', eventObject.target.value)}
                  />
                </div>

                {questions.length ? (
                  <div className="space-y-4">
                    <h3 className="text-base font-medium">Registration Questions</h3>
                    {questions.map((question) => (
                      <div key={question.id} className="space-y-2 rounded-md border p-3">
                        <Label>
                          {question.questionText}
                          {question.isRequired ? <span className="ml-1 text-destructive">*</span> : null}
                        </Label>

                        {question.questionType === 'text' ? (
                          <Input
                            value={responses[question.id] || ''}
                            onChange={(eventObject) => onResponseChange(question, eventObject.target.value)}
                          />
                        ) : null}

                        {question.questionType === 'multiple_choice' ? (
                          <select
                            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                            value={responses[question.id] || ''}
                            onChange={(eventObject) => onResponseChange(question, eventObject.target.value)}
                          >
                            <option value="">Select an option</option>
                            {(question.options || []).map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : null}

                        {question.questionType === 'checkbox' ? (
                          <div className="space-y-2">
                            {(question.options || []).map((option) => (
                              <label key={option} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={Array.isArray(responses[question.id]) && responses[question.id].includes(option)}
                                  onChange={(eventObject) =>
                                    onCheckboxResponseChange(question, option, eventObject.target.checked)
                                  }
                                />
                                {option}
                              </label>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Register
                </Button>
              </form>
            ) : null}

            {needsOtpVerification ? (
              <form onSubmit={handleVerifyOtp} className="space-y-3 rounded-md border p-4">
                <h3 className="text-base font-medium">Verify your email</h3>
                <p className="text-sm text-muted-foreground">Enter the 6-digit OTP sent to {form.email}.</p>
                <Input
                  value={otp}
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(eventObject) => setOtp(eventObject.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={verifying}>
                    {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Verify OTP
                  </Button>
                  <Button type="button" variant="outline" disabled={resendCooldown > 0} onClick={handleResendOtp}>
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                  </Button>
                </div>
              </form>
            ) : null}

            {registration && registration.emailVerified ? (
              <div className="space-y-3 rounded-md border p-4">
                <p className="text-sm">
                  Registration status:{' '}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${getStatusClass(registration.status)}`}>
                    {formatStatus(registration.status)}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link to="/guest/profile">View Guest Profile</Link>
                  </Button>
                  {canViewTicket ? (
                    <Button variant="outline" asChild>
                      <Link to={`/registrations/${registration.id}/ticket`}>View Ticket</Link>
                    </Button>
                  ) : null}
                  <Button variant="outline" asChild>
                    <Link to={`/events/${shortId}`}>Back to Event</Link>
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {event.photoUrl ? <img src={event.photoUrl} alt={event.name} className="h-40 w-full rounded-md border object-cover" /> : null}
          <p><span className="text-muted-foreground">Date:</span> {new Date(event.startDatetime).toLocaleString()}</p>
          <p><span className="text-muted-foreground">Timezone:</span> {event.timezone}</p>
          <p><span className="text-muted-foreground">Location:</span> {event.locationType === 'virtual' ? 'Virtual' : event.locationAddress || 'TBD'}</p>
          <p><span className="text-muted-foreground">Approval:</span> {event.requireApproval ? 'Pending approval after verification' : 'Auto-approved after verification'}</p>
          <Button variant="ghost" onClick={() => navigate(`/events/${shortId}`)}>
            View Event Details
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default EventRegistration
