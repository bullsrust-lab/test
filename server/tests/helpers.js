import crypto from 'node:crypto'
import { afterAll, beforeAll, beforeEach, inject } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import app from '../app.js'
import Organization from '../models/Organization.js'
import Membership from '../models/Membership.js'
import Job from '../models/Job.js'
import Invitation from '../models/Invitation.js'
import User from '../models/User.js'

export { app, request }

// call once at the top of a test file: own database on the shared replica set, emptied before each test
export function useDatabase() {
  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-the-check'
    const dbName = `test_${crypto.randomUUID().slice(0, 8)}`
    await mongoose.connect(inject('mongoUri'), { dbName })
    // unique indexes (personalOf, user+org, slug, email) are part of what's being tested
    await Promise.all([User, Organization, Membership, Job, Invitation].map((model) => model.createIndexes()))
  })

  beforeEach(async () => {
    await Promise.all([User, Organization, Membership, Job, Invitation].map((model) => model.deleteMany({})))
  })

  afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  })
}

export const PASSWORD = 'correct-horse-42'

export const newJob = { company: 'Acme', position: 'Frontend Developer', jobLocation: 'Norwich' }

let counter = 0
export async function register(fields = {}) {
  counter += 1
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `User ${counter}`, email: `user${counter}@test.com`, password: PASSWORD, ...fields })
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${res.body.msg}`)
  return { token: res.body.token, user: res.body.user }
}

export const bearer = (token, orgId) => ({
  Authorization: `Bearer ${token}`,
  ...(orgId && { 'X-Org-Id': String(orgId) }),
})

export const personalOrgOf = (userId) => Organization.findOne({ personalOf: userId })

export async function createTeam(token, name = 'Northwind Talent') {
  const res = await request(app).post('/api/v1/orgs').set(bearer(token)).send({ name })
  if (res.status !== 201) throw new Error(`create org failed: ${res.status} ${res.body.msg}`)
  return res.body.organization
}

export async function invite(ownerToken, orgId, email, role = 'recruiter') {
  return request(app).post(`/api/v1/orgs/${orgId}/invitations`).set(bearer(ownerToken)).send({ email, role })
}

// a team with an owner, a recruiter and a viewer, all joined through real invitations
export async function teamWithRoles() {
  const owner = await register({ name: 'Olivia Owner' })
  const recruiter = await register({ name: 'Ravi Recruiter' })
  const viewer = await register({ name: 'Vera Viewer' })
  const org = await createTeam(owner.token)

  for (const [member, role] of [
    [recruiter, 'recruiter'],
    [viewer, 'viewer'],
  ]) {
    const { body } = await invite(owner.token, org._id, member.user.email, role)
    const res = await request(app).post(`/api/v1/invitations/${body.token}/accept`).set(bearer(member.token))
    if (res.status !== 200) throw new Error(`accept failed: ${res.status} ${res.body.msg}`)
  }

  return { owner, recruiter, viewer, org }
}

export const daysAgo = (n) => new Date(Date.now() - n * 864e5)
