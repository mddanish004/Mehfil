import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import {
  handleCreateEvent,
  handleGetEventByShortId,
  handleUpdateEvent,
  handleDeleteEvent,
  handleGenerateZoomLink,
  handleSearchLocations,
  handleUploadEventPhoto,
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
router.get('/:shortId', handleGetEventByShortId)
router.put('/:shortId', requireAuth, handleUpdateEvent)
router.delete('/:shortId', requireAuth, handleDeleteEvent)

export default router
