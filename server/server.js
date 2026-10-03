import './config/env.js'
import app from './app.js'
import connectDB from './config/db.js'
import checkEnv from './config/checkEnv.js'

const port = process.env.PORT || 5000

const problems = checkEnv()
if (problems.length) {
  console.error(`Bad config: ${problems.join(', ')}. See .env.example`)
  process.exit(1)
}

try {
  await connectDB(process.env.MONGO_URI)
  app.listen(port, () => console.log(`Server listening on port ${port}`))
} catch (error) {
  console.error('Could not connect to MongoDB', error.message)
  process.exit(1)
}
