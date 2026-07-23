import { supabase } from './supabase'

export async function signUp(email: string, password: string, name: string, role: 'recruiter' | 'student') {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  })

  if (authError) {
    throw authError
  }

  if (authData.user) {
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({
        user_id: authData.user.id,
        email,
        name,
        role,
      })
      .select()
      .single()

    if (profileError) {
      throw profileError
    }

    return { data: { user: authData.user, profile }, error: null }
  }

  return { data: null, error: new Error('User creation failed') }
}

export async function signIn(email: string, password: string) {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (authError) {
    throw authError
  }

  if (authData.user) {
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', authData.user.id)
      .single()

    if (profileError) {
      throw profileError
    }

    return { data: { user: authData.user, profile }, error: null }
  }

  return { data: null, error: new Error('Sign in failed') }
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  })

  return { data, error }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) {
    throw error
  }
}

export async function fetchUserWithRetry(userId: string, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (profile && !error) {
      return profile
    }

    if (error && !error.message.includes('JSON object requested')) {
      throw error
    }

    // Wait 300ms before retrying
    await new Promise(resolve => setTimeout(resolve, 300))
  }

  throw new Error('Profile not found after maximum retries')
}
