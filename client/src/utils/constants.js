export const STATUS = ['pending', 'interview', 'declined']
export const JOB_TYPES = ['full-time', 'part-time', 'remote']

export const SORT_OPTIONS = [
  { value: 'latest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'a-z', label: 'Position A–Z' },
  { value: 'z-a', label: 'Position Z–A' },
]

export const PAGE_SIZE = 10

export const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

export const EMPTY_JOB = {
  position: '',
  company: '',
  jobLocation: '',
  status: 'pending',
  jobType: 'full-time',
}
