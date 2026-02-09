import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarDays, MapPin, Users } from 'lucide-react'

function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <h1 className="text-2xl font-bold tracking-tight">Mehfil</h1>
          <nav className="flex items-center gap-4">
            <Button variant="ghost">Events</Button>
            <Button variant="ghost">About</Button>
            <Button>Sign In</Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="container mx-auto px-4 py-24 text-center">
          <h2 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Your Events, Your Way
          </h2>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Create, manage, and discover events with seamless RSVP tracking,
            payment processing, and location services.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button size="lg">Create Event</Button>
            <Button variant="outline" size="lg">Explore Events</Button>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16">
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CalendarDays className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Event Management</CardTitle>
                <CardDescription>
                  Create and manage events with ease. Set dates, locations, and capacity.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Full control over your event lifecycle from creation to completion.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Users className="h-10 w-10 text-primary mb-2" />
                <CardTitle>RSVP Tracking</CardTitle>
                <CardDescription>
                  Track guest registrations and manage approvals effortlessly.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Real-time attendee tracking with approval workflows.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <MapPin className="h-10 w-10 text-primary mb-2" />
                <CardTitle>Maps Integration</CardTitle>
                <CardDescription>
                  Integrated Google Maps for seamless location services.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Help attendees find your venue with embedded maps and directions.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Mehfil. All rights reserved.
        </div>
      </footer>
    </div>
  )
}

export default Home
