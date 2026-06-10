import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    const { email, role, full_name } = await req.json()

    if (!email || !role || !full_name) {
      return json({ error: 'email, role y full_name son requeridos' }, 400)
    }

    const validRoles = ['admin', 'rs_admin', 'rs_staff']
    if (!validRoles.includes(role)) {
      return json({ error: 'Rol administrativo no válido' }, 400)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'No autorizado' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const siteUrl = Deno.env.get('SITE_URL') ?? ''

    const admin = createClient(supabaseUrl, serviceKey)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Obtener los datos del usuario autenticado
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return json({ error: 'Token inválido o usuario no autenticado' }, 401)
    }

    // Verificar que el invitador es parte del personal administrativo
    const { data: inviter, error: inviterErr } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (inviterErr || !inviter) {
      return json({ error: 'No se pudo verificar el perfil del invitador.' }, 403)
    }

    if (!validRoles.includes(inviter.role)) {
      return json({ error: 'No tienes permiso para invitar personal administrativo.' }, 403)
    }

    // Ver si el usuario ya existe en auth.users
    const { data: userList } = await admin.auth.admin.listUsers()
    const existing = userList?.users?.find((u) => u.email === email.toLowerCase().trim())

    if (existing) {
      // Si el usuario ya existe, actualizamos su perfil
      const { error: profileErr } = await admin.from('profiles').upsert({
        id: existing.id,
        full_name: full_name,
        email: email.toLowerCase().trim(),
        role: role,
        company_id: null, // Los administradores no pertenecen a una empresa
        active: true,
      }, { onConflict: 'id' })

      if (profileErr) {
        return json({ error: 'Error al actualizar el perfil existente: ' + profileErr.message }, 500)
      }

      return json({ ok: true, action: 'linked', email })
    }

    // Usuario nuevo — enviar email de invitacion
    const { data: invited, error: sendErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        role: role,
        full_name: full_name,
      },
      redirectTo: siteUrl + '/set-password',
    })

    if (sendErr || !invited?.user) {
      return json({ error: sendErr?.message ?? 'Error al enviar invitación' }, 500)
    }

    // Crear profile inmediatamente con email y active = true
    const { error: profileErr } = await admin.from('profiles').upsert({
      id: invited.user.id,
      full_name: full_name,
      email: email.toLowerCase().trim(),
      role: role,
      company_id: null,
      active: true,
    }, { onConflict: 'id' })

    if (profileErr) {
      return json({ error: 'Error al crear el perfil: ' + profileErr.message }, 500)
    }

    return json({ ok: true, action: 'invited', email })

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return json({ error: msg }, 500)
  }
})
