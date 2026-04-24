// ══════════════════════════════════════════════════════════
// send-message — Supabase Edge Function
// Maneja envío de WhatsApp, SMS y Email para el módulo de cobranza
//
// Variables de entorno requeridas (configurar en Supabase Dashboard):
//   TWILIO_ACCOUNT_SID   — Account SID de Twilio
//   TWILIO_AUTH_TOKEN    — Auth Token de Twilio
//   TWILIO_WHATSAPP_FROM — Número WhatsApp de Twilio ej: whatsapp:+14155238886
//   TWILIO_SMS_FROM      — Número SMS de Twilio ej: +15017122661
//   SENDGRID_API_KEY     — API Key de SendGrid
//   SENDGRID_FROM_EMAIL  — Email remitente verificado ej: cobranza@rshubs.com
//   SENDGRID_FROM_NAME   — Nombre remitente ej: RS Back Office
// ══════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { channel, to, message, subject } = await req.json()

    // Validar parámetros
    if (!channel || !to || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Faltan parámetros: channel, to, message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let result

    if (channel === 'whatsapp') {
      result = await sendWhatsApp(to, message)
    } else if (channel === 'sms') {
      result = await sendSMS(to, message)
    } else if (channel === 'email') {
      result = await sendEmail(to, message, subject || 'Aviso de cobranza — RS Back Office')
    } else {
      return new Response(
        JSON.stringify({ success: false, error: `Canal no soportado: ${channel}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify(result),
      { status: result.success ? 200 : 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[send-message] Error:', err)
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/* ══ WHATSAPP ══ */
async function sendWhatsApp(to: string, message: string) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')
  const from       = Deno.env.get('TWILIO_WHATSAPP_FROM') // whatsapp:+14155238886

  if (!accountSid || !authToken || !from) {
    return { success: false, error: 'Credenciales Twilio WhatsApp no configuradas' }
  }

  // Normalizar número — agregar whatsapp: prefix si no lo tiene
  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${normalizePhone(to)}`

  const body = new URLSearchParams({
    From: from,
    To:   toFormatted,
    Body: message,
  })

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    }
  )

  const data = await response.json()

  if (!response.ok) {
    console.error('[WhatsApp] Error Twilio:', data)
    return {
      success : false,
      error   : data.message || `Error Twilio: ${response.status}`,
      code    : data.code,
    }
  }

  return {
    success   : true,
    message_id: data.sid,
    status    : data.status,
    channel   : 'whatsapp',
  }
}

/* ══ SMS ══ */
async function sendSMS(to: string, message: string) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')
  const from       = Deno.env.get('TWILIO_SMS_FROM')

  if (!accountSid || !authToken || !from) {
    return { success: false, error: 'Credenciales Twilio SMS no configuradas' }
  }

  const body = new URLSearchParams({
    From: from,
    To:   normalizePhone(to),
    Body: message,
  })

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    }
  )

  const data = await response.json()

  if (!response.ok) {
    console.error('[SMS] Error Twilio:', data)
    return {
      success: false,
      error  : data.message || `Error Twilio: ${response.status}`,
      code   : data.code,
    }
  }

  return {
    success   : true,
    message_id: data.sid,
    status    : data.status,
    channel   : 'sms',
  }
}

/* ══ EMAIL (SendGrid) ══ */
async function sendEmail(to: string, message: string, subject: string) {
  const apiKey   = Deno.env.get('SENDGRID_API_KEY')
  const fromEmail= Deno.env.get('SENDGRID_FROM_EMAIL') || 'cobranza@rshubs.com'
  const fromName = Deno.env.get('SENDGRID_FROM_NAME')  || 'RS Back Office'

  if (!apiKey) {
    return { success: false, error: 'SENDGRID_API_KEY no configurada' }
  }

  // Convertir saltos de línea a HTML para el body
  const htmlBody = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: fromEmail, name: fromName },
    subject,
    content: [
      { type: 'text/plain', value: message },
      { type: 'text/html',  value: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333">${htmlBody}</div>` },
    ],
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  // SendGrid devuelve 202 sin body cuando el envío es exitoso
  if (response.status === 202) {
    const messageId = response.headers.get('X-Message-Id') || null
    return {
      success   : true,
      message_id: messageId,
      status    : 'queued',
      channel   : 'email',
    }
  }

  // Si hay error, SendGrid sí devuelve body
  const data = await response.json().catch(() => ({}))
  const errorMsg = data.errors?.[0]?.message || `Error SendGrid: ${response.status}`
  console.error('[Email] Error SendGrid:', data)
  return {
    success: false,
    error  : errorMsg,
  }
}

/* ══ HELPERS ══ */
function normalizePhone(phone: string): string {
  // Quitar espacios, guiones, paréntesis
  let p = phone.replace(/[\s\-\(\)]/g, '')
  // Si no empieza con +, asumir Colombia (+57)
  if (!p.startsWith('+')) {
    // Si empieza con 57 y tiene 12 dígitos total, agregar +
    if (p.startsWith('57') && p.length === 12) {
      p = '+' + p
    } else if (p.length === 10) {
      // Número colombiano sin código de país
      p = '+57' + p
    } else {
      p = '+' + p
    }
  }
  return p
}