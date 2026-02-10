import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import api from '@/lib/api'

function getErrorMessage(error) {
  return error?.response?.data?.error?.message || error?.message || 'Something went wrong'
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

function GuestProfile() {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [events, setEvents] = useState({ upcoming: [], past: [] })
  const [activeTab, setActiveTab] = useState('upcoming')

  useEffect(() => {
    let active = true

    async function loadProfile() {
      try {
        const { data } = await api.get('/auth/guest-profile')
        if (active) {
          setProfile(data.data.profile)
          setEvents(data.data.events || { upcoming: [], past: [] })
        }
      } catch (error) {
        if (active) {
          toast.error(getErrorMessage(error))
          setProfile(null)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadProfile()

    return () => {
      active = false
    }
  }, [])

  const currentList = useMemo(
    () => (activeTab === 'upcoming' ? events.upcoming || [] : events.past || []),
    [activeTab, events]
  )

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">Guest profile not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">Verify a registration email first or sign in with your account.</p>
        <Button className="mt-4" asChild>
          <Link to="/">Back to Home</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← Back to Home
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Guest Profile</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <p className="text-sm"><span className="text-muted-foreground">Name:</span> {profile.name || '-'}</p>
          <p className="text-sm"><span className="text-muted-foreground">Email:</span> {profile.email || '-'}</p>
          <p className="text-sm"><span className="text-muted-foreground">Phone:</span> {profile.phone || '-'}</p>
          <p className="text-sm"><span className="text-muted-foreground">Social:</span> {profile.socialProfileLink || '-'}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Registered Events</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant={activeTab === 'upcoming' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('upcoming')}
            >
              Upcoming ({events.upcoming?.length || 0})
            </Button>
            <Button
              variant={activeTab === 'past' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('past')}
            >
              Past ({events.past?.length || 0})
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {currentList.length ? (
            <div className="space-y-3">
              {currentList.map((item) => (
                <div key={item.registrationId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div className="space-y-1">
                    <Link to={`/events/${item.event.shortId}`} className="font-medium hover:underline">
                      {item.event.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {new Date(item.event.startDatetime).toLocaleString()} • {item.event.locationType === 'virtual' ? 'Virtual' : item.event.locationAddress || 'Location TBD'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${getStatusClass(item.status)}`}>
                      {item.status}
                    </span>
                    {item.emailVerified && (item.status === 'approved' || item.status === 'registered') ? (
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/registrations/${item.registrationId}/ticket`}>Ticket</Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No events in this section.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default GuestProfile
