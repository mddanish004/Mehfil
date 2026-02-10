import { Link } from 'react-router-dom'
import { CalendarDays, Globe, MapPin, Ticket, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function formatDate(value) {
  if (!value) {
    return 'Date TBD'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Date TBD'
  }

  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatPrice(event) {
  if (!event?.isPaid) {
    return 'Free'
  }

  return `$${Number(event.ticketPrice || 0).toFixed(2)}`
}

function getLocationLabel(event) {
  if (event?.locationType === 'virtual') {
    return 'Virtual'
  }

  return event?.locationAddress || 'Location TBD'
}

function getStatusClass(status) {
  if (status === 'published') {
    return 'bg-emerald-100 text-emerald-700'
  }

  if (status === 'cancelled') {
    return 'bg-rose-100 text-rose-700'
  }

  return 'bg-amber-100 text-amber-700'
}

function EventCard({ event, view = 'grid' }) {
  const isList = view === 'list'
  const locationLabel = getLocationLabel(event)

  return (
    <Card className={cn('overflow-hidden', isList && 'w-full')}>
      <div className={cn(isList && 'flex flex-col sm:flex-row')}>
        <div className={cn('bg-muted', isList ? 'h-48 sm:h-auto sm:w-56 sm:shrink-0' : 'h-44')}>
          {event.photoUrl ? (
            <img src={event.photoUrl} alt={event.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              No photo
            </div>
          )}
        </div>

        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Link to={`/events/${event.shortId}`} className="text-lg font-semibold leading-tight hover:underline">
              {event.name}
            </Link>
            <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium capitalize', getStatusClass(event.status))}>
              {event.status}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            <span>{formatDate(event.startDatetime)}</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {event.locationType === 'virtual' ? <Globe className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
            <span className="line-clamp-1">{locationLabel}</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-2 text-foreground">
              <Ticket className="h-4 w-4" />
              {formatPrice(event)}
            </span>
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              {event.attendeeCount || 0} attendees
            </span>
          </div>

          <div className="mt-auto pt-1">
            <Button variant="outline" asChild>
              <Link to={`/events/${event.shortId}`}>View event</Link>
            </Button>
          </div>
        </CardContent>
      </div>
    </Card>
  )
}

export default EventCard
