import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import EventForm from '@/components/events/EventForm'
import { getEventByShortId } from '@/lib/events-api'

function getErrorMessage(error) {
  return error?.response?.data?.error?.message || error?.message || 'Something went wrong'
}

function EditEvent() {
  const { shortId } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadEvent() {
      try {
        const data = await getEventByShortId(shortId)
        if (active) setEvent(data)
      } catch (error) {
        toast.error(getErrorMessage(error))
        navigate('/not-found')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadEvent()

    return () => {
      active = false
    }
  }, [shortId, navigate])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!event) return null

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link to={`/events/${shortId}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to Event
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Edit Event</h1>
      </div>

      <EventForm
        mode="edit"
        initialEvent={event}
        onSuccess={(updatedEvent) => {
          navigate(`/events/${updatedEvent.shortId}`)
        }}
      />
    </div>
  )
}

export default EditEvent
