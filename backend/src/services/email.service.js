import { Resend } from 'resend'
import env from '../config/env.js'

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

async function sendEmail({ to, subject, html }) {
  if (!resend) {
    console.warn(`[EMAIL STUB] To: ${to}, Subject: ${subject}`)
    return { success: true, stub: true }
  }

  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
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

export { generateOTP, sendVerificationOTP, sendPasswordResetEmail, sendWelcomeEmail }
