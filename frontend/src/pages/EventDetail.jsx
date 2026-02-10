import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CalendarDays, Clock, Globe, Loader2, MapPin, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cancelEvent, getEventByShortId } from '@/lib/events-api'

function getErrorMessage(error) {
  return error?.response?.data?.error?.message || error?.message || 'Something went wrong'
}

function formatDate(dateString) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })
}

function EventDetail() {
  const { shortId } = useParams()
  const { user } = useAuth()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isCancelling, setIsCancelling] = useState(false)

  useEffect(() => {
    let active = true

    async function loadEvent() {
      try {
        const data = await getEventByShortId(shortId)
        if (active) {
          setEvent(data)
        }
      } catch (error) {
        toast.error(getErrorMessage(error))
        if (active) setEvent(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadEvent()

    return () => {
      active = false
    }
  }, [shortId])

  const canManage = useMemo(() => {
    if (!user || !event) return false
    return user.id === event.creatorId
  }, [user, event])

  async function handleCancelEvent() {
    if (!window.confirm('Cancel this event? Attendees will see it as cancelled.')) {
      return
    }

    setIsCancelling(true)
    try {
      const updatedEvent = await cancelEvent(shortId)
      setEvent(updatedEvent)
      toast.success('Event cancelled')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">Event not found</h1>
        <p className="mt-2 text-muted-foreground">This event may have been removed or the link is incorrect.</p>
        <Button className="mt-4" asChild>
          <Link to="/">Back to Home</Link>
        </Button>
      </div>
    )
  }

  const mapsQuery = event.locationAddress || `${event.locationLat},${event.locationLng}`
  const openStreetMapUrl = mapsQuery
    ? event.locationLat !== null && event.locationLng !== null
      ? `https://www.openstreetmap.org/?mlat=${event.locationLat}&mlon=${event.locationLng}#map=15/${event.locationLat}/${event.locationLng}`
      : `https://www.openstreetmap.org/search?query=${encodeURIComponent(mapsQuery)}`
    : null

  const zoomMeetingLink = event.zoomMeetingLink

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← Back to Home
        </Link>
        <div className="flex items-center gap-2">
          {canManage ? (
            <>
              <Button variant="outline" asChild>
                <Link to={`/events/${event.shortId}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </Button>
              {event.status !== 'cancelled' ? (
                <Button variant="destructive" onClick={handleCancelEvent} disabled={isCancelling}>
                  {isCancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Cancel Event
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">{event.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Hosted by {event.creator?.name || 'Unknown host'} • Status: <span className="capitalize">{event.status}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {event.photoUrl ? (
            <img src={event.photoUrl} alt={event.name} className="h-72 w-full rounded-md border object-cover" />
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="h-4 w-4" />
                Starts
              </div>
              <p className="text-sm text-muted-foreground">{formatDate(event.startDatetime)}</p>
            </div>
            <div className="rounded-md border p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4" />
                Ends
              </div>
              <p className="text-sm text-muted-foreground">{formatDate(event.endDatetime)}</p>
            </div>
            <div className="rounded-md border p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Globe className="h-4 w-4" />
                Timezone
              </div>
              <p className="text-sm text-muted-foreground">{event.timezone}</p>
            </div>
            <div className="rounded-md border p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <MapPin className="h-4 w-4" />
                Location
              </div>
              {event.locationType === 'virtual' ? (
                zoomMeetingLink ? (
                  <a
                    href={zoomMeetingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    Join on Zoom
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">Virtual event link will be shared by the host.</p>
                )
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{event.locationAddress || 'Address not provided'}</p>
                  {openStreetMapUrl ? (
                    <a href={openStreetMapUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                      Open in OpenStreetMap
                    </a>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md border p-4">
            <h2 className="mb-3 text-xl font-semibold">About this event</h2>
            {event.description ? (
              <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: event.description }} />
            ) : (
              <p className="text-sm text-muted-foreground">No description provided.</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Pricing</p>
              <p className="text-base font-medium">{event.isPaid ? `$${event.ticketPrice.toFixed(2)}` : 'Free'}</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Registration</p>
              <p className="text-base font-medium">{event.requireApproval ? 'Approval Required' : 'Auto Approved'}</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Capacity</p>
              <p className="text-base font-medium">
                {event.capacityType === 'limited' ? `${event.capacityLimit} spots` : 'Unlimited'}
              </p>
            </div>
          </div>

          <div className="rounded-md border p-4">
            <p className="text-sm text-muted-foreground">Share this event</p>
            <code className="mt-2 block rounded bg-muted px-2 py-1 text-xs">
              {window.location.origin}/events/{event.shortId}
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default EventDetail
