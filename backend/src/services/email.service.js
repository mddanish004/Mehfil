import { Resend } from 'resend'
import ical from 'ical-generator'
import env from '../config/env.js'

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

async function sendEmail({ to, subject, html, attachments }) {
  if (!resend) {
    console.warn(`[EMAIL STUB] To: ${to}, Subject: ${subject}`)
    return { success: true, stub: true }
  }

  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    attachments,
  })

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return { success: true, id: data?.id }
}

async function sendVerificationOTP(email, otp) {
  return sendEmail({
    to: email,
    subject: 'Verify your email - Mehfil',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#111;margin-bottom:8px">Verify your email</h2>
        <p style="color:#555;font-size:15px">Use the code below to verify your email address on Mehfil.</p>
        <div style="background:#f4f4f5;border-radius:8px;padding:24px;text-align:center;margin:24px 0">
          <span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#111">${otp}</span>
        </div>
        <p style="color:#888;font-size:13px">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
      </div>
    `,
  })
}

async function sendRegistrationVerificationOTP({ email, otp, eventName }) {
  return sendEmail({
    to: email,
    subject: `Verify your registration for ${eventName} - Mehfil`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#111;margin-bottom:8px">Complete your registration</h2>
        <p style="color:#555;font-size:15px">Use this code to verify your registration for <strong>${eventName}</strong>.</p>
        <div style="background:#f4f4f5;border-radius:8px;padding:24px;text-align:center;margin:24px 0">
          <span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#111">${otp}</span>
        </div>
        <p style="color:#888;font-size:13px">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
      </div>
    `,
  })
}

