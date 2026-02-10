import { Router } from 'express'
import multer from 'multer'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import {
  handleCreateEvent,
  handleGetEventByShortId,
  handleUpdateEvent,
  handleDeleteEvent,
  handleListEvents,
  handleGenerateZoomLink,
  handleSearchLocations,
  handleUploadEventPhoto,
  handleRegisterForEvent,
  handleApproveRegistration,
  handleRejectRegistration,
  handleGetEventDashboard,
  handleEventCheckinStream,
  handleGetEventHosts,
  handleAddEventHost,
  handleRemoveEventHost,
  handleInviteGuests,
  handleGetEventBlast,
  handleCreateEventBlast,
} from '../controllers/event.controller.js'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
})

router.get('/location/search', requireAuth, handleSearchLocations)
router.post('/zoom-link', requireAuth, handleGenerateZoomLink)
router.post('/upload-photo', requireAuth, upload.single('image'), handleUploadEventPhoto)

router.post('/', requireAuth, handleCreateEvent)
router.get('/', optionalAuth, handleListEvents)
router.post('/:shortId/register', optionalAuth, handleRegisterForEvent)
router.get('/:shortId/dashboard', requireAuth, handleGetEventDashboard)
router.get('/:shortId/checkin-stream', requireAuth, handleEventCheckinStream)
router.get('/:shortId/hosts', requireAuth, handleGetEventHosts)
router.post('/:shortId/hosts', requireAuth, handleAddEventHost)
router.delete('/:shortId/hosts', requireAuth, handleRemoveEventHost)
router.post('/:shortId/invite', requireAuth, handleInviteGuests)
router.get('/:shortId/blast', requireAuth, handleGetEventBlast)
router.post('/:shortId/blast', requireAuth, handleCreateEventBlast)
router.get('/:shortId', optionalAuth, handleGetEventByShortId)
router.put('/:shortId', requireAuth, handleUpdateEvent)
router.delete('/:shortId', requireAuth, handleDeleteEvent)
router.put('/registrations/:registrationId/approve', requireAuth, handleApproveRegistration)
router.put('/registrations/:registrationId/reject', requireAuth, handleRejectRegistration)

export default router
