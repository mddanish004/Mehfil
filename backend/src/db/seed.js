import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { randomUUID } from 'crypto'
import bcrypt from 'bcrypt'
import {
  users,
  events,
  eventHosts,
  registrations,
  registrationQuestions,
  emailBlasts,
  emailVerifications,
  payments,
  eventUpdates,
} from '../models/schema.js'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required. Set it in backend/.env')
  process.exit(1)
}

const client = postgres(DATABASE_URL, { prepare: false })
const db = drizzle(client)

const PASSWORD_HASH = await bcrypt.hash('Password123', 12)

function generateShortId(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function futureDate(daysFromNow, hours = 10) {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  d.setHours(hours, 0, 0, 0)
  return d
}

function pastDate(daysAgo, hours = 10) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hours, 0, 0, 0)
  return d
}

async function seed() {
  console.log('🌱 Seeding database...\n')

  console.log('  Creating users...')
  const userIds = {
    sarah: randomUUID(),
    alex: randomUUID(),
    jordan: randomUUID(),
    priya: randomUUID(),
    mike: randomUUID(),
  }

  await db.insert(users).values([
    {
      id: userIds.sarah,
      email: 'sarah@example.com',
      passwordHash: PASSWORD_HASH,
      name: 'Sarah Chen',
      phone: '+1-555-0101',
      socialProfileLink: 'https://linkedin.com/in/sarahchen',
      emailVerified: true,
      authProvider: 'email',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
    },
    {
      id: userIds.alex,
      email: 'alex@example.com',
      passwordHash: PASSWORD_HASH,
      name: 'Alex Rivera',
      phone: '+1-555-0102',
      socialProfileLink: 'https://twitter.com/alexrivera',
      emailVerified: true,
      authProvider: 'email',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex',
    },
    {
      id: userIds.jordan,
      email: 'jordan@example.com',
      passwordHash: null,
      name: 'Jordan Williams',
      phone: '+1-555-0103',
      socialProfileLink: 'https://github.com/jordanw',
      emailVerified: true,
      authProvider: 'google',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jordan',
    },
    {
      id: userIds.priya,
      email: 'priya@example.com',
      passwordHash: PASSWORD_HASH,
      name: 'Priya Sharma',
      phone: '+91-98765-43210',
      socialProfileLink: 'https://linkedin.com/in/priyasharma',
      emailVerified: true,
      authProvider: 'email',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=priya',
    },
    {
      id: userIds.mike,
      email: 'mike@example.com',
      passwordHash: PASSWORD_HASH,
      name: 'Mike Johnson',
      phone: '+1-555-0105',
      socialProfileLink: null,
      emailVerified: false,
      authProvider: 'email',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike',
    },
  ])

  console.log('  Creating events...')
  const eventIds = {
    techMeetup: randomUUID(),
    webDevConf: randomUUID(),
    aiWorkshop: randomUUID(),
    yogaSunrise: randomUUID(),
    pastHackathon: randomUUID(),
    cancelledGala: randomUUID(),
  }

  await db.insert(events).values([
    {
      id: eventIds.techMeetup,
      shortId: generateShortId(),
      creatorId: userIds.sarah,
      name: 'Tech Founders Meetup',
      description:
        '<p>Join us for an evening of networking with tech founders and startup enthusiasts. We\'ll have lightning talks, Q&A sessions, and plenty of time to connect.</p><p><strong>Agenda:</strong></p><ul><li>6:00 PM – Doors open & networking</li><li>6:30 PM – Lightning talks</li><li>7:30 PM – Panel discussion</li><li>8:30 PM – Open networking</li></ul>',
      photoUrl: 'https://images.unsplash.com/photo-1540575467063-178a50e2fd60?w=1200',
      startDatetime: futureDate(7, 18),
      endDatetime: futureDate(7, 21),
      timezone: 'America/New_York',
      locationType: 'physical',
      locationAddress: '123 Innovation Hub, SoHo, New York, NY 10012',
      locationLat: '40.7233510',
      locationLng: '-73.9984240',
      googleMeetLink: null,
      ticketPrice: '0',
      isPaid: false,
      requireApproval: false,
      capacityType: 'limited',
      capacityLimit: 100,
      status: 'published',
    },
    {
      id: eventIds.webDevConf,
      shortId: generateShortId(),
      creatorId: userIds.alex,
      name: 'WebDev Conference 2026',
      description:
        '<p>A full-day conference covering the latest in web development. Topics include React Server Components, Edge Computing, AI-assisted development, and more.</p><p>Lunch and refreshments included with your ticket.</p>',
      photoUrl: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1200',
      startDatetime: futureDate(30, 9),
      endDatetime: futureDate(30, 18),
      timezone: 'America/Los_Angeles',
      locationType: 'physical',
      locationAddress: 'Moscone Center, 747 Howard St, San Francisco, CA 94103',
      locationLat: '37.7842280',
      locationLng: '-122.4015560',
      googleMeetLink: null,
      ticketPrice: '49.99',
      isPaid: true,
      requireApproval: false,
      capacityType: 'limited',
      capacityLimit: 500,
      status: 'published',
    },
    {
      id: eventIds.aiWorkshop,
      shortId: generateShortId(),
      creatorId: userIds.priya,
      name: 'AI/ML Hands-On Workshop',
      description:
        '<p>An interactive virtual workshop where you\'ll build a real-world machine learning project from scratch. Bring your laptop and curiosity!</p><p><strong>Prerequisites:</strong> Basic Python knowledge.</p>',
      photoUrl: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200',
      startDatetime: futureDate(14, 14),
      endDatetime: futureDate(14, 17),
      timezone: 'Asia/Kolkata',
      locationType: 'virtual',
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      googleMeetLink: 'https://zoom.us/j/98765432101',
      ticketPrice: '0',
      isPaid: false,
      requireApproval: true,
      capacityType: 'limited',
      capacityLimit: 50,
      status: 'published',
    },
    {
      id: eventIds.yogaSunrise,
      shortId: generateShortId(),
      creatorId: userIds.jordan,
      name: 'Sunrise Yoga in the Park',
      description:
        '<p>Start your weekend with a rejuvenating yoga session in Central Park. All skill levels welcome. Mats provided.</p>',
      photoUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=1200',
      startDatetime: futureDate(3, 6),
      endDatetime: futureDate(3, 8),
      timezone: 'America/New_York',
      locationType: 'physical',
      locationAddress: 'Great Lawn, Central Park, New York, NY 10024',
      locationLat: '40.7812100',
      locationLng: '-73.9665900',
      googleMeetLink: null,
      ticketPrice: '0',
      isPaid: false,
      requireApproval: false,
      capacityType: 'unlimited',
      capacityLimit: null,
      status: 'published',
    },
    {
      id: eventIds.pastHackathon,
      shortId: generateShortId(),
      creatorId: userIds.alex,
      name: 'Weekend Hackathon 2026',
      description:
        '<p>48-hour hackathon. Build something amazing with your team. Prizes for top 3 projects.</p>',
      photoUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1200',
      startDatetime: pastDate(10, 9),
      endDatetime: pastDate(8, 17),
      timezone: 'America/New_York',
      locationType: 'physical',
      locationAddress: 'WeWork, 115 Broadway, New York, NY 10006',
      locationLat: '40.7089830',
      locationLng: '-74.0121170',
      googleMeetLink: null,
      ticketPrice: '0',
      isPaid: false,
      requireApproval: false,
      capacityType: 'limited',
      capacityLimit: 200,
      status: 'published',
    },
    {
      id: eventIds.cancelledGala,
      shortId: generateShortId(),
      creatorId: userIds.sarah,
      name: 'Annual Tech Gala (Cancelled)',
      description: '<p>This event has been cancelled due to unforeseen circumstances.</p>',
      photoUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200',
      startDatetime: futureDate(60, 19),
      endDatetime: futureDate(60, 23),
      timezone: 'America/New_York',
      locationType: 'physical',
      locationAddress: 'The Plaza Hotel, 768 5th Ave, New York, NY 10019',
      locationLat: '40.7645660',
      locationLng: '-73.9745300',
      googleMeetLink: null,
      ticketPrice: '150.00',
      isPaid: true,
      requireApproval: false,
      capacityType: 'limited',
      capacityLimit: 300,
      status: 'cancelled',
    },
  ])

  console.log('  Creating event hosts...')
  await db.insert(eventHosts).values([
    { eventId: eventIds.techMeetup, userId: userIds.sarah, role: 'creator' },
    { eventId: eventIds.techMeetup, userId: userIds.alex, role: 'co_host' },
    { eventId: eventIds.webDevConf, userId: userIds.alex, role: 'creator' },
    { eventId: eventIds.webDevConf, userId: userIds.priya, role: 'co_host' },
    { eventId: eventIds.aiWorkshop, userId: userIds.priya, role: 'creator' },
    { eventId: eventIds.yogaSunrise, userId: userIds.jordan, role: 'creator' },
    { eventId: eventIds.pastHackathon, userId: userIds.alex, role: 'creator' },
    { eventId: eventIds.cancelledGala, userId: userIds.sarah, role: 'creator' },
  ])

  console.log('  Creating registration questions...')
  const questionIds = {
    techRole: randomUUID(),
    techDiet: randomUUID(),
    confExperience: randomUUID(),
    confTshirt: randomUUID(),
    aiPythonLevel: randomUUID(),
    aiLaptopOs: randomUUID(),
  }

  await db.insert(registrationQuestions).values([
    {
      id: questionIds.techRole,
      eventId: eventIds.techMeetup,
      questionText: 'What is your current role?',
      questionType: 'text',
      options: null,
      isRequired: true,
      orderIndex: 0,
    },
    {
      id: questionIds.techDiet,
      eventId: eventIds.techMeetup,
      questionText: 'Any dietary restrictions?',
      questionType: 'multiple_choice',
      options: JSON.stringify(['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Other']),
      isRequired: false,
      orderIndex: 1,
    },
    {
      id: questionIds.confExperience,
      eventId: eventIds.webDevConf,
      questionText: 'Years of web development experience?',
      questionType: 'multiple_choice',
      options: JSON.stringify(['< 1 year', '1-3 years', '3-5 years', '5-10 years', '10+ years']),
      isRequired: true,
      orderIndex: 0,
    },
    {
      id: questionIds.confTshirt,
      eventId: eventIds.webDevConf,
      questionText: 'T-shirt size',
      questionType: 'multiple_choice',
      options: JSON.stringify(['XS', 'S', 'M', 'L', 'XL', 'XXL']),
      isRequired: true,
      orderIndex: 1,
    },
    {
      id: questionIds.aiPythonLevel,
      eventId: eventIds.aiWorkshop,
      questionText: 'Rate your Python proficiency (1-5)',
      questionType: 'multiple_choice',
      options: JSON.stringify(['1 – Beginner', '2 – Elementary', '3 – Intermediate', '4 – Advanced', '5 – Expert']),
      isRequired: true,
      orderIndex: 0,
    },
    {
      id: questionIds.aiLaptopOs,
      eventId: eventIds.aiWorkshop,
      questionText: 'Which OS will you be using?',
      questionType: 'multiple_choice',
      options: JSON.stringify(['macOS', 'Windows', 'Linux']),
      isRequired: true,
      orderIndex: 1,
    },
  ])

  console.log('  Creating registrations...')
  const regIds = {
    jordanTech: randomUUID(),
    priyaTech: randomUUID(),
    mikeTech: randomUUID(),
    jordanConf: randomUUID(),
    sarahConf: randomUUID(),
    jordanAi: randomUUID(),
    mikeAi: randomUUID(),
    sarahYoga: randomUUID(),
    alexYoga: randomUUID(),
    jordanHack: randomUUID(),
    sarahHack: randomUUID(),
    mikeGala: randomUUID(),
  }

  await db.insert(registrations).values([
    {
      id: regIds.jordanTech,
      eventId: eventIds.techMeetup,
      userId: userIds.jordan,
      email: 'jordan@example.com',
      name: 'Jordan Williams',
      phone: '+1-555-0103',
      socialProfileLink: 'https://github.com/jordanw',
      status: 'approved',
      qrCode: `{"eventId":"${eventIds.techMeetup}","registrationId":"${regIds.jordanTech}","guestId":"${userIds.jordan}"}`,
      checkedIn: false,
      paymentStatus: 'not_required',
      registrationResponses: JSON.stringify({
        [questionIds.techRole]: 'Software Developer',
        [questionIds.techDiet]: 'None',
      }),
    },
    {
      id: regIds.priyaTech,
      eventId: eventIds.techMeetup,
      userId: userIds.priya,
      email: 'priya@example.com',
      name: 'Priya Sharma',
      phone: '+91-98765-43210',
      socialProfileLink: 'https://linkedin.com/in/priyasharma',
      status: 'approved',
      qrCode: `{"eventId":"${eventIds.techMeetup}","registrationId":"${regIds.priyaTech}","guestId":"${userIds.priya}"}`,
      checkedIn: false,
      paymentStatus: 'not_required',
      registrationResponses: JSON.stringify({
        [questionIds.techRole]: 'ML Engineer',
        [questionIds.techDiet]: 'Vegetarian',
      }),
    },
    {
      id: regIds.mikeTech,
      eventId: eventIds.techMeetup,
      userId: userIds.mike,
      email: 'mike@example.com',
      name: 'Mike Johnson',
      phone: '+1-555-0105',
      status: 'pending',
      qrCode: null,
      checkedIn: false,
      paymentStatus: 'not_required',
      registrationResponses: JSON.stringify({
        [questionIds.techRole]: 'Product Manager',
        [questionIds.techDiet]: 'Gluten-free',
      }),
    },
    {
      id: regIds.jordanConf,
      eventId: eventIds.webDevConf,
      userId: userIds.jordan,
      email: 'jordan@example.com',
      name: 'Jordan Williams',
      status: 'approved',
      qrCode: `{"eventId":"${eventIds.webDevConf}","registrationId":"${regIds.jordanConf}","guestId":"${userIds.jordan}"}`,
      checkedIn: false,
      paymentStatus: 'completed',
      paymentId: 'pay_jordan_conf_001',
      registrationResponses: JSON.stringify({
        [questionIds.confExperience]: '3-5 years',
        [questionIds.confTshirt]: 'L',
      }),
    },
    {
      id: regIds.sarahConf,
      eventId: eventIds.webDevConf,
      userId: userIds.sarah,
      email: 'sarah@example.com',
      name: 'Sarah Chen',
      status: 'approved',
      qrCode: `{"eventId":"${eventIds.webDevConf}","registrationId":"${regIds.sarahConf}","guestId":"${userIds.sarah}"}`,
      checkedIn: false,
      paymentStatus: 'completed',
      paymentId: 'pay_sarah_conf_001',
      registrationResponses: JSON.stringify({
        [questionIds.confExperience]: '5-10 years',
        [questionIds.confTshirt]: 'M',
      }),
    },
    {
      id: regIds.jordanAi,
      eventId: eventIds.aiWorkshop,
      userId: userIds.jordan,
      email: 'jordan@example.com',
      name: 'Jordan Williams',
      status: 'approved',
      qrCode: null,
      checkedIn: false,
      paymentStatus: 'not_required',
      registrationResponses: JSON.stringify({
        [questionIds.aiPythonLevel]: '3 – Intermediate',
        [questionIds.aiLaptopOs]: 'macOS',
      }),
    },
    {
      id: regIds.mikeAi,
      eventId: eventIds.aiWorkshop,
      userId: userIds.mike,
      email: 'mike@example.com',
      name: 'Mike Johnson',
      status: 'pending',
      qrCode: null,
      checkedIn: false,
      paymentStatus: 'not_required',
      registrationResponses: JSON.stringify({
        [questionIds.aiPythonLevel]: '1 – Beginner',
        [questionIds.aiLaptopOs]: 'Windows',
      }),
    },
    {
      id: regIds.sarahYoga,
      eventId: eventIds.yogaSunrise,
      userId: userIds.sarah,
      email: 'sarah@example.com',
      name: 'Sarah Chen',
      status: 'approved',
      checkedIn: false,
      paymentStatus: 'not_required',
    },
    {
      id: regIds.alexYoga,
      eventId: eventIds.yogaSunrise,
      userId: userIds.alex,
      email: 'alex@example.com',
      name: 'Alex Rivera',
      status: 'approved',
      checkedIn: false,
      paymentStatus: 'not_required',
    },
    {
      id: regIds.jordanHack,
      eventId: eventIds.pastHackathon,
      userId: userIds.jordan,
      email: 'jordan@example.com',
      name: 'Jordan Williams',
      status: 'approved',
      qrCode: `{"eventId":"${eventIds.pastHackathon}","registrationId":"${regIds.jordanHack}","guestId":"${userIds.jordan}"}`,
      checkedIn: true,
      checkedInAt: pastDate(10, 9),
      paymentStatus: 'not_required',
    },
    {
      id: regIds.sarahHack,
      eventId: eventIds.pastHackathon,
      userId: userIds.sarah,
      email: 'sarah@example.com',
      name: 'Sarah Chen',
      status: 'approved',
      qrCode: `{"eventId":"${eventIds.pastHackathon}","registrationId":"${regIds.sarahHack}","guestId":"${userIds.sarah}"}`,
      checkedIn: true,
      checkedInAt: pastDate(10, 9),
      paymentStatus: 'not_required',
    },
    {
      id: regIds.mikeGala,
      eventId: eventIds.cancelledGala,
      userId: userIds.mike,
      email: 'mike@example.com',
      name: 'Mike Johnson',
      status: 'cancelled',
      paymentStatus: 'refunded',
      paymentId: 'pay_mike_gala_001',
    },
  ])

  console.log('  Creating payments...')
  await db.insert(payments).values([
    {
      registrationId: regIds.jordanConf,
      amount: '49.99',
      currency: 'USD',
      paymentGatewayId: 'dodo_txn_10001',
      status: 'completed',
      paymentMethod: 'credit_card',
    },
    {
      registrationId: regIds.sarahConf,
      amount: '49.99',
      currency: 'USD',
      paymentGatewayId: 'dodo_txn_10002',
      status: 'completed',
      paymentMethod: 'credit_card',
    },
    {
      registrationId: regIds.mikeGala,
      amount: '150.00',
      currency: 'USD',
      paymentGatewayId: 'dodo_txn_10003',
      status: 'refunded',
      paymentMethod: 'credit_card',
    },
  ])

  console.log('  Creating email blasts...')
  await db.insert(emailBlasts).values([
    {
      eventId: eventIds.techMeetup,
      sentBy: userIds.sarah,
      subject: 'Reminder: Tech Founders Meetup is next week!',
      content:
        '<p>Hi everyone!</p><p>Just a friendly reminder that our Tech Founders Meetup is coming up next week. Make sure to mark your calendars!</p><p>See you there,<br/>Sarah</p>',
      recipientCount: 2,
    },
    {
      eventId: eventIds.webDevConf,
      sentBy: userIds.alex,
      subject: 'WebDev Conference – Speaker Lineup Announced!',
      content:
        '<p>Exciting news! We\'ve finalized our speaker lineup for WebDev Conference 2026. Check the event page for details.</p><p>Topics include React Server Components, Edge functions, and AI pair programming.</p>',
      recipientCount: 2,
    },
  ])

  console.log('  Creating email verifications...')
  await db.insert(emailVerifications).values([
    {
      email: 'mike@example.com',
      otp: '482901',
      expiresAt: futureDate(0, 23),
      verified: false,
      attempts: 1,
    },
    {
      email: 'sarah@example.com',
      otp: '739215',
      expiresAt: pastDate(5, 12),
      verified: true,
      attempts: 1,
    },
  ])

  console.log('  Creating event updates...')
  await db.insert(eventUpdates).values([
    {
      eventId: eventIds.techMeetup,
      updatedBy: userIds.sarah,
      updateType: 'details',
      oldValues: JSON.stringify({ name: 'Tech Meetup' }),
      newValues: JSON.stringify({ name: 'Tech Founders Meetup' }),
    },
    {
      eventId: eventIds.cancelledGala,
      updatedBy: userIds.sarah,
      updateType: 'cancellation',
      oldValues: JSON.stringify({ status: 'published' }),
      newValues: JSON.stringify({ status: 'cancelled' }),
    },
    {
      eventId: eventIds.webDevConf,
      updatedBy: userIds.alex,
      updateType: 'date_time',
      oldValues: JSON.stringify({ startDatetime: '2026-03-01T09:00:00Z' }),
      newValues: JSON.stringify({ startDatetime: futureDate(30, 9).toISOString() }),
    },
  ])

  console.log('\n✅ Seed completed successfully!')
  console.log('\n📊 Summary:')
  console.log('   • 5 users (sarah, alex, jordan, priya, mike)')
  console.log('   • 6 events (4 upcoming, 1 past, 1 cancelled)')
  console.log('   • 8 event host assignments')
  console.log('   • 6 registration questions across 3 events')
  console.log('   • 12 registrations (various statuses)')
  console.log('   • 3 payment records')
  console.log('   • 2 email blasts')
  console.log('   • 2 email verification records')
  console.log('   • 3 event update audit logs')
  console.log('\n🔑 Test credentials:')
  console.log('   Email: sarah@example.com / Password: Password123')
  console.log('   Email: alex@example.com  / Password: Password123')
  console.log('   Email: jordan@example.com (Google OAuth – no password)')

  await client.end()
  process.exit(0)
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err)
  client.end()
  process.exit(1)
})
