# Entrega Barbería Mariano Martínez

## Link publico

https://barberia-mariano-martinez.com

## Panel admin

```text
https://barberia-mariano-martinez.com/index.html?admin=1
```

## Estado final probado

- Verificacion tecnica actualizada el 2026-09-09.
- El cliente puede reservar un turno online.
- El horario reservado queda ocupado para otros clientes.
- El cliente recibe un mail con link privado de gestion.
- El cliente recibe un recordatorio por mail 3 horas antes del turno.
- Desde ese link puede modificar el turno.
- Desde ese link puede cancelar el turno.
- Al modificar, se libera el horario anterior y se ocupa el nuevo.
- Al cancelar, el horario vuelve a quedar disponible.
- El panel admin funciona desde computadora y celular.
- El admin puede ver y modificar online reservas, bloqueos, horarios, servicios, descansos y configuracion.
- La pantalla se actualiza sola con cambios online, sin recargar manualmente.

## Flujo del cliente

- Entra al link.
- Elige servicio, fecha y horario disponible.
- Carga nombre, email, teléfono y nota opcional.
- Confirma el turno.
- Recibe un mail de confirmacion con su link privado.
- Recibe un recordatorio por mail 3 horas antes del turno.
- Si necesita cambiar algo, abre el link del mail.
- Puede modificar o cancelar sin escribirle manualmente a la barberia.

## Funciones del panel admin

Desde el panel se puede:

- ver reservas por fecha;
- cancelar reservas;
- organizar la agenda online sin Excel;
- bloquear y liberar horarios en vivo;
- cambiar horarios;
- cargar descansos;
- cambiar el mail que recibe avisos;
- ajustar servicios, precios y duraciones;
- cambiar la contrasena de acceso.

## Configuracion actual

- Servicio: Corte.
- Duración: 30 minutos.
- Horario base: martes a sábado, 13:00 a 21:00.
- Domingo y lunes: cerrado.
- Teléfono: obligatorio.
- Seña: no.
- Base de datos: Supabase.
- Hosting: Netlify.
- Dominio: Hostinger.
- Emails: Resend con dominio verificado.
- Recordatorios: automaticos por mail 3 horas antes.
- Remitente: `Reservas <reservas@barberia-mariano-martinez.com>`.
- Avisos al barbero: `barberia.marianomartinez@gmail.com`.

## Pendiente final

- Limpiar reservas de prueba antes de abrirlo al publico.
- Hacer una reserva final desde el dominio propio con un mail real del cliente.

## Nota importante sobre mails

El dominio ya esta verificado en Resend. La prueba tecnica de envio devolvio `clientOk: true` y `barberOk: true`.

## Cierre para venta

El documento de traspaso esta en:

```text
CIERRE_VENTA_BARBERIA.md
```
