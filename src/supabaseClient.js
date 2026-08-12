import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://heuppxbfsgdtuvbbwnyl.supabase.co/'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldXBweGJmc2dkdHV2YmJ3bnlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTM5ODQsImV4cCI6MjEwMTk4OTk4NH0.NNCGu-siX5DX3qutJX_1URoBaeDoJPc7Ro4Vk-fs6Qg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

