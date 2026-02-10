import api from '@/lib/api'

async function getRegistrationTicket(registrationId) {
  const { data } = await api.get(`/registrations/${registrationId}/ticket`)
  return data.data
}

function parseFilename(contentDisposition, fallbackName) {
  if (!contentDisposition) {
    return fallbackName
  }

  const match = contentDisposition.match(/filename="?([^";]+)"?/i)
  return match?.[1] || fallbackName
}

async function downloadRegistrationTicketPdf(registrationId) {
  const response = await api.get(`/registrations/${registrationId}/ticket`, {
    params: { format: 'pdf' },
    responseType: 'blob',
  })

  return {
    blob: response.data,
    filename: parseFilename(
      response.headers['content-disposition'],
      `ticket-${registrationId}.pdf`
    ),
  }
}

export { getRegistrationTicket, downloadRegistrationTicketPdf }
