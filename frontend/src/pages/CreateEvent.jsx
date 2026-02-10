import { Link, useNavigate } from 'react-router-dom'
import EventForm from '@/components/events/EventForm'

function CreateEvent() {
  const navigate = useNavigate()

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← Back to Home
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Create Event</h1>
      </div>

      <EventForm
        mode="create"
        onSuccess={(event) => {
          navigate(`/events/${event.shortId}`)
        }}
      />
    </div>
  )
}

export default CreateEvent
