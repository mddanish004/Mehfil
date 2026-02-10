import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import RichTextEditor from '@/components/events/RichTextEditor'
import {
  addEventHost,
  approveRegistration,
  cancelEvent,
  exportEventGuestsCsv,
  getEventBlast,
  getEventDashboard,
  inviteEventGuests,
  rejectRegistration,
  removeEventHost,
  sendEventBlast,
  updateEvent,
} from '@/lib/events-api'

const TABS = ['overview', 'guests', 'registration', 'blast', 'more']

function getErrorMessage(error) {
  return error?.response?.data?.error?.message || error?.message || 'Something went wrong'
}

function formatDate(dateString) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function parseEmails(value) {
  return String(value || '')
    .split(/[\n,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function createEmptyQuestion() {
  return {
    questionText: '',
    questionType: 'text',
    options: [],
    isRequired: false,
    orderIndex: 0,
  }
}

function EventDashboard() {
  const { shortId } = useParams()
  const [activeTab, setActiveTab] = useState('overview')
  const [dashboard, setDashboard] = useState(null)
  const [blastData, setBlastData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [guestSearchInput, setGuestSearchInput] = useState('')
  const [guestStatusInput, setGuestStatusInput] = useState('all')
  const [guestFilters, setGuestFilters] = useState({
    search: '',
    status: 'all',
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  })

  const [blastPage, setBlastPage] = useState(1)

  const [hostIdentifier, setHostIdentifier] = useState('')
  const [inviteEmails, setInviteEmails] = useState('')
  const [inviteSubject, setInviteSubject] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')

  const [requireApproval, setRequireApproval] = useState(false)
  const [templateSubject, setTemplateSubject] = useState('')
  const [templateBody, setTemplateBody] = useState('')
  const [questions, setQuestions] = useState([])
  const [dragIndex, setDragIndex] = useState(null)

  const [blastSubject, setBlastSubject] = useState('')
  const [blastContent, setBlastContent] = useState('<p></p>')
  const [blastRecipientType, setBlastRecipientType] = useState('all')
  const [blastStatuses, setBlastStatuses] = useState(['pending', 'approved', 'registered'])
  const [blastEmails, setBlastEmails] = useState('')

  const [refundMode, setRefundMode] = useState('none')

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getEventDashboard(shortId, {
        guestSearch: guestFilters.search || undefined,
        guestStatus: guestFilters.status,
        guestPage: guestFilters.page,
        guestLimit: guestFilters.limit,
        guestSortBy: guestFilters.sortBy,
        guestSortOrder: guestFilters.sortOrder,
        blastPage,
        blastLimit: 20,
      })

      setDashboard(data)
      setRequireApproval(Boolean(data.registration?.requireApproval))
      setTemplateSubject(data.registration?.emailTemplate?.subjectTemplate || '')
      setTemplateBody(data.registration?.emailTemplate?.bodyTemplate || '')
      setQuestions(data.registration?.customQuestions || [])
      setRefundMode(data.more?.cancellation?.refundHandling?.options?.[0] || 'none')
    } catch (error) {
      toast.error(getErrorMessage(error))
      setDashboard(null)
    } finally {
      setLoading(false)
    }
  }, [shortId, guestFilters, blastPage])

  const loadBlast = useCallback(async () => {
    try {
      const data = await getEventBlast(shortId, { page: blastPage, limit: 20 })
      setBlastData(data)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }, [shortId, blastPage])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    loadBlast()
  }, [loadBlast])

  const event = dashboard?.overview?.event || null
  const guestStats = dashboard?.guests?.statistics || {}
  const guestRows = dashboard?.guests?.list || []
  const guestPagination = dashboard?.guests?.pagination || {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasMore: false,
  }

  const hostRows = dashboard?.overview?.coHosts || []
  const shareUrl = dashboard?.overview?.quickActions?.shareUrl || ''
  const blastHistory = blastData?.history || dashboard?.blast?.history || []
  const blastPagination = blastData?.pagination || dashboard?.blast?.pagination || {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasMore: false,
  }

  const blastRecipientGroups = blastData?.recipientGroups || dashboard?.blast?.recipientGroups || []
  const paymentSummary = dashboard?.more?.cancellation?.refundHandling?.paymentSummary || {
    refundableAmount: 0,
    completedPayments: 0,
  }

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: 'All' },
      { value: 'pending', label: 'Pending' },
      { value: 'approved', label: 'Approved' },
      { value: 'registered', label: 'Registered' },
      { value: 'rejected', label: 'Rejected' },
      { value: 'cancelled', label: 'Cancelled' },
    ],
    []
  )

  async function handleApplyGuestFilters(eventObject) {
    eventObject.preventDefault()
    setGuestFilters((previous) => ({
      ...previous,
      search: guestSearchInput.trim(),
      status: guestStatusInput,
      page: 1,
    }))
  }

  async function handleGuestModeration(registrationId, action) {
    try {
      setSaving(true)
      if (action === 'approve') {
        await approveRegistration(registrationId)
        toast.success('Guest approved')
      } else {
        await rejectRegistration(registrationId)
        toast.success('Guest rejected')
      }
      await Promise.all([loadDashboard(), loadBlast()])
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleExportGuestsCsv() {
    try {
      const blob = await exportEventGuestsCsv(shortId, {
        guestSearch: guestFilters.search || undefined,
        guestStatus: guestFilters.status,
        guestSortBy: guestFilters.sortBy,
        guestSortOrder: guestFilters.sortOrder,
      })

      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${shortId}-guests.csv`
      anchor.click()
      window.URL.revokeObjectURL(url)
      toast.success('CSV download started')
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  async function handleAddHost(eventObject) {
    eventObject.preventDefault()
    const value = hostIdentifier.trim()
    if (!value) {
      toast.error('Enter co-host email or user id')
      return
    }

    try {
      setSaving(true)
      const payload = value.includes('@') ? { email: value } : { userId: value }
      await addEventHost(shortId, payload)
      setHostIdentifier('')
      toast.success('Co-host added')
      await loadDashboard()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveHost(userId) {
    try {
      setSaving(true)
      await removeEventHost(shortId, { userId })
      toast.success('Co-host removed')
      await loadDashboard()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleInviteGuests(eventObject) {
    eventObject.preventDefault()
    const recipientEmails = parseEmails(inviteEmails)

    if (!recipientEmails.length) {
      toast.error('Enter at least one email')
      return
    }

    try {
      setSaving(true)
      const result = await inviteEventGuests(shortId, {
        recipientEmails,
        subject: inviteSubject.trim() || undefined,
        message: inviteMessage.trim() || undefined,
      })
      toast.success(`Invites sent: ${result.sent}/${result.attempted}`)
      setInviteEmails('')
      setInviteSubject('')
      setInviteMessage('')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyShareUrl() {
    if (!shareUrl) return

    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success('Share link copied')
    } catch {
      toast.error('Unable to copy link')
    }
  }

  function updateQuestion(index, field, value) {
    setQuestions((previous) =>
      previous.map((question, questionIndex) =>
        questionIndex === index
          ? {
              ...question,
              [field]: value,
            }
          : question
      )
    )
  }

  function updateQuestionOptions(index, value) {
    const options = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    updateQuestion(index, 'options', options)
  }

  function addQuestion() {
    setQuestions((previous) => [
      ...previous,
      {
        ...createEmptyQuestion(),
        orderIndex: previous.length,
      },
    ])
  }

  function removeQuestion(index) {
    setQuestions((previous) => previous.filter((_, questionIndex) => questionIndex !== index))
  }

  function handleQuestionDrop(index) {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null)
      return
    }

    setQuestions((previous) => {
      const next = [...previous]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(index, 0, moved)
      return next.map((question, orderIndex) => ({
        ...question,
        orderIndex,
      }))
    })

    setDragIndex(null)
  }

  async function handleSaveRegistrationSettings() {
    const preparedQuestions = questions.map((question, orderIndex) => {
      const questionType = question.questionType || 'text'
      const options = Array.isArray(question.options) ? question.options.filter(Boolean) : []
      return {
        questionText: String(question.questionText || '').trim(),
        questionType,
        options,
        isRequired: Boolean(question.isRequired),
        orderIndex,
      }
    })

    const invalid = preparedQuestions.find(
      (question) => !question.questionText || (question.questionType !== 'text' && question.options.length < 2)
    )

    if (invalid) {
      toast.error('Complete all questions. Choice questions need at least 2 options.')
      return
    }

    try {
      setSaving(true)
      await updateEvent(shortId, {
        requireApproval,
        registrationQuestions: preparedQuestions,
      })
      toast.success('Registration settings saved')
      await loadDashboard()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function toggleBlastStatus(status) {
    setBlastStatuses((previous) =>
      previous.includes(status)
        ? previous.filter((item) => item !== status)
        : [...previous, status]
    )
  }

  async function handleSendBlast(eventObject) {
    eventObject.preventDefault()

    if (!blastSubject.trim()) {
      toast.error('Subject is required')
      return
    }

    const recipients = { type: blastRecipientType }

    if (blastRecipientType === 'status') {
      if (!blastStatuses.length) {
        toast.error('Select at least one status')
        return
      }
      recipients.statuses = blastStatuses
    }

    if (blastRecipientType === 'emails') {
      const emails = parseEmails(blastEmails)
      if (!emails.length) {
        toast.error('Add recipient emails')
        return
      }
      recipients.emails = emails
    }

    try {
      setSaving(true)
      const result = await sendEventBlast(shortId, {
        subject: blastSubject.trim(),
        content: blastContent,
        recipients,
      })
      toast.success(`Blast sent: ${result.delivery.sent}/${result.delivery.attempted}`)
      setBlastSubject('')
      setBlastContent('<p></p>')
      setBlastEmails('')
      await Promise.all([loadDashboard(), loadBlast()])
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelEvent() {
    if (!window.confirm('Cancel this event? This action updates guest status and can process refunds.')) {
      return
    }

    try {
      setSaving(true)
      await cancelEvent(shortId, { refundMode })
      toast.success('Event cancelled')
      await loadDashboard()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!dashboard || !event) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Dashboard unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">You may not have host access for this event.</p>
        <Button className="mt-4" asChild>
          <Link to={`/events/${shortId}`}>Back to Event</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to={`/events/${shortId}`} className="text-sm text-muted-foreground hover:underline">
            ← Back to Event
          </Link>
          <h1 className="mt-1 text-3xl font-bold">Host Dashboard</h1>
          <p className="text-sm text-muted-foreground">{event.name}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Button
            key={tab}
            type="button"
            variant={activeTab === tab ? 'default' : 'outline'}
            onClick={() => setActiveTab(tab)}
            className="capitalize"
          >
            {tab}
          </Button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Event Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="text-sm font-medium capitalize">{event.status}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-sm text-muted-foreground">Date</p>
                <p className="text-sm font-medium">{formatDate(event.startDatetime)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-sm text-muted-foreground">Total Guests</p>
                <p className="text-sm font-medium">{dashboard.overview.summary.totalGuests}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-sm text-muted-foreground">Active Guests</p>
                <p className="text-sm font-medium">{dashboard.overview.summary.activeGuests}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-sm text-muted-foreground">Capacity Remaining</p>
                <p className="text-sm font-medium">
                  {dashboard.overview.summary.capacityRemaining === null
                    ? 'Unlimited'
                    : dashboard.overview.summary.capacityRemaining}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-sm text-muted-foreground">Checked In</p>
                <p className="text-sm font-medium">{dashboard.overview.summary.checkedInGuests}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button type="button" className="w-full" onClick={() => setActiveTab('guests')}>
                Invite Guests
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={handleCopyShareUrl}>
                Share Event
              </Button>
              <div className="rounded-md border bg-muted/30 p-2 text-xs break-all">{shareUrl}</div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Co-host Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleAddHost} className="flex flex-col gap-2 md:flex-row">
                <Input
                  value={hostIdentifier}
                  onChange={(eventObject) => setHostIdentifier(eventObject.target.value)}
                  placeholder="cohost@email.com or user id"
                />
                <Button type="submit" disabled={saving}>Add Co-host</Button>
              </form>

              <div className="space-y-2">
                {hostRows.map((host) => (
                  <div key={host.user.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">{host.user.name || host.user.email}</p>
                      <p className="text-xs text-muted-foreground">{host.user.email} • {host.role}</p>
                    </div>
                    {host.role !== 'creator' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleRemoveHost(host.user.id)}
                        disabled={saving}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Invite Guests</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInviteGuests} className="space-y-3">
                <div className="space-y-2">
                  <Label>Recipient Emails</Label>
                  <textarea
                    className="min-h-[90px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                    placeholder="one@email.com, two@email.com"
                    value={inviteEmails}
                    onChange={(eventObject) => setInviteEmails(eventObject.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    value={inviteSubject}
                    onChange={(eventObject) => setInviteSubject(eventObject.target.value)}
                    placeholder="Optional custom subject"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Message</Label>
                  <textarea
                    className="min-h-[90px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                    value={inviteMessage}
                    onChange={(eventObject) => setInviteMessage(eventObject.target.value)}
                    placeholder="Optional invite note"
                  />
                </div>
                <Button type="submit" disabled={saving}>Send Invites</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === 'guests' ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-semibold">{guestStats.total || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-semibold">{guestStats.pending || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Approved</p>
                <p className="text-xl font-semibold">{guestStats.approved || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Registered</p>
                <p className="text-xl font-semibold">{guestStats.registered || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Rejected</p>
                <p className="text-xl font-semibold">{guestStats.rejected || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Checked In</p>
                <p className="text-xl font-semibold">{guestStats.checkedIn || 0}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Guest List</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleApplyGuestFilters} className="grid gap-3 md:grid-cols-4">
                <Input
                  value={guestSearchInput}
                  onChange={(eventObject) => setGuestSearchInput(eventObject.target.value)}
                  placeholder="Search by name, email, phone"
                  className="md:col-span-2"
                />
                <select
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={guestStatusInput}
                  onChange={(eventObject) => setGuestStatusInput(eventObject.target.value)}
                >
                  {statusOptions.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
                <Button type="submit">Apply Filters</Button>
              </form>

              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={handleExportGuestsCsv}>
                  Export CSV
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-2 py-2">Name</th>
                      <th className="px-2 py-2">Email</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Verified</th>
                      <th className="px-2 py-2">Checked In</th>
                      <th className="px-2 py-2">Registered At</th>
                      <th className="px-2 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guestRows.length ? (
                      guestRows.map((row) => (
                        <tr key={row.id} className="border-b">
                          <td className="px-2 py-3 font-medium">{row.name}</td>
                          <td className="px-2 py-3">{row.email}</td>
                          <td className="px-2 py-3 capitalize">{row.status}</td>
                          <td className="px-2 py-3">{row.emailVerified ? 'Yes' : 'No'}</td>
                          <td className="px-2 py-3">{row.checkedIn ? 'Yes' : 'No'}</td>
                          <td className="px-2 py-3">{formatDate(row.createdAt)}</td>
                          <td className="px-2 py-3">
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={saving || row.status !== 'pending'}
                                onClick={() => handleGuestModeration(row.id, 'approve')}
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={saving || row.status === 'rejected' || row.status === 'cancelled'}
                                onClick={() => handleGuestModeration(row.id, 'reject')}
                              >
                                Reject
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-2 py-8 text-center text-muted-foreground" colSpan={7}>
                          No guests found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Page {guestPagination.page} of {Math.max(guestPagination.totalPages, 1)} • {guestPagination.total} guests
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={guestPagination.page <= 1}
                    onClick={() =>
                      setGuestFilters((previous) => ({
                        ...previous,
                        page: Math.max(1, previous.page - 1),
                      }))
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!guestPagination.hasMore}
                    onClick={() =>
                      setGuestFilters((previous) => ({
                        ...previous,
                        page: previous.page + 1,
                      }))
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === 'registration' ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Email Template Editor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Template Subject</Label>
                <Input
                  value={templateSubject}
                  onChange={(eventObject) => setTemplateSubject(eventObject.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Template Body</Label>
                <textarea
                  className="min-h-[140px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={templateBody}
                  onChange={(eventObject) => setTemplateBody(eventObject.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="requireApproval"
                  type="checkbox"
                  checked={requireApproval}
                  onChange={(eventObject) => setRequireApproval(eventObject.target.checked)}
                />
                <Label htmlFor="requireApproval">Require host approval for registrations</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Custom Question Builder</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {questions.map((question, index) => (
                <div
                  key={`${question.id || 'new'}-${index}`}
                  className="space-y-2 rounded-md border p-3"
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(eventObject) => eventObject.preventDefault()}
                  onDrop={() => handleQuestionDrop(index)}
                >
                  <div className="grid gap-2 md:grid-cols-3">
                    <Input
                      value={question.questionText || ''}
                      onChange={(eventObject) => updateQuestion(index, 'questionText', eventObject.target.value)}
                      placeholder="Question text"
                      className="md:col-span-2"
                    />
                    <select
                      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                      value={question.questionType || 'text'}
                      onChange={(eventObject) => updateQuestion(index, 'questionType', eventObject.target.value)}
                    >
                      <option value="text">Text</option>
                      <option value="multiple_choice">Multiple choice</option>
                      <option value="checkbox">Checkbox</option>
                    </select>
                  </div>

                  {question.questionType !== 'text' ? (
                    <Input
                      value={(question.options || []).join(', ')}
                      onChange={(eventObject) => updateQuestionOptions(index, eventObject.target.value)}
                      placeholder="Option A, Option B"
                    />
                  ) : null}

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(question.isRequired)}
                        onChange={(eventObject) => updateQuestion(index, 'isRequired', eventObject.target.checked)}
                      />
                      Required
                    </label>
                    <Button type="button" variant="outline" size="sm" onClick={() => removeQuestion(index)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={addQuestion}>Add Question</Button>
                <Button type="button" disabled={saving} onClick={handleSaveRegistrationSettings}>
                  Save Registration Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === 'blast' ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Rich Text Email Composer</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSendBlast} className="space-y-4">
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    value={blastSubject}
                    onChange={(eventObject) => setBlastSubject(eventObject.target.value)}
                    placeholder="Blast subject"
                    maxLength={255}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Recipients</Label>
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={blastRecipientType}
                    onChange={(eventObject) => setBlastRecipientType(eventObject.target.value)}
                  >
                    <option value="all">All active guests</option>
                    <option value="status">By status</option>
                    <option value="emails">Custom emails</option>
                  </select>
                </div>

                {blastRecipientType === 'status' ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {statusOptions
                      .filter((item) => item.value !== 'all')
                      .map((item) => (
                        <label key={item.value} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                          <input
                            type="checkbox"
                            checked={blastStatuses.includes(item.value)}
                            onChange={() => toggleBlastStatus(item.value)}
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                  </div>
                ) : null}

                {blastRecipientType === 'emails' ? (
                  <textarea
                    className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                    placeholder="guest1@email.com, guest2@email.com"
                    value={blastEmails}
                    onChange={(eventObject) => setBlastEmails(eventObject.target.value)}
                  />
                ) : null}

                <div className="space-y-2">
                  <Label>Content</Label>
                  <RichTextEditor value={blastContent} onChange={setBlastContent} maxLength={100000} />
                </div>

                <Button type="submit" disabled={saving}>Send Blast</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Blast History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="mb-2 text-xs text-muted-foreground">Recipient Selection</p>
                <div className="space-y-1 text-sm">
                  {blastRecipientGroups.map((group) => (
                    <div key={group.key} className="flex items-center justify-between">
                      <span>{group.label}</span>
                      <span className="font-medium">{group.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {blastHistory.length ? (
                blastHistory.map((item) => (
                  <div key={item.id} className="rounded-md border p-3">
                    <p className="text-sm font-medium">{item.subject}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.recipientCount} recipients • {formatDate(item.sentAt)}</p>
                    <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{item.contentPreview}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No blasts sent yet.</p>
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Page {blastPagination.page} of {Math.max(blastPagination.totalPages, 1)}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={blastPagination.page <= 1}
                    onClick={() => setBlastPage((previous) => Math.max(1, previous - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!blastPagination.hasMore}
                    onClick={() => setBlastPage((previous) => previous + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === 'more' ? (
        <Card>
          <CardHeader>
            <CardTitle>Event Cancellation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Current Status</p>
                <p className="text-sm font-medium capitalize">{event.status}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Refundable Amount</p>
                <p className="text-sm font-medium">
                  ${Number(paymentSummary.refundableAmount || 0).toFixed(2)}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Completed Payments</p>
                <p className="text-sm font-medium">
                  {paymentSummary.completedPayments || 0}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Refund Handling</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm md:w-64"
                value={refundMode}
                onChange={(eventObject) => setRefundMode(eventObject.target.value)}
              >
                <option value="none">No automatic refunds</option>
                <option value="full">Full refunds for completed payments</option>
              </select>
            </div>

            <Button
              type="button"
              variant="destructive"
              disabled={saving || !dashboard.more.cancellation.canCancel}
              onClick={handleCancelEvent}
            >
              Cancel Event
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default EventDashboard
