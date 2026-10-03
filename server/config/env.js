import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

// .env lives in the repo root (next to .env.example), not in server/
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
dotenv.config({ path: path.join(root, '.env'), quiet: true })
