import { useState } from 'react'
import FormRow from './FormRow'
import FormSelect from './FormSelect'
import { getErrorMessage, getFieldErrors } from '../api/client'
import { useToast } from '../context/ToastContext'
import { EMPTY_JOB, JOB_TYPES, STATUS } from '../utils/constants'
import { focusFirstError } from '../utils/forms'
import styles from './JobForm.module.css'

const validate = (values) => {
  const errors = {}
  if (!values.position.trim()) errors.position = 'Position is required'
  if (!values.company.trim()) errors.company = 'Company is required'
  if (!values.jobLocation.trim()) errors.jobLocation = 'Location is required'
  return errors
}

function JobForm({ initialValues = EMPTY_JOB, submitLabel, onSubmit, onCancel, disabled }) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  const handleChange = (e) => {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
    if (errors[name]) setErrors((err) => ({ ...err, [name]: undefined }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const clientErrors = validate(values)
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors)
      focusFirstError(clientErrors)
      return
    }

    setSubmitting(true)
    try {
      const reset = await onSubmit(values)
      if (reset) setValues(EMPTY_JOB)
    } catch (error) {
      const fields = getFieldErrors(error)
      setErrors(fields)
      focusFirstError(fields)
      toast.error(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <fieldset className={styles.grid} disabled={disabled || submitting}>
        <FormRow
          label="Position"
          name="position"
          value={values.position}
          onChange={handleChange}
          error={errors.position}
          maxLength={100}
          placeholder="Junior Frontend Developer"
          autoFocus
        />
        <FormRow
          label="Company"
          name="company"
          value={values.company}
          onChange={handleChange}
          error={errors.company}
          maxLength={60}
          placeholder="Aviva"
        />
        <FormRow
          label="Location"
          name="jobLocation"
          value={values.jobLocation}
          onChange={handleChange}
          error={errors.jobLocation}
          maxLength={80}
          placeholder="Norwich, UK"
        />
        <FormSelect label="Status" name="status" value={values.status} onChange={handleChange} options={STATUS} />
        <FormSelect label="Job type" name="jobType" value={values.jobType} onChange={handleChange} options={JOB_TYPES} />
      </fieldset>

      <div className={styles.actions}>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={disabled || submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

export default JobForm
