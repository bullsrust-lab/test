import styles from './PageHeader.module.css'

function PageHeader({ title, subtitle, children }) {
  return (
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

export default PageHeader
