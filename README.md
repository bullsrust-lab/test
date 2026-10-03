# JobTrail

A small job application tracker built with MongoDB, Express, React and Node. You log every job you apply to, move it between `pending`, `interview` and `declined`, and search/filter the list later.

Built as a test task for a junior MERN position.

**Live:** LIVE_URL
**Demo:** click "Look around with a demo account" on the login page (read-only, ~75 sample jobs).

> The app runs on Render's free plan, so the first request after a while can take up to a minute while the server wakes up.

![All jobs page with the follow-up panel](docs/jobs-light.png)

<details>
<summary>More screenshots</summary>

![Applications with no reply for a month](docs/ghosted-light.png)
![Dark theme](docs/jobs-dark.png)
![Stats](docs/stats-light.png)
![Landing](docs/landing-light.png)
<img src="docs/jobs-mobile.png" width="320" alt="Mobile" />

</details>

## What's in it

Required by the task:

- Register / login with JWT (bcryptjs for passwords, token returned in the response body, expires in 1 day)
- Jobs CRUD, only the owner can edit or delete a job (403 otherwise)
- Filtering by status and job type, search by position, sorting, pagination
- React + Vite frontend with react-router v6, protected `/dashboard/*` routes and a nested layout
- Axios instance with a request interceptor for the token and a response interceptor that logs out on 401

Things I added on top:

- **Follow-up reminders.** A job that has been quiet for 10+ days (no status change, no follow-up) shows up in a "Gone quiet" panel above the list, with a short check-in email ready to copy. "Followed up" resets the timer. Pending jobs with no answer for 30+ days get an aged card and a "no reply" stamp. The server records when a job first left `pending` (a pre-save hook), which also gives the median time to a reply on the Stats page.
- Input validation on the server (express-validator) and in the forms, errors shown next to the field
- helmet, rate limiting on `/auth`, `express-mongo-sanitize`, 10kb body limit
- Read-only demo account + seed script
- Stats page with counts per status and applications per month
- Filters and page live in the URL, so refresh and the back button keep them
- Edit profile (name/email), dark theme, responsive layout down to ~360px
- API tests (Vitest + Supertest + in-memory MongoDB) and a GitHub Actions workflow

## Stack

**Server:** Node 22, Express 4, Mongoose 9, jsonwebtoken, bcryptjs, express-async-errors, express-validator
**Client:** React 19, Vite, react-router-dom 6, axios, recharts, dayjs. Plain CSS Modules, no UI library.

## Running locally

You need Node 22.12+ and a MongoDB connection string (a free Atlas cluster works).

```bash
git clone https://github.com/bullsrust-lab/test.git jobtrail
cd jobtrail
npm install
cp .env.example .env    # then fill in the values
npm run dev
```

`npm run dev` starts both apps with `concurrently`:

- API on http://localhost:5000
- React on http://localhost:5173 (Vite proxies `/api` to the API, using the same `PORT` from `.env`)

If port 5000 is taken (on macOS the AirPlay Receiver uses it), set another `PORT` in `.env`.

To get the demo account with sample data:

```bash
npm run seed
```

### Environment variables

The `.env` file goes in the project root.

| Variable        | Description                                             | Example                    |
| --------------- | ------------------------------------------------------- | -------------------------- |
| `PORT`          | API port                                                | `5000`                     |
| `NODE_ENV`      | `development` or `production`                           | `development`              |
| `MONGO_URI`     | MongoDB connection string                               | `mongodb+srv://...`        |
| `JWT_SECRET`    | Secret used to sign tokens, make it long and random     |                            |
| `JWT_LIFETIME`  | Token lifetime                                          | `1d`                       |
| `DEMO_EMAIL`    | Email of the demo user created by `npm run seed`        | `demo@jobtrail.dev`        |
| `DEMO_PASSWORD` | Password for the demo user (nobody needs to know it)    |                            |

A quick way to generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Scripts

