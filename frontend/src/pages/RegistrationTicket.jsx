import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import TicketQrCode from '@/components/tickets/TicketQrCode'
import {
  downloadRegistrationTicketPdf,
  getRegistrationTicket,
} from '@/lib/registrations-api'

function getErrorMessage(error) {
  return error?.response?.data?.error?.message || error?.message || 'Something went wrong'
}

function formatDate(datetime) {
  const date = new Date(datetime)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }
  return date.toLocaleString()
}

function RegistrationTicket() {
  const { registrationId } = useParams()
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [ticket, setTicket] = useState(null)

  useEffect(() => {
    let active = true

    async function loadTicket() {
      try {
        const data = await getRegistrationTicket(registrationId)
        if (active) {
          setTicket(data.ticket)
        }
      } catch (error) {
        if (active) {
          toast.error(getErrorMessage(error))
          setTicket(null)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadTicket()

    return () => {
      active = false
    }
  }, [registrationId])

  async function handleDownloadPdf() {
    setDownloading(true)
    try {
      const { blob, filename } = await downloadRegistrationTicketPdf(registrationId)
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">Ticket unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This ticket cannot be viewed yet or the link is invalid.
        </p>
        <Button className="mt-4" asChild>
          <Link to="/guest/profile">Back to Guest Profile</Link>
        </Button>
      </div>
    )
  }

  const locationLabel =
    ticket.locationType === 'virtual'
      ? 'Virtual'
      : ticket.locationAddress || 'Location details will be shared by host'

  return (
    <div className="container mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[1fr_0.9fr]">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <Link to={`/events/${ticket.eventShortId}`} className="text-sm text-muted-foreground hover:underline">
              ← Back to Event
            </Link>
            <CardTitle className="mt-2 text-2xl">{ticket.eventName}</CardTitle>
          </div>
          <Button variant="outline" onClick={handleDownloadPdf} disabled={downloading}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download PDF
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p><span className="text-muted-foreground">Attendee:</span> {ticket.attendeeName}</p>
          <p><span className="text-muted-foreground">Email:</span> {ticket.attendeeEmail}</p>
          <p><span className="text-muted-foreground">Date:</span> {formatDate(ticket.eventStartDatetime)}</p>
          <p><span className="text-muted-foreground">End:</span> {formatDate(ticket.eventEndDatetime)}</p>
          <p><span className="text-muted-foreground">Timezone:</span> {ticket.timezone}</p>
          <p><span className="text-muted-foreground">Location:</span> {locationLabel}</p>
          <p><span className="text-muted-foreground">Status:</span> {ticket.registrationStatus}</p>
          <p><span className="text-muted-foreground">Ticket ID:</span> {ticket.registrationId}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scan at Entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TicketQrCode
            qrDataUrl={ticket.qrDataUrl}
            registrationId={ticket.registrationId}
          />
          <p className="text-sm text-muted-foreground">
            Keep this ticket open or downloaded for fast check-in at the venue.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default RegistrationTicket
