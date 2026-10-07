import Organization from '../models/Organization.js'
import Membership from '../models/Membership.js'

export const PERSONAL_ORG_NAME = 'Personal'

const isDuplicateKey = (error) => error?.code === 11000

export const slugify = (name) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '') || 'team'

// "Acme" -> acme, then acme-2, acme-3... The unique index has the final say, the lookup just
// avoids hammering it with known collisions.
const freeSlug = async (base) => {
  const pattern = new RegExp(`^${base}(-\\d+)?$`)
  const taken = new Set((await Organization.find({ slug: pattern }).select('slug').lean()).map((o) => o.slug))
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) {
    if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
  }
}

// Makes sure the user has a Personal workspace and owns it. Safe to call any number of times and
// from several places at once (registration, the migration, the org middleware): both writes are
// upserts guarded by unique indexes.
export async function ensurePersonalOrg(userId, { session } = {}) {
  let created = false
  let organization

  try {
    const result = await Organization.findOneAndUpdate(
      { personalOf: userId },
      { $setOnInsert: { name: PERSONAL_ORG_NAME, slug: `personal-${userId}`, personalOf: userId } },
      { upsert: true, returnDocument: 'after', includeResultMetadata: true, session }
    )
    organization = result.value
    created = !result.lastErrorObject?.updatedExisting
  } catch (error) {
    // two upserts raced and the other one won, its document is the one we want
    if (!isDuplicateKey(error) || session) throw error
    organization = await Organization.findOne({ personalOf: userId })
  }

  try {
    await Membership.updateOne(
      { user: userId, organization: organization._id },
      { $setOnInsert: { role: 'owner' } },
      { upsert: true, session }
    )
  } catch (error) {
    if (!isDuplicateKey(error) || session) throw error
  }

  return { organization, created }
}

// a team workspace, the creator becomes its first owner
export async function createOrganization(name, ownerId) {
  const base = slugify(name)

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = await freeSlug(base)
    try {
      const organization = await Organization.create({ name, slug })
      try {
        const membership = await Membership.create({ user: ownerId, organization: organization._id, role: 'owner' })
        return { organization, membership }
      } catch (error) {
        // never leave an org nobody can reach
        await Organization.deleteOne({ _id: organization._id })
        throw error
      }
    } catch (error) {
      // someone took the same slug between the lookup and the insert, try the next one
      if (!isDuplicateKey(error) || !error.keyPattern?.slug) throw error
    }
  }
  throw new Error('Could not find a free slug for this organization')
}
