import mongoose from 'mongoose'

// runs fn inside a MongoDB transaction and returns what it returns.
// withTransaction retries on transient errors, so fn must only write through the session
export default async function withTransaction(fn) {
  const session = await mongoose.startSession()
  try {
    let result
    await session.withTransaction(async () => {
      result = await fn(session)
    })
    return result
  } finally {
    await session.endSession()
  }
}
