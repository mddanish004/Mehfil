function TicketQrCode({ qrDataUrl, registrationId }) {
  return (
    <div className="rounded-xl border border-black bg-white p-4 shadow-sm">
      <div className="mx-auto w-full max-w-[320px] rounded-md border border-black bg-white p-3">
        <img
          src={qrDataUrl}
          alt="Ticket QR code"
          className="h-full w-full bg-white object-contain"
        />
      </div>
      <p className="mt-3 text-center text-xs font-medium tracking-wide text-black">
        TICKET ID: {registrationId}
      </p>
    </div>
  )
}

export default TicketQrCode
