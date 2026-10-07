import { Router } from 'express'
import { getReplyTime, getStats } from '../controllers/statsController.js'

const router = Router()

router.get('/', getStats)
router.get('/reply-time', getReplyTime)

export default router
