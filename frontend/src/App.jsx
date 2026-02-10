import { Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import Home from '@/pages/Home'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import VerifyEmail from '@/pages/VerifyEmail'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import NotFound from '@/pages/NotFound'
import ProtectedRoute from '@/components/ProtectedRoute'
import CreateEvent from '@/pages/CreateEvent'
import EditEvent from '@/pages/EditEvent'
import EventDetail from '@/pages/EventDetail'
import EventRegistration from '@/pages/EventRegistration'
import GuestProfile from '@/pages/GuestProfile'

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create-event" element={<ProtectedRoute><CreateEvent /></ProtectedRoute>} />
        <Route path="/events/:shortId" element={<EventDetail />} />
        <Route path="/events/:shortId/register" element={<EventRegistration />} />
        <Route path="/events/:shortId/edit" element={<ProtectedRoute><EditEvent /></ProtectedRoute>} />
        <Route path="/guest/profile" element={<GuestProfile />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </div>
  )
}

export default App
