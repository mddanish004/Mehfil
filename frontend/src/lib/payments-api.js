import api from '@/lib/api'

async function createPayment(payload) {
  const { data } = await api.post('/payments/create', payload)
  return data.data
}

async function confirmPayment(payload) {
  const { data } = await api.post('/payments/confirm', payload)
  return data.data
}

async function refundPayment(paymentId, payload = {}) {
  const { data } = await api.post(`/payments/${paymentId}/refund`, payload)
  return data.data
}

export { createPayment, confirmPayment, refundPayment }
