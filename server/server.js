import './config/env.js'
import app from './app.js'
import connectDB from './config/db.js'

const port = process.env.PORT || 5000

const required = ['MONGO_URI', 'JWT_SECRET']
const missing = required.filter((key) => !process.env[key])
if (missing.length) {
  console.error(`Missing env variables: ${missing.join(', ')}. See .env.example`)
  process.exit(1)
}

// a short secret can be brute-forced offline from any token, and then every account is open
if (process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 random characters, see README')
  process.exit(1)
}

try {
  await connectDB(process.env.MONGO_URI)
  app.listen(port, () => console.log(`Server listening on port ${port}`))
} catch (error) {
  console.error('Could not connect to MongoDB', error.message)
  process.exit(1)
}
