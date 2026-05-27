import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gmblbltckwipghqutkhw.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtYmxibHRja3dpcGdocXV0a2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMDcxNjEsImV4cCI6MjA5NDg4MzE2MX0.Bri1R1CHV27YKAu_CrwSkb_hZPCBJvOWSlp1UQTXQaI'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)