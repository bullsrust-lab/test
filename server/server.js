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

try {
  await connectDB(process.env.MONGO_URI)
  app.listen(port, () => console.log(`Server listening on port ${port}`))
} catch (error) {
  console.error('Could not connect to MongoDB', error.message)
  process.exit(1)
}
