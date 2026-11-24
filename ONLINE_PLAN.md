# Plan para version online

## Objetivo

Convertir la web actual en una agenda online real para que los clientes entren desde Instagram, vean horarios disponibles en vivo y reserven sin pisarse entre ellos.

## Flujo esperado

1. El cliente entra al link publico.
2. Elige servicio, fecha y horario disponible.
3. Carga nombre, email, telefono opcional y una nota opcional.
4. Confirma la reserva.
5. El horario queda bloqueado para todos.
6. El cliente ve una confirmacion simple.
7. El cliente recibe un mail de confirmacion.
8. El barbero recibe un aviso con servicio, fecha, hora, nombre, email, telefono y nota.
9. La reserva queda almacenada para organizar la agenda desde admin.
10. No se cobra sena desde la web.
11. No hay cancelacion online para clientes.

## Decision recomendada

Usar Supabase para la base online y publicar el frontend en Netlify o GitHub Pages.

Motivo: el proyecto es estatico, el volumen esperado es bajo para los limites gratis y Supabase permite bloquear reservas con una base central sin armar un servidor propio.

## Datos pendientes del barbero

- Nombre final de la barberia para mostrar en la web.
- Servicios reales.
- Duracion de cada servicio.
- Precio de cada servicio, si quiere mostrarlo.
- Horarios por dia.
- Si trabaja con descanso o bloques cerrados.
- Cuantos dias hacia adelante permite reservar.
- Mail exacto para recibir reservas.

## Modelo de datos sugerido

### services

- id
- name
- duration
- price
- active
- sort_order

### opening_hours

- weekday
- open
- start_time
- end_time
- break_start
- break_end

### reservations

- id
- service_id
- service_name
- duration
- price
- date
- time
- name
- email
- phone
- note
- status
- created_at

## Regla critica

La tabla de reservas tiene que impedir dos reservas activas para el mismo dia y horario.

Esto evita que dos clientes reserven el mismo turno al mismo tiempo. Si pasa una carrera, la primera reserva entra y la segunda recibe un mensaje tipo: "Ese horario acaba de ser reservado. Elegi otro."

## Notificaciones

### Primera version simple

- Confirmacion en pantalla para el cliente.
- Aviso automatico al barbero por mail desde Supabase Edge Function.
- Mail automatico de confirmacion al cliente desde la misma Edge Function.
- El email del cliente es obligatorio; el telefono queda como respaldo.
- Proveedor recomendado para mail: Resend, porque permite API simple desde Edge Functions.
- Variables secretas necesarias: `RESEND_API_KEY` y `RESERVATION_FROM_EMAIL`.

### Version posterior

- WhatsApp automatico real via API o proveedor externo.
- Recordatorios automaticos.
- Reprogramacion manual desde el panel admin.

## Cambios tecnicos en la app actual

- Reemplazar `localStorage` por llamadas a Supabase.
- Cargar servicios desde la base online.
- Cargar horarios desde la base online.
- Cargar reservas activas por fecha desde la base online.
- Crear reserva con validacion atomica para evitar turnos duplicados.
- Ejecutar una Edge Function despues de crear la reserva para mandar mail al barbero y al cliente.
- Mantener el panel admin, pero conectado a Supabase.
- Agregar filtro de reservas por fecha en el panel admin para que funcione como agenda diaria.
- Agregar estado de carga y mensajes de error cuando no haya conexion.

## Pasos de implementacion

1. Crear proyecto Supabase.
2. Crear tablas y restricciones.
3. Configurar permisos seguros para lectura publica de servicios/horarios y creacion controlada de reservas.
4. Adaptar `app.js` para usar Supabase.
5. Deployar `supabase/functions/send-reservation-email`.
6. Configurar `RESEND_API_KEY`, `RESERVATION_FROM_EMAIL` y mail destino del barbero.
7. Publicar la web.
8. Probar desde dos celulares al mismo tiempo.
9. Hacer prueba con amigos/conocidos antes de poner el link fijo en Instagram.

## Riesgos a cuidar

- No exponer permisos de administracion en el navegador publico.
- Evitar doble reserva del mismo horario.
- No depender de `localStorage` para datos reales.
- No mandar mail directo desde el navegador: usar backend/Edge Function.
- Que el cliente pueda reservar en pocos pasos desde celular.
- Que el barbero reciba datos claros y accionables.
