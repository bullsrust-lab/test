// returns a list of problems, empty when the config is fine
export default function checkEnv() {
  const problems = ['MONGO_URI', 'JWT_SECRET'].filter((key) => !process.env[key]).map((key) => `${key} is missing`)

  // a short secret can be brute-forced offline from any token, and then every account is open
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    problems.push('JWT_SECRET must be at least 32 random characters')
  }

  return problems
}
