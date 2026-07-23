export async function APIStudent(endpoint: string, options: RequestInit = {}) {
  const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
  
  const response = await fetch(`${baseURL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  return response
}
