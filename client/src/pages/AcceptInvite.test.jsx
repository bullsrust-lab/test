import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import api from '../api/client'
import { AuthProvider } from '../context/AuthContext'
import { OrgProvider } from '../context/OrgContext'
import { ToastProvider } from '../context/ToastContext'
import AcceptInvite from './AcceptInvite'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, default: { get: vi.fn(), post: vi.fn() } }
})

const TOKEN = 'a'.repeat(43)
const ORG = { _id: 'org1', name: 'Northwind Talent', slug: 'northwind-talent' }
const preview = (overrides = {}) => ({
  data: {
    invitation: {
      email: 'mei@test.com',
      role: 'recruiter',
      expiresAt: '2026-10-14T12:00:00.000Z',
      organization: ORG,
      invitedBy: 'Olivia',
    },
    hasAccount: false,
    ...overrides,
  },
})
const httpError = (status, msg) => Object.assign(new Error(msg), { response: { status, data: { msg } } })

// the page reads the invitation, the org provider reads /orgs once someone is signed in
const mockGet = (invitationResponse) =>
  api.get.mockImplementation((url) => {
    if (url.startsWith('/invitations/')) return invitationResponse
    if (url === '/orgs') return Promise.resolve({ data: { organizations: [] } })
    return Promise.reject(new Error(`unexpected GET ${url}`))
  })

const signIn = (email) => {
  localStorage.setItem('token', 'session-token')
  localStorage.setItem('user', JSON.stringify({ _id: 'u1', name: 'Someone', email }))
}

const renderPage = () =>
  render(
    <AuthProvider>
      <OrgProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/invite/${TOKEN}`]}>
            <Routes>
              <Route path="/invite/:token" element={<AcceptInvite />} />
              <Route path="/dashboard/all-jobs" element={<p>Dashboard</p>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </OrgProvider>
    </AuthProvider>
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AcceptInvite', () => {
  it('lets someone without an account set a password and join', async () => {
    const user = userEvent.setup()
    mockGet(Promise.resolve(preview()))
    api.post.mockResolvedValue({
      data: { user: { _id: 'u2', name: 'mei', email: 'mei@test.com' }, token: 'new-token', organization: ORG, role: 'recruiter' },
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: /join northwind talent/i })).toBeInTheDocument()
    expect(screen.getByText(/olivia invited you/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('mei@test.com')

    // too short: caught before any request
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: /create account and join/i }))
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Password'), '-and-long-now')
    await user.type(screen.getByLabelText('Name (optional)'), 'Mei Chen')
    await user.click(screen.getByRole('button', { name: /create account and join/i }))

    expect(api.post).toHaveBeenCalledWith(`/invitations/${TOKEN}/accept`, { password: 'short-and-long-now', name: 'Mei Chen' })
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(localStorage.getItem('token')).toBe('new-token')
    expect(localStorage.getItem('orgId')).toBe('org1')
  })

  it('asks an existing user to log in, then accepts with the new session', async () => {
    const user = userEvent.setup()
    mockGet(Promise.resolve(preview({ hasAccount: true })))
    api.post.mockImplementation((url) =>
      url === '/auth/login'
        ? Promise.resolve({ data: { user: { _id: 'u3', name: 'Mei', email: 'mei@test.com' }, token: 'login-token' } })
        : Promise.resolve({ data: { organization: ORG, role: 'recruiter' } })
    )
    renderPage()

    await user.type(await screen.findByLabelText('Password'), 'correct-horse-42')
    await user.click(screen.getByRole('button', { name: /log in and join/i }))

    expect(api.post).toHaveBeenNthCalledWith(1, '/auth/login', { email: 'mei@test.com', password: 'correct-horse-42' })
    expect(api.post).toHaveBeenNthCalledWith(2, `/invitations/${TOKEN}/accept`, {}, {
      headers: { Authorization: 'Bearer login-token' },
    })
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })

  it('switches to the login form when the server says the account exists (409)', async () => {
    const user = userEvent.setup()
    mockGet(Promise.resolve(preview()))
    api.post.mockRejectedValue(httpError(409, 'An account with this email already exists'))
    renderPage()

    await user.type(await screen.findByLabelText('Password'), 'correct-horse-42')
    await user.click(screen.getByRole('button', { name: /create account and join/i }))

    expect(await screen.findByRole('button', { name: /log in and join/i })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/already an account/i)
  })

  it('explains an expired or used link instead of showing a form', async () => {
    mockGet(Promise.reject(httpError(410, 'This invitation has expired')))
    renderPage()

    expect(await screen.findByRole('heading', { name: /can't be used/i })).toBeInTheDocument()
    expect(screen.getByText(/this invitation has expired/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  it('warns when signed in as someone else and offers to log out', async () => {
    const user = userEvent.setup()
    signIn('ravi@test.com')
    mockGet(Promise.resolve(preview()))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(/signed in as ravi@test.com/i)
    expect(screen.queryByRole('button', { name: /^join/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /log out and continue/i }))
    expect(await screen.findByRole('button', { name: /create account and join/i })).toBeInTheDocument()
  })

  it('joins in one click when signed in with the invited email', async () => {
    const user = userEvent.setup()
    signIn('mei@test.com')
    mockGet(Promise.resolve(preview({ hasAccount: true })))
    api.post.mockResolvedValue({ data: { organization: ORG, role: 'recruiter' } })
    renderPage()

    await user.click(await screen.findByRole('button', { name: /join northwind talent/i }))
    expect(api.post).toHaveBeenCalledWith(`/invitations/${TOKEN}/accept`)
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })
})
