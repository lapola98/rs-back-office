import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const { onboarding_id } = await req.json()

    if (!onboarding_id) {
      return new Response(
        JSON.stringify({ error: 'onboarding_id requerido' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Leer onboarding
    const { data: ob, error: obErr } = await admin
      .from('client_onboardings')
      .select('id, rep_email, rep_name, company_id, company_name, status')
      .eq('id', onboarding_id)
      .single()

    if (obErr || !ob) {
      return new Response(
        JSON.stringify({ error: 'Onboarding no encontrado' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (ob.status !== 'approved') {
      return new Response(
        JSON.stringify({ error: 'El onboarding no está aprobado' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!ob.company_id) {
      return new Response(
        JSON.stringify({ error: 'Sin company_id — el trigger aún no corrió' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 2. ¿Ya existe el usuario en auth?
    const { data: userList } = await admin.auth.admin.listUsers()
    const existing = userList?.users?.find(u => u.email === ob.rep_email)

    if (existing) {
      // Solo actualizar profile
      await admin.from('profiles').upsert({
        id:         existing.id,
        full_name:  ob.rep_name,
        role:       'client_owner',
        company_id: ob.company_id,
        active:     true,
      }, { onConflict: 'id' })

      await admin.from('companies')
        .update({ owner_id: existing.id })
        .eq('id', ob.company_id)

      return new Response(
        JSON.stringify({ ok: true, action: 'profile_updated', email: ob.rep_email }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 3. Invitar usuario nuevo — Supabase envía el email
    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(
      ob.rep_email,
      {
        data: {
          full_name:  ob.rep_name,
          role:       'client_owner',
          company_id: ob.company_id,
        },
        redirectTo: Deno.env.get('SITE_URL') + '/pages/login.html',
      }
    )

    if (invErr) {
      return new Response(
        JSON.stringify({ error: invErr.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 4.