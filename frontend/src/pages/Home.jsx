import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutGrid, List, Loader2, LogOut, Plus, Search } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getEvents } from '@/lib/events-api'
import EventCard from '@/components/events/EventCard'

const defaultFilters = {
  search: '',
  location: '',
  startDate: '',
  endDate: '',
  priceType: 'all',
  status: 'published',
  sort: 'date',
}

function getErrorMessage(error) {
  return error?.response?.data?.error?.message || error?.message || 'Something went wrong'
}

function buildQueryParams(filters, page) {
  const params = {
    ...filters,
    page,
  }

  Object.keys(params).forEach((key) => {
    if (params[key] === '' || params[key] === null || params[key] === undefined) {
      delete params[key]
    }
  })

  return params
}

function mergeUniqueEvents(previous, next) {
  const seen = new Set(previous.map((item) => item.id))
  const merged = [...previous]

  for (const event of next) {
    if (seen.has(event.id)) {
      continue
    }
    seen.add(event.id)
    merged.push(event)
  }

  return merged
}

function Home() {
  const { user, loading, logout } = useAuth()
  const [filters, setFilters] = useState(defaultFilters)
  const [activeFilters, setActiveFilters] = useState(defaultFilters)
  const [events, setEvents] = useState([])
  const [myEvents, setMyEvents] = useState(null)
  const [pagination, setPagination] = useState({ page: 1, hasMore: false, total: 0, limit: 20 })
  const [view, setView] = useState('grid')
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const observerRef = useRef(null)
  const sentinelRef = useRef(null)
  const requestRef = useRef(0)
  const fetchingRef = useRef(false)

  const fetchEvents = useCallback(
    async (page, append = false) => {
      if (append && fetchingRef.current) {
        return
      }

      if (append) {
        fetchingRef.current = true
      }
      const requestId = requestRef.current + 1
      requestRef.current = requestId

      if (append) {
        setLoadingMore(true)
      } else {
        setLoadingInitial(true)
      }

      setError('')

      try {
        const data = await getEvents(buildQueryParams(activeFilters, page))
        if (requestRef.current !== requestId) {
          return
        }

        setEvents((previous) => (append ? mergeUniqueEvents(previous, data.events || []) : data.events || []))
        setPagination(data.pagination || { page: 1, hasMore: false, total: 0, limit: 20 })
        setMyEvents(data.myEvents)
      } catch (fetchError) {
        if (requestRef.current === requestId) {
          setError(getErrorMessage(fetchError))
          if (!append) {
            setEvents([])
          }
        }
      } finally {
        if (append) {
          fetchingRef.current = false
        }
        if (requestRef.current === requestId) {
          setLoadingInitial(false)
          setLoadingMore(false)
        }
      }
    },
    [activeFilters]
  )

  useEffect(() => {
    fetchEvents(1, false)
  }, [fetchEvents, user?.id])

  useEffect(() => {
    if (!sentinelRef.current || !pagination.hasMore || loadingInitial || loadingMore) {
      return undefined
    }

    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (!entry.isIntersecting) {
          return
        }

        fetchEvents(pagination.page + 1, true)
      },
      {
        rootMargin: '180px 0px',
      }
    )

    observerRef.current.observe(sentinelRef.current)

    return () => {
      observerRef.current?.disconnect()
    }
  }, [fetchEvents, loadingInitial, loadingMore, pagination.hasMore, pagination.page])

  function handleFilterChange(event) {
    const { name, value } = event.target
    setFilters((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

  function applyFilters(event) {
    event.preventDefault()
    setActiveFilters(filters)
  }

  function clearFilters() {
    setFilters({ ...defaultFilters })
    setActiveFilters({ ...defaultFilters })
  }

  const hostedEvents = myEvents?.hosted || []
  const attendedEvents = myEvents?.attended || []

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="text-2xl font-bold tracking-tight">
            Mehfil
          </Link>
          <nav className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/">Events</Link>
            </Button>
            {user ? (
              <Button variant="outline" asChild>
                <Link to="/create-event">
                  <Plus className="mr-2 h-4 w-4" />
                  Create
                </Link>
              </Button>
            ) : null}
            <Button variant="ghost" asChild>
              <Link to="/guest/profile">My Registrations</Link>
            </Button>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : user ? (
              <>
                <span className="hidden text-sm text-muted-foreground sm:inline">{user.name}</span>
                <Button variant="ghost" size="sm" onClick={logout}>
                  <LogOut className="mr-1 h-4 w-4" />
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link to="/login">Sign In</Link>
                </Button>
                <Button asChild>
                  <Link to="/signup">Sign Up</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="container mx-auto space-y-8 px-4 py-8">
        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Discover Events</h1>
              <p className="text-sm text-muted-foreground">
                Browse what&apos;s happening, filter by your preferences, and keep scrolling to load more.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={view === 'grid' ? 'default' : 'outline'}
                size="sm"
                type="button"
                onClick={() => setView('grid')}
              >
                <LayoutGrid className="mr-2 h-4 w-4" />
                Grid
              </Button>
              <Button
                variant={view === 'list' ? 'default' : 'outline'}
                size="sm"
                type="button"
                onClick={() => setView('list')}
              >
                <List className="mr-2 h-4 w-4" />
                List
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Search and Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={applyFilters} className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Search</span>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        name="search"
                        value={filters.search}
                        onChange={handleFilterChange}
                        placeholder="Event name or description"
                        className="pl-9"
                      />
                    </div>
                  </label>

                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Location</span>
                    <Input
                      name="location"
                      value={filters.location}
                      onChange={handleFilterChange}
                      placeholder="City, venue, or area"
                    />
                  </label>

                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Start Date</span>
                    <Input name="startDate" type="date" value={filters.startDate} onChange={handleFilterChange} />
                  </label>

                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">End Date</span>
                    <Input name="endDate" type="date" value={filters.endDate} onChange={handleFilterChange} />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Price</span>
                    <select
                      name="priceType"
                      value={filters.priceType}
                      onChange={handleFilterChange}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="all">All</option>
                      <option value="free">Free</option>
                      <option value="paid">Paid</option>
                    </select>
                  </label>

                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <select
                      name="status"
                      value={filters.status}
                      onChange={handleFilterChange}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="published">Published</option>
                      <option value="draft">Draft</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="all">All</option>
                    </select>
                  </label>

                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">Sort By</span>
                    <select
                      name="sort"
                      value={filters.sort}
                      onChange={handleFilterChange}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="date">Date</option>
                      <option value="popularity">Popularity</option>
                      <option value="newest">Newest</option>
                    </select>
                  </label>

                  <div className="flex items-end gap-2">
                    <Button type="submit" className="w-full">Apply</Button>
                    <Button type="button" variant="outline" className="w-full" onClick={clearFilters}>
                      Reset
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </section>

        {user ? (
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">My Events</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Hosted</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {hostedEvents.length ? (
                    hostedEvents.map((event) => <EventCard key={`hosted-${event.id}`} event={event} view="list" />)
                  ) : (
                    <p className="text-sm text-muted-foreground">No hosted events yet.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Attended</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {attendedEvents.length ? (
                    attendedEvents.map((event) => <EventCard key={`attended-${event.id}`} event={event} view="list" />)
                  ) : (
                    <p className="text-sm text-muted-foreground">No attended events yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">All Events</h2>
            <p className="text-sm text-muted-foreground">{pagination.total || 0} total</p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {loadingInitial ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : events.length ? (
            <>
              <div className={view === 'grid' ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-3' : 'space-y-4'}>
                {events.map((event) => (
                  <EventCard key={event.id} event={event} view={view} />
                ))}
              </div>

              <div ref={sentinelRef} className="flex h-14 items-center justify-center">
                {loadingMore ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : pagination.hasMore ? (
                  <span className="text-sm text-muted-foreground">Scroll for more</span>
                ) : (
                  <span className="text-sm text-muted-foreground">No more events</span>
                )}
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No events found with the current filters.
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  )
}

export default Home
