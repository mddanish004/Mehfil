import { Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import Home from '@/pages/Home'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import VerifyEmail from '@/pages/VerifyEmail'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import NotFound from '@/pages/NotFound'

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Routes>
        <Route path="/" element={<Home />} />
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
