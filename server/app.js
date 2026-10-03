import 'express-async-errors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import helmet from 'helmet'
import mongoSanitize from 'express-mongo-sanitize'
import morgan from 'morgan'

import authRoutes from './routes/authRoutes.js'
import jobsRoutes from './routes/jobsRoutes.js'
import userRoutes from './routes/userRoutes.js'
import auth from './middleware/auth.js'
import demoUser from './middleware/demoUser.js'
import notFound from './middleware/notFound.js'
import errorHandler from './middleware/errorHandler.js'
import { apiLimiter } from './middleware/rateLimit.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.resolve(__dirname, '../client/dist')

const app = express()

// Render sits behind a proxy, needed for the rate limiter to see real IPs
app.set('trust proxy', 1)
app.disable('x-powered-by')

if (process.env.NODE_ENV === 'development') app.use(morgan('dev'))

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
      },
    },
  })
)
app.use(express.json({ limit: '10kb' }))
app.use(mongoSanitize())

// health check goes before the limiter, Render calls it all the time
app.get('/api/v1/health', (req, res) => res.json({ status: 'ok' }))

// API answers contain personal data, keep them out of the browser cache
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})
app.use('/api/v1', apiLimiter)

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/users', auth, demoUser, userRoutes)
app.use('/api/v1/jobs', auth, demoUser, jobsRoutes)
app.use('/api', notFound)

if (process.env.NODE_ENV === 'production') {
  // vite puts a content hash in every asset name, so they can be cached for good
  app.use('/assets', express.static(path.join(clientDist, 'assets'), { immutable: true, maxAge: '1y' }))
  app.use(express.static(clientDist))
  // react-router handles the rest, but a missing file like /assets/x.js should still 404
  app.get('*', (req, res, next) => {
    if (path.extname(req.path)) return next()
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.use(notFound)
app.use(errorHandler)

export default app
