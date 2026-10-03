import { useEffect, useRef, useState } from 'react'
import FormSelect from './FormSelect'
import { IconSearch } from './Icons'
import { JOB_TYPES, SORT_OPTIONS, STATUS } from '../utils/constants'
import formStyles from './Form.module.css'
import styles from './JobsFilters.module.css'

function JobsFilters({ values, onChange, onReset }) {
  const [search, setSearch] = useState(values.search)
  const [prevSearch, setPrevSearch] = useState(values.search)
  const timer = useRef()

  // the URL value can change from outside (Reset, back button), keep the input in sync
  if (values.search !== prevSearch) {
    setPrevSearch(values.search)
    setSearch(values.search)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  const handleSearch = (e) => {
    const { value } = e.target
    setSearch(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange('search', value.trim()), 400)
  }

  const select = (e) => onChange(e.target.name, e.target.value)

  return (
    <form className={styles.filters} role="search" onSubmit={(e) => e.preventDefault()}>
      <div className={`${formStyles.row} ${styles.search}`}>
        <label htmlFor="search" className={formStyles.label}>
          Search position
        </label>
        <div className={styles.searchBox}>
          <IconSearch size={16} />
          <input
            id="search"
            type="search"
            className={formStyles.input}
            placeholder="e.g. frontend"
            value={search}
            onChange={handleSearch}
            maxLength={100}
          />
        </div>
      </div>
      <FormSelect label="Status" name="status" value={values.status} onChange={select} options={['all', ...STATUS]} />
      <FormSelect label="Job type" name="jobType" value={values.jobType} onChange={select} options={['all', ...JOB_TYPES]} />
      <FormSelect label="Sort" name="sort" value={values.sort} onChange={select} options={SORT_OPTIONS} />
      <button
        type="button"
        className={`btn btn-ghost ${styles.reset}`}
        onClick={() => {
          clearTimeout(timer.current)
          onReset()
        }}
      >
        Reset
      </button>
    </form>
  )
}

export default JobsFilters
