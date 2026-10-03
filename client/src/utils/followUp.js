import dayjs from 'dayjs'

// same rule as server/utils/followUp.js
export const FOLLOW_UP_AFTER = 10
export const GHOSTED_AFTER = 30

const DAY = 24 * 60 * 60 * 1000

// the follow-ups endpoint already sends quietSince, list items have the raw dates
export const quietSince = (job) => {
  if (job.quietSince) return new Date(job.quietSince).getTime()
  const dates = [job.createdAt, job.statusChangedAt, job.followedUpAt].filter(Boolean)
  return Math.max(...dates.map((d) => new Date(d).getTime()))
}

export const quietDays = (job, now = Date.now()) => Math.floor((now - quietSince(job)) / DAY)

// null when there's nothing to say about the job
export const followUpState = (job, now = Date.now()) => {
  if (job.status === 'declined') return null
  const days = quietDays(job, now)
  if (days < FOLLOW_UP_AFTER) return null
  if (days < GHOSTED_AFTER) return { level: 'due', days }
  return job.status === 'pending' ? { level: 'ghosted', days } : null
}

export const followUpEmail = (job, name) => {
  const { position, company, createdAt, status } = job
  const signature = name ? `\n\nThanks,\n${name}` : '\n\nThanks'

  if (status === 'interview') {
    return (
      `Subject: ${position} - following up\n\n` +
      `Hi,\n\nThanks again for taking the time to talk to me about the ${position} role at ${company}. ` +
      `Is there any update on the next steps?` +
      signature
    )
  }

  return (
    `Subject: ${position} application\n\n` +
    `Hi,\n\nI applied for the ${position} role at ${company} on ${dayjs(createdAt).format('D MMMM')} ` +
    `and wanted to check whether it's still open. Happy to send anything else you need.` +
    signature
  )
}
