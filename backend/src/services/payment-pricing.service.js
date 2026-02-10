import env from '../config/env.js'

function asNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function roundCurrency(value) {
  return Math.round((asNumber(value) + Number.EPSILON) * 100) / 100
}

function toMinorUnits(value) {
  return Math.round(roundCurrency(value) * 100)
}

function fromMinorUnits(value) {
  return roundCurrency(asNumber(value) / 100)
}

function calculatePaymentBreakdown(ticketPrice) {
  const ticketAmount = Math.max(0, roundCurrency(ticketPrice))
  const platformFee = roundCurrency(
    (ticketAmount * Math.max(0, asNumber(env.PAYMENT_PLATFORM_FEE_PERCENT))) / 100
  )
  const processingFee = roundCurrency(
    (ticketAmount * Math.max(0, asNumber(env.PAYMENT_PROCESSING_FEE_PERCENT))) / 100 +
      Math.max(0, asNumber(env.PAYMENT_PROCESSING_FEE_FIXED))
  )
  const totalAmount = roundCurrency(ticketAmount + platformFee + processingFee)

  return {
    currency: (env.PAYMENT_CURRENCY || 'USD').toUpperCase(),
    ticketAmount,
    platformFee,
    processingFee,
    totalAmount,
    ticketMinor: toMinorUnits(ticketAmount),
    platformFeeMinor: toMinorUnits(platformFee),
    processingFeeMinor: toMinorUnits(processingFee),
    totalMinor: toMinorUnits(totalAmount),
  }
}

function serializePaymentBreakdown(breakdown) {
  if (!breakdown) {
    return null
  }

  return {
    currency: breakdown.currency,
    ticketAmount: roundCurrency(breakdown.ticketAmount),
    platformFee: roundCurrency(breakdown.platformFee),
    processingFee: roundCurrency(breakdown.processingFee),
    totalAmount: roundCurrency(breakdown.totalAmount),
  }
}

export {
  calculatePaymentBreakdown,
  fromMinorUnits,
  roundCurrency,
  serializePaymentBreakdown,
  toMinorUnits,
}
