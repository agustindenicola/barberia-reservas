# Setup Supabase

## 1. Crear proyecto

Crear un proyecto en Supabase y abrir:

```text
SQL Editor -> New query
```

Pegar y ejecutar:

```text
supabase/schema.sql
```

## 2. Configurar credenciales frontend

En Supabase:

```text
Project Settings -> API
```

Copiar:

- Project URL
- anon public key

Editar:

```text
supabase/config.js
```

Ejemplo:

```js
window.BARBERIA_SUPABASE = {
  url: "https://xxxx.supabase.co",
  anonKey: "eyJ..."
};
```

Si `url` y `anonKey` estan vacios, la app sigue funcionando en modo demo local con `localStorage`.

## 3. Crear usuario admin

En Supabase:

```text
Authentication -> Users -> Add user
```

Crear el usuario del barbero con email y password. Ese usuario se usa para entrar a:

```text
index.html?admin=1
```

El PIN `1234` queda solo para demo local sin Supabase.

## 4. Deployar funciones de email

Las funciones estan en:

```text
supabase/functions/send-reservation-email/index.ts
supabase/functions/send-reservation-reminders/index.ts
```

Necesita Resend:

```text
RESEND_API_KEY
RESERVATION_FROM_EMAIL
```

`RESERVATION_FROM_EMAIL` deberia ser un mail verificado del dominio de la barberia cuando lo tengan.

Para recordatorios automaticos tambien configurar:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
REMINDER_TARGET_MINUTES=180
```

`send-reservation-reminders` debe ejecutarse con un scheduler cada 5 minutos, enviando un `POST` con header:

```text
x-cron-secret: valor-de-CRON_SECRET
```

La plantilla del scheduler esta en:

```text
supabase/reservation-reminder-cron-template.sql
```

El recordatorio se manda al cliente cuando el turno empieza aproximadamente en 3 horas. La reserva queda marcada con `reminder_sent_at` para no repetir el aviso.

## 5. Migraciones actuales

Aplicar en Supabase:

```text
supabase/reservation-server-validation-migration.sql
supabase/reservation-reminders-migration.sql
```

## 6. Flujo online esperado

```text
Cliente reserva
-> Supabase ejecuta create_reservation
-> la funcion evita horarios solapados
-> la reserva queda guardada
-> se invoca send-reservation-email
-> llega mail al barbero
-> llega mail de confirmacion al cliente
-> send-reservation-reminders avisa al cliente 3 horas antes
```

## 7. Nota de seguridad

El admin online usa Supabase Auth. El PIN local queda solo para probar sin credenciales.
