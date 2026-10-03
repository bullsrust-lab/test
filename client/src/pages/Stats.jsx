import { useEffect, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import api, { getErrorMessage } from '../api/client'
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

  useEffect(() => {
    api
      .get('/jobs/stats')
      .then(({ data }) => setStats(data))
      .catch((err) => setError(getErrorMessage(err)))
  }, [])

  if (error) return <p>{error}</p>
  if (!stats) return <Spinner />

  const { defaultStats, monthlyApplications } = stats
  const total = Object.values(defaultStats).reduce((a, b) => a + b, 0)
  const data = monthlyApplications.map((m) => ({ ...m, month: m.date.split(' ')[0] }))
  const Chart = chart === 'bar' ? BarChart : AreaChart

  return (
    <>
      <PageHeader title="Stats" subtitle={`${total} applications in total`} />

      <div className={styles.tiles}>
        {tiles.map(({ key, label }) => (
          <div key={key} className={`${styles.tile} ${styles[key]}`}>
            <span className={`mono ${styles.number}`}>{defaultStats[key]}</span>
            <span className={styles.label}>{label}</span>
            <span className={styles.share}>
              {total ? Math.round((defaultStats[key] / total) * 100) : 0}% of all
            </span>
          </div>
        ))}
      </div>

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
              <XAxis dataKey="month" {...axisProps} />
              <YAxis allowDecimals={false} {...axisProps} />
              <Tooltip
                cursor={{ fill: 'var(--surface-2)' }}
                labelFormatter={(_, payload) => payload?.[0]?.payload.date}
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
    </>
  )
}

export default Stats
