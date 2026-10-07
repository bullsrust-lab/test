import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import api, { getErrorMessage } from '../api/client'
import { useOrg } from '../context/OrgContext'
import styles from './Stats.module.css'

const tiles = [
  { key: 'pending', label: 'Waiting for a reply' },
  { key: 'interview', label: 'Interviews' },
  { key: 'declined', label: 'Declined' },
]

const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: 'var(--text-muted)', fontSize: 12 },
}

function Stats() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [chart, setChart] = useState('bar')
  const [reloadKey, setReloadKey] = useState(0)
  const { canWrite } = useOrg()

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    // the stats shape is fixed by the brief, the reply time comes from its own endpoint
    Promise.all([
      api.get('/stats', { signal: controller.signal }),
      api.get('/stats/reply-time', { signal: controller.signal }),
    ])
      .then(([stats, reply]) => setStats({ ...stats.data, replyTime: reply.data.replyTime }))
      .catch((err) => {
        if (!controller.signal.aborted) setError(getErrorMessage(err))
      })
    return () => controller.abort()
  }, [reloadKey])

  if (error) {
    return (
      <>
        <PageHeader title="Stats" />
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </button>
        </div>
      </>
    )
  }
  if (!stats) return <Spinner />

  const { countsByStatus, applicationsPerMonth, topCompanies, replyTime } = stats
  const total = Object.values(countsByStatus).reduce((a, b) => a + b, 0)

  if (total === 0) {
    return (
      <>
        <PageHeader title="Stats" />
        <div className={styles.empty}>
          <h2>No applications yet</h2>
          <p>Stats show up once a few jobs have been added.</p>
          {canWrite && (
            <Link to="/dashboard/add-job" className="btn btn-primary">
              Add a job
            </Link>
          )}
        </div>
      </>
    )
  }

  // "2026-05" -> "May" on the axis, "May 2026" in the tooltip
  const data = applicationsPerMonth.map((m) => ({
    ...m,
    label: dayjs(`${m.month}-01`).format('MMM'),
    full: dayjs(`${m.month}-01`).format('MMMM YYYY'),
  }))
  const Chart = chart === 'bar' ? BarChart : AreaChart

  return (
    <>
      <PageHeader title="Stats" subtitle={`${total} ${total === 1 ? 'application' : 'applications'} in total`} />

      <div className={styles.tiles}>
        {tiles.map(({ key, label }) => (
          <div key={key} className={`${styles.tile} ${styles[key]}`}>
            <span className={`mono ${styles.number}`}>{countsByStatus[key]}</span>
            <span className={styles.label}>{label}</span>
            <span className={styles.share}>
              {total ? Math.round((countsByStatus[key] / total) * 100) : 0}% of all
            </span>
          </div>
        ))}
      </div>

      <p className={styles.replyLine}>
        {replyTime ? (
          <>
            Median time to a reply: <b className="mono">{replyTime.medianDays}</b>{' '}
            {replyTime.medianDays === 1 ? 'day' : 'days'}, across {replyTime.replies}{' '}
            {replyTime.replies === 1 ? 'reply' : 'replies'}.
          </>
        ) : (
          "No reply times yet. They're recorded when you move a job out of pending."
        )}
      </p>

      <section className={styles.chartCard}>
        <div className={styles.chartHead}>
          <h2>Applications per month</h2>
          <div className={styles.switch} role="group" aria-label="Chart type">
            {['bar', 'area'].map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={chart === type}
                className={chart === type ? styles.on : ''}
                onClick={() => setChart(type)}
              >
                {type === 'bar' ? 'Bars' : 'Area'}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.chart}>
          <ResponsiveContainer width="100%" height="100%">
            <Chart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis allowDecimals={false} {...axisProps} />
              <Tooltip
                cursor={{ fill: 'var(--surface-2)' }}
                labelFormatter={(_, payload) => payload?.[0]?.payload.full}
                formatter={(value) => [value, 'Applications']}
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 13,
                }}
              />
              {chart === 'bar' ? (
                <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={44} />
              ) : (
                <Area
                  dataKey="count"
                  type="monotone"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  fill="var(--accent-soft)"
                  fillOpacity={0.7}
                />
              )}
            </Chart>
          </ResponsiveContainer>
        </div>
      </section>

      {topCompanies.length > 0 && (
        <section className={styles.companies}>
          <h2>Most applied to</h2>
          <ol>
            {topCompanies.map(({ company, count }) => (
              <li key={company}>
                <span>{company}</span>
                <span className={`mono ${styles.companyCount}`}>
                  {count} {count === 1 ? 'application' : 'applications'}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  )
}

export default Stats