async function sendPasswordResetEmail(email, resetUrl) {
  return sendEmail({
    to: email,
    subject: 'Reset your password - Mehfil',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#111;margin-bottom:8px">Reset your password</h2>
        <p style="color:#555;font-size:15px">Click the button below to reset your password.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${resetUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px">Reset Password</a>
        </div>
        <p style="color:#888;font-size:13px">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
      </div>
    `,
  })
}

async function sendWelcomeEmail(email, name) {
  return sendEmail({
    to: email,
    subject: 'Welcome to Mehfil!',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#111;margin-bottom:8px">Welcome to Mehfil, ${name}!</h2>
        <p style="color:#555;font-size:15px">Your account is set up and ready to go. Start creating or discovering events today.</p>
      </div>
    `,
  })
}

function stripHtml(html = '') {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildEventIcs(event) {
  const calendar = ical({
    name: 'Mehfil Event',
  })

  const start = new Date(event.startDatetime)
  const end = new Date(event.endDatetime)

  calendar.createEvent({
    start,
    end,
    summary: event.name,
    description: stripHtml(event.description || ''),
    location: event.locationType === 'virtual' ? event.googleMeetLink || 'Virtual event' : event.locationAddress || '',
    url: `${env.CLIENT_URL}/events/${event.shortId}`,
  })

  return calendar.toString()
}

function getStatusCopy(status) {
  if (status === 'pending') {
    return {
      title: 'Registration received',
      body: 'Your registration is pending host approval.',
    }
  }

  if (status === 'approved') {
    return {
      title: 'Registration approved',
      body: 'Your registration is approved. You can attend the event.',
    }
  }

  if (status === 'rejected') {
    return {
      title: 'Registration update',
      body: 'Your registration was not approved by the host.',
    }
  }

  if (status === 'cancelled') {
    return {
      title: 'Registration cancelled',
      body: 'This registration has been cancelled.',
    }
  }

  return {
    title: 'Registration confirmed',
    body: 'You are fully registered for this event.',
  }
}

function getLocationText(event) {
  if (event.locationType === 'virtual') {
    return event.googleMeetLink || 'Virtual event'
  }
  return event.locationAddress || 'Location details will be shared by host'
}

function getTicketHtml(ticket) {
  if (!ticket) {
    return ''
  }

  return `
    <div style="margin-top:22px;border:1px solid #e4e4e7;border-radius:10px;padding:16px;background:#ffffff">
      <p style="margin:0 0 8px;color:#111;font-weight:600">Your QR Ticket</p>
      <div style="background:#fff;border:1px solid #111;border-radius:8px;display:inline-block;padding:10px">
        <img src="${ticket.qrDataUrl}" alt="Ticket QR Code" style="display:block;width:220px;height:220px;background:#fff" />
      </div>
      <p style="margin:10px 0 0;color:#666;font-size:13px">Ticket ID: ${ticket.ticket.registrationId}</p>
      <p style="margin:6px 0 0;color:#666;font-size:13px">A PDF ticket is attached for offline use.</p>
    </div>
  `
}

async function sendRegistrationConfirmationEmail({ email, name, status, event, ticket = null }) {
  const statusCopy = getStatusCopy(status)
  const eventUrl = `${env.CLIENT_URL}/events/${event.shortId}`
  const shouldAttachCalendar = ['pending', 'approved', 'registered'].includes(status)
  const attachments = []

  if (shouldAttachCalendar) {
    const icsContent = buildEventIcs(event)
    attachments.push({
      filename: `${event.shortId}.ics`,
      content: Buffer.from(icsContent).toString('base64'),
    })
  }

  if (ticket?.pdfBuffer) {
    attachments.push({
      filename: `ticket-${ticket.ticket.registrationId}.pdf`,
      content: ticket.pdfBuffer.toString('base64'),
    })
  }

  return sendEmail({
    to: email,
    subject: `${statusCopy.title}: ${event.name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px">
        <h2 style="color:#111;margin-bottom:8px">${statusCopy.title}</h2>
        <p style="color:#555;font-size:15px">Hi ${name}, ${statusCopy.body}</p>
        <div style="background:#f4f4f5;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0 0 8px;color:#111;font-weight:600">${event.name}</p>
          <p style="margin:0;color:#555;font-size:14px">${new Date(event.startDatetime).toLocaleString()} - ${new Date(event.endDatetime).toLocaleString()}</p>
          <p style="margin:8px 0 0;color:#555;font-size:14px">${getLocationText(event)}</p>
        </div>
        ${getTicketHtml(ticket)}
        <div style="margin-top:20px">
          <a href="${eventUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">View Event</a>
        </div>
        ${shouldAttachCalendar ? '<p style="color:#888;font-size:12px;margin-top:20px">A calendar invite is attached as an .ics file.</p>' : ''}
      </div>
    `,
    attachments,
  })
}

async function sendEventInvitationEmail({ email, event, inviterName, subject = null, message = null }) {
  const eventUrl = `${env.CLIENT_URL}/events/${event.shortId}`
  const heading = inviterName ? `${inviterName} invited you` : 'You are invited'

  return sendEmail({
    to: email,
    subject: subject || `You're invited: ${event.name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px">
        <h2 style="color:#111;margin-bottom:8px">${heading}</h2>
        <p style="color:#555;font-size:15px;margin-top:0">${event.name}</p>
        <div style="background:#f4f4f5;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0 0 8px;color:#111;font-weight:600">${new Date(event.startDatetime).toLocaleString()} - ${new Date(event.endDatetime).toLocaleString()}</p>
          <p style="margin:0;color:#555;font-size:14px">${getLocationText(event)}</p>
        </div>
        ${message ? `<div style="margin:16px 0;color:#333;font-size:14px;line-height:1.5">${message}</div>` : ''}
        <a href="${eventUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">View Event</a>
      </div>
    `,
  })
}

async function sendEventBlastEmail({ email, subject, content, event }) {
  const eventUrl = `${env.CLIENT_URL}/events/${event.shortId}`

  return sendEmail({
    to: email,
    subject,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:32px">
        <p style="margin:0 0 12px;color:#111;font-size:18px;font-weight:700">${event.name}</p>
        <div style="color:#222;font-size:14px;line-height:1.55">${content}</div>
        <div style="margin-top:20px">
          <a href="${eventUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">View Event</a>
        </div>
      </div>
    `,
  })
}

export {
  sendEmail,
  generateOTP,
  sendVerificationOTP,
  sendRegistrationVerificationOTP,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendRegistrationConfirmationEmail,
  sendEventInvitationEmail,
  sendEventBlastEmail,
}