| Command         | What it does                                     |
| --------------- | ------------------------------------------------ |
| `npm run dev`   | API + client in watch mode                       |
| `npm run build` | Builds the client into `client/dist`             |
| `npm start`     | Runs the API, which also serves `client/dist` when `NODE_ENV=production` |
| `npm run seed`  | Creates the demo user and 75 sample jobs for it (only the demo user's jobs are replaced) |
| `npm test`      | API tests on an in-memory MongoDB, no `.env` needed. The first run downloads a MongoDB binary, so it takes a bit |
| `npm run lint`  | oxlint over client and server                    |

## Project structure

```
client/
  src/
    api/          axios instance and interceptors
    components/   JobCard, JobForm, filters, pagination, modal...
    context/      auth, theme and toast providers
    layouts/      dashboard layout (sidebar + top bar)
    pages/        one file per route
    routes/       ProtectedRoute
    utils/        follow-up rule, storage helpers, constants
server/
  config/       .env loading (the file is in the repo root) and DB connection
  controllers/  route handlers
  errors/       error classes with status codes
  middleware/   auth, validation, demo user, errors
  models/       User, Job
  routes/
  utils/        query building, follow-up rule, demo refresh
  seed/         demo data
  tests/
```

## API

All routes are under `/api/v1`. Errors always come back as `{ "msg": "..." }`; validation errors also include an `errors` array with the field names.

| Method | Path              | Auth | Notes                                   |
| ------ | ----------------- | ---- | --------------------------------------- |
| POST   | `/auth/register`  | no   | `{ name, email, password }` → 201 `{ user, token }` |
| POST   | `/auth/login`     | no   | `{ email, password }` → `{ user, token }` |
| POST   | `/auth/demo`      | no   | logs in as the demo user                |
| GET    | `/users/me`       | yes  | current user                            |
| PATCH  | `/users/me`       | yes  | `{ name, email }`, returns a new token  |
| GET    | `/jobs`           | yes  | see query params below                  |
| POST   | `/jobs`           | yes  | 201                                     |
| GET    | `/jobs/stats`     | yes  | counts per status, last 6 months, median days to a reply |
| GET    | `/jobs/follow-ups` | yes  | jobs quiet for 10-30 days + count of 30+ day ones |
| GET    | `/jobs/:id`       | yes  | owner only                              |
| PATCH  | `/jobs/:id`       | yes  | owner only                              |
| DELETE | `/jobs/:id`       | yes  | owner only                              |
| POST   | `/jobs/:id/follow-up` | yes | owner only, resets the follow-up timer |
| GET    | `/health`         | no   | used by Render's health check           |

`GET /jobs` query params: `status` (`all`, `pending`, `interview`, `declined`), `jobType` (`all`, `full-time`, `part-time`, `remote`), `sort` (`latest`, `oldest`, `a-z`, `z-a`), `search`, `page` (default 1), `limit` (default 10, max 50).

```json
{ "jobs": [], "totalJobs": 42, "numOfPages": 5 }
```

Status codes: 200, 201, 400 (validation, bad id), 401 (no/invalid token, wrong credentials), 403 (someone else's job, demo user writes), 404, 413 (body over 10 kB), 429 (too many failed auth attempts).

## Deploying to Render

One Web Service serves both the API and the built React app, so there's no CORS setup. There's a `render.yaml` in the repo, so the easiest way is New → Blueprint and point it at the repo. Render generates `JWT_SECRET` itself and only asks for `MONGO_URI`.

Or set it up by hand:

- Build command: `npm ci --include=dev && npm run build` (dev deps are needed for the Vite build)
- Start command: `npm start`
- Health check path: `/api/v1/health`
- Environment: the variables above with `NODE_ENV=production` (Render sets `PORT` itself), plus `MONGOMS_DISABLE_POSTINSTALL=1` so the test-only in-memory MongoDB isn't downloaded on every build

In Atlas, Network Access has to allow `0.0.0.0/0` because Render's outbound IPs aren't fixed on the free plan.

The demo account needs data: run `npm run seed` once locally with `MONGO_URI` in `.env` set to the same database Render uses. Without it the demo button answers 404. After that the demo keeps itself fresh: on demo login the sample dates are moved forward (at most every 12 hours), so the follow-up panel always has something to show.

## Notes

- The token lives in `localStorage` because the task asks for it in the response body. It's the simple option but readable by any script on the page, so for a real app I'd move to an httpOnly cookie with a short-lived access token and a refresh token.
- No end-to-end tests yet. The API is covered, the UI I tested by hand. Next step would be a few Playwright tests for login → add → edit → delete.
- Search uses a case-insensitive regex on `position`. Fine for a personal list, but with a lot of data a text index would be better.
- The demo account is shared, so it's read-only on the server, not just hidden buttons in the UI.
- The follow-up thresholds (10 and 30 days) are constants on both sides. With more time they'd be a user setting, and the reminder could be an email instead of a panel you have to open.
