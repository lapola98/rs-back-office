import { createClient } from '@supabase/supabase-js'

// Estas variables deben venir de un archivo .env.local
// Asegúrate de crearlo en la raíz de la carpeta 'react'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://doauzsmkoeyvllbmbdda.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvYXV6c21rb2V5dmxsYm1iZGRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjIwNDcsImV4cCI6MjA4ODk5ODA0N30.gytRSeyMQsVAU-I3DowiqkW_Nfpuk8mU5TgrXbkcBQU'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
