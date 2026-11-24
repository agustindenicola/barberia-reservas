const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ReservationEmailPayload = {
  barberEmail: string;
  action?: "confirmed" | "updated" | "cancelled";
  manageUrl?: string;
  calendarUrl?: string;
  reservation: {
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
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESERVATION_FROM_EMAIL") || "Reservas <onboarding@resend.dev>";

  if (!resendApiKey) {
    return json({ error: "Missing RESEND_API_KEY" }, 500);
  }

  const payload = (await req.json()) as ReservationEmailPayload;
  const { barberEmail, reservation } = payload;
  const action = payload.action || "confirmed";
  const manageUrl = payload.manageUrl || "";
  const calendarUrl = payload.calendarUrl || "";

  if (!barberEmail || !reservation?.email || !reservation?.date || !reservation?.time) {
    return json({ error: "Invalid payload" }, 400);
  }

  const note = reservation.note?.trim() ? reservation.note.trim() : "Sin nota";

  const barberText = [
    "Barbería Mariano Martínez",
    getBarberTitle(action),
    "",
    `Servicio: ${reservation.service_name}`,
    `Fecha: ${reservation.date}`,
    `Hora: ${reservation.time}`,
    `Duracion: ${reservation.duration} min`,
    `Cliente: ${reservation.name}`,
    `Email cliente: ${reservation.email}`,
    `Telefono: ${reservation.phone || "No informado"}`,
    `Nota: ${note}`,
    "",
    getBarberFooter(action),
  ].join("\n");

  const clientText = [
    `Hola ${reservation.name},`,
    "",
    getClientTitle(action),
    "",
    `Servicio: ${reservation.service_name}`,
    `Fecha: ${reservation.date}`,
    `Hora: ${reservation.time}`,
    `Duracion: ${reservation.duration} min`,
    "",
    "Sin seña.",
    ...(action !== "cancelled" ? ["Te vamos a enviar un recordatorio por mail 3 horas antes del turno."] : []),
    ...(calendarUrl && action !== "cancelled"
      ? ["", "Si querés agregarlo a tu calendario, abrí este link:", calendarUrl]
      : []),
    ...(manageUrl && action !== "cancelled"
      ? ["", "Para cancelar o modificar tu turno, abrí este link:", manageUrl]
      : []),
  ].join("\n");

  const clientResponse = await sendEmail({
    apiKey: resendApiKey,
    from: fromEmail,
    to: reservation.email,
    subject: getClientSubject(action),
    text: clientText,
  });

  const barberResponse = await sendEmail({
    apiKey: resendApiKey,
    from: fromEmail,
    to: barberEmail,
    subject: getBarberSubject(action, reservation.date, reservation.time),
    text: barberText,
  });

  const clientDetails = clientResponse.ok ? "" : await clientResponse.text();
  const barberDetails = barberResponse.ok ? "" : await barberResponse.text();

  if (!clientResponse.ok || !barberResponse.ok) {
    console.warn("Reservation email partial failure", {
      clientOk: clientResponse.ok,
      barberOk: barberResponse.ok,
      clientDetails,
      barberDetails,
    });

    return json({
      ok: false,
      clientOk: clientResponse.ok,
      barberOk: barberResponse.ok,
    }, 502);
  }

  return json({
    ok: true,
    clientOk: true,
    barberOk: true,
  });
});

function getBarberSubject(action: ReservationEmailPayload["action"], date: string, time: string) {
  if (action === "cancelled") return `Reserva cancelada - ${date} ${time}`;
  if (action === "updated") return `Reserva modificada - ${date} ${time}`;
  return `Nueva reserva - ${date} ${time}`;
}

function getClientSubject(action: ReservationEmailPayload["action"]) {
  if (action === "cancelled") return "Barbería Mariano Martínez - turno cancelado";
  if (action === "updated") return "Barbería Mariano Martínez - turno modificado";
  return "Barbería Mariano Martínez - turno confirmado";
}

function getBarberTitle(action: ReservationEmailPayload["action"]) {
  if (action === "cancelled") return "Reserva cancelada por el cliente";
  if (action === "updated") return "Reserva modificada por el cliente";
  return "Nueva reserva confirmada";
}

function getClientTitle(action: ReservationEmailPayload["action"]) {
  if (action === "cancelled") return "Tu turno en Barbería Mariano Martínez fue cancelado.";
  if (action === "updated") return "Tu turno en Barbería Mariano Martínez fue modificado.";
  return "Tu turno en Barbería Mariano Martínez fue confirmado.";
}

function getBarberFooter(action: ReservationEmailPayload["action"]) {
  if (action === "cancelled") return "El horario quedó disponible para nuevas reservas.";
  if (action === "updated") return "El horario anterior quedó disponible y el nuevo horario quedó reservado.";
  return "El cliente recibió un link privado para cancelar o modificar su turno.";
}

function sendEmail(params: { apiKey: string; from: string; to: string; subject: string; text: string }) {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
    }),
  });
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
