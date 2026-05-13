import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️ Faltan las variables de entorno de Supabase en el archivo .env (asegúrate de que tengan el prefijo VITE_)')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

