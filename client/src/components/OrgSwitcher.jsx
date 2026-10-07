import { useLocation, useNavigate } from 'react-router-dom'
import { useOrg } from '../context/OrgContext'
import styles from './OrgSwitcher.module.css'

const ROLE_NOTE = {
  owner: 'Owner',
  recruiter: 'Recruiter',
  viewer: 'Viewer · read only',
}

function OrgSwitcher() {
  const { orgs, active, switchOrg } = useOrg()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  if (!active) return null

  const change = (e) => {
    switchOrg(e.target.value)
    // an open job belongs to the workspace we just left
    if (pathname.includes('/edit-job/')) navigate('/dashboard/all-jobs')
  }

  return (
    <div className={styles.switcher}>
      <label htmlFor="org-switcher" className={styles.label}>
        Workspace
      </label>
      <select id="org-switcher" className={styles.select} value={active._id} onChange={change}>
        {orgs.map((org) => (
          <option key={org._id} value={org._id}>
            {org.personal ? 'Personal' : org.name}
          </option>
        ))}
      </select>
      <p className={`${styles.role} ${styles[active.role]}`}>{active.personal ? 'Only you' : ROLE_NOTE[active.role]}</p>
    </div>
  )
}

export default OrgSwitcher
