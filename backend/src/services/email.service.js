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

  return {
    title: 'Registration confirmed',
    body: 'You are fully registered for this event.',
  }
}

async function sendRegistrationConfirmationEmail({ email, name, status, event }) {
  const statusCopy = getStatusCopy(status)
  const icsContent = buildEventIcs(event)
  const eventUrl = `${env.CLIENT_URL}/events/${event.shortId}`

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
          <p style="margin:8px 0 0;color:#555;font-size:14px">${event.locationType === 'virtual' ? event.googleMeetLink || 'Virtual event' : event.locationAddress || 'Location details will be shared by host'}</p>
        </div>
        <div style="margin-top:20px">
          <a href="${eventUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">View Event</a>
        </div>
        <p style="color:#888;font-size:12px;margin-top:20px">A calendar invite is attached as an .ics file.</p>
      </div>
    `,
    attachments: [
      {
        filename: `${event.shortId}.ics`,
        content: Buffer.from(icsContent).toString('base64'),
      },
    ],
  })
}

export {
  generateOTP,
  sendVerificationOTP,
  sendRegistrationVerificationOTP,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendRegistrationConfirmationEmail,
}
