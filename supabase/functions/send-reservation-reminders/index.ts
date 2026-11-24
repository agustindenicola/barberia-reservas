const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Reservation = {
  id: string;
  service_name: string;
  date: string;
  time: string;
  duration: number;
  name: string;
  email: string;
  phone: string;
  note?: string;
  manage_token?: string;
};

const BUSINESS_UTC_OFFSET = "-03:00";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESERVATION_FROM_EMAIL") || "Reservas <onboarding@resend.dev>";

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return json({ error: "Missing required environment variables" }, 500);
  }

  try {
    const now = new Date();
    const targetMinutes = Number(Deno.env.get("REMINDER_TARGET_MINUTES") || 180);
    const windowMinutes = Number(Deno.env.get("REMINDER_WINDOW_MINUTES") || 10);
    const dueStart = new Date(now.getTime() + (targetMinutes - windowMinutes) * 60_000);
    const dueEnd = new Date(now.getTime() + (targetMinutes + windowMinutes) * 60_000);
    const reservations = await loadPendingReservations(supabaseUrl, serviceRoleKey, now);
    const dueReservations = reservations.filter((reservation) => {
      const startsAt = reservationDateTime(reservation);
      return startsAt >= dueStart && startsAt <= dueEnd;
    });

    const results = [];

    for (const reservation of dueReservations) {
      const emailResponse = await sendReminderEmail({
        apiKey: resendApiKey,
        from: fromEmail,
        reservation,
      });

      if (!emailResponse.ok) {
        results.push({
          id: reservation.id,
          ok: false,
          details: await emailResponse.text(),
        });
        continue;
      }

      await markReminderSent(supabaseUrl, serviceRoleKey, reservation.id);
      results.push({ id: reservation.id, ok: true });
    }

    return json({
      ok: results.every((item) => item.ok),
      checked: reservations.length,
      sent: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results,
    });
  } catch (error) {
    console.error(error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

async function loadPendingReservations(supabaseUrl: string, serviceRoleKey: string, now: Date) {
  const today = toBusinessDate(now);
  const tomorrow = toBusinessDate(new Date(now.getTime() + 24 * 60 * 60_000));
  const url = new URL(`${supabaseUrl}/rest/v1/reservations`);
  url.searchParams.set("select", "id,service_name,date,time,duration,name,email,phone,note,manage_token");
  url.searchParams.set("status", "eq.confirmed");
  url.searchParams.set("reminder_sent_at", "is.null");
  url.searchParams.append("date", `gte.${today}`);
  url.searchParams.append("date", `lte.${tomorrow}`);

  const response = await fetch(url, {
    headers: restHeaders(serviceRoleKey),
  });

  if (!response.ok) {
    throw new Error(`Could not load reservations: ${await response.text()}`);
  }

  return await response.json() as Reservation[];
}

async function markReminderSent(supabaseUrl: string, serviceRoleKey: string, reservationId: string) {
  const url = new URL(`${supabaseUrl}/rest/v1/reservations`);
  url.searchParams.set("id", `eq.${reservationId}`);

  const response = await fetch(url, {
    method: "PATCH",
    headers: restHeaders(serviceRoleKey),
    body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }),
  });

  if (!response.ok) {
    throw new Error(`Could not mark reminder sent: ${await response.text()}`);
  }
}

function sendReminderEmail(params: { apiKey: string; from: string; reservation: Reservation }) {
  const text = [
    `Hola ${params.reservation.name},`,
    "",
    "Te recordamos que tu turno en Barbería Mariano Martínez es en 3 horas.",
    "",
    `Servicio: ${params.reservation.service_name}`,
    `Fecha: ${params.reservation.date}`,
    `Hora: ${stripSeconds(params.reservation.time)}`,
    `Duracion: ${params.reservation.duration} min`,
    "",
    "Si necesitás modificar o cancelar el turno, usá el link privado que recibiste en la confirmación.",
  ].join("\n");

  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: params.reservation.email,
      subject: "Recordatorio: tu turno es en 3 horas",
      text,
    }),
  });
}

function restHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function reservationDateTime(reservation: Reservation) {
  return new Date(`${reservation.date}T${stripSeconds(reservation.time)}:00${BUSINESS_UTC_OFFSET}`);
}

function toBusinessDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function stripSeconds(value: string) {
  return String(value || "").slice(0, 5);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
