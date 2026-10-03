// Entry point for Vercel: the Express app runs as one serverless function,
// the React build is served by Vercel itself (see vercel.json).
// Locally and on Render the app is started by server/server.js instead.
import app from '../server/app.js'
import connectDB from '../server/config/db.js'
import checkEnv from '../server/config/checkEnv.js'

const problems = checkEnv()

// a warm function instance reuses the connection between requests
let connection

export default async function handler(req, res) {
  if (problems.length) {
    console.error(`Bad config: ${problems.join(', ')}`)
    return res.status(500).json({ msg: 'Server is not configured' })
  }

  try {
    connection ??= connectDB(process.env.MONGO_URI)
    await connection
  } catch (error) {
    connection = undefined
    console.error('Could not connect to MongoDB', error.message)
    return res.status(503).json({ msg: 'Database is not available, try again in a moment' })
  }

  return app(req, res)
}
