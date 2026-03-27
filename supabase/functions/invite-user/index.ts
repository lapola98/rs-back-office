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
    const { email, company_id } = await req.json()

    if (!email || !company_id) {
      return json({ error: 'email y company_id son requeridos' }, 400)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'No autorizado' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const siteUrl = Deno.env.get('SITE_URL') ?? ''

    const admin = createClient(supabaseUrl, serviceKey)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // Verificar que es client_owner
    const { data: inviter } = await userClient
      .from('profiles')
      .select('role, company_id')
      .single()

const rsRoles = ['admin', 'rs_admin', 'rs_staff']
const isRS = rsRoles.includes(inviter.role)
const isOwner = inviter.role === 'client_owner' && inviter.company_id === company_id

if (!isRS && !isOwner) {
  return json({ error: 'No tienes permiso para invitar usuarios a esta empresa.' }, 403)
}

    // Validar limite e insertar invitacion
    const { data: inv, error: invErr } = await userClient.rpc('invite_company_user', {
      p_company_id: company_id,
      p_email: email,
      p_role: 'client_user',
    })

    if (invErr || !inv?.ok) {
      return json({ error: inv?.error ?? invErr?.message ?? 'Error al crear invitacion' }, 400)
    }

    const token: string = inv.token

    // Ver si el usuario ya existe
    const { data: userList } = await admin.auth.admin.listUsers()
    const existing = userList?.users?.find((u) => u.email === email.toLowerCase().trim())

    if (existing) {
      await admin.from('profiles').upsert({
        id: existing.id,
        role: 'client_user',
        company_id: company_id,
        active: true,
      }, { onConflict: 'id' })

      await admin
        .from('company_invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('company_id', company_id)
        .eq('email', email.toLowerCase().trim())

      return json({ ok: true, action: 'linked', email })
    }

    // Usuario nuevo — enviar email de invitacion
    const { error: sendErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        role: 'client_user',
        company_id: company_id,
        token: token,
      },
      redirectTo: siteUrl + '/pages/accept-invite.html?token=' + token,
    })

    if (sendErr) {
      return json({ error: sendErr.message }, 500)
    }

    return json({ ok: true, action: 'invited', email })

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return json({ error: msg }, 500)
  }
})