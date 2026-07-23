import { supabase } from './supabase'

export async function fetchCurrentUser(userId: string, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (profile && !error) {
      return {
        id: profile.user_id,
        email: profile.email,
        name: profile.name,
        role: profile.role
      }
    }

    if (error && !error.message.includes('JSON object requested')) {
      throw error
    }

    // Wait 300ms before retrying
    await new Promise(resolve => setTimeout(resolve, 300))
  }

  throw new Error('Profile not found after maximum retries')
}
