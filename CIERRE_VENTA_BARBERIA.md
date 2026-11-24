# Cierre para venta - Barberia Mariano Martinez

Fecha de revision: 2026-09-09

## Estado del proyecto

El proyecto esta listo para entregar como sistema de reservas online productivo.

Incluye:

- web publica para reservar turnos;
- panel admin en la misma web;
- reservas guardadas en Supabase;
- prevencion de horarios solapados;
- bloqueo manual de horarios;
- agenda online editable, sin depender de Excel;
- actualizacion automatica de la agenda en pantalla, sin F5;
- planificacion mensual de dias y horarios;
- configuracion de servicios, precios y duraciones;
- mail automatico al cliente;
- recordatorio automatico al cliente 3 horas antes del turno;
- mail automatico al barbero;
- link privado para que el cliente modifique o cancele su turno;
- dominio propio conectado y funcionando.

## Links de produccion

Web publica:

```text
https://barberia-mariano-martinez.com
```

Panel admin:

```text
https://barberia-mariano-martinez.com/index.html?admin=1
```

## Verificaciones tecnicas realizadas

El 2026-09-09 se verifico:

- `npm run build`: correcto.
- `node --check app.js`: correcto.
- `node --check server/index.js`: correcto.
- `https://barberia-mariano-martinez.com`: responde `HTTP 200`.

## Configuracion productiva documentada

- Hosting web: Netlify.
- Dominio: Hostinger.
- Base de datos y autenticacion admin: Supabase.
- Emails transaccionales: Resend.
- Remitente: `Reservas <reservas@barberia-mariano-martinez.com>`.
- Mail de avisos al barbero: `barberia.marianomartinez@gmail.com`.
- Horario base: martes a sabado, 13:00 a 21:00.
- Domingo y lunes: cerrado.
- Servicio inicial: Corte, 30 minutos.
- Sena: no se usa.
- Telefono del cliente: obligatorio.
- Email del cliente: obligatorio.
- Recordatorio al cliente: automatico por mail 3 horas antes.

## Accesos a transferir al comprador

Para vender o traspasar el proyecto, entregar o cambiar titularidad de:

- cuenta de Netlify donde esta publicado el sitio;
- cuenta de Supabase del proyecto productivo;
- cuenta de Resend o API key usada por la funcion de emails;
- cuenta de Hostinger o gestion DNS del dominio;
- usuario admin de Supabase Auth para entrar al panel;
- acceso al mail `barberia.marianomartinez@gmail.com`, si corresponde al negocio.

Recomendacion: despues de transferir, cambiar contrasenas y rotar claves sensibles de Resend/Supabase.

## Pendientes operativos antes de entregar

1. Limpiar o cancelar reservas de prueba desde el panel admin.
2. Hacer una reserva final desde el dominio propio con un mail real del comprador o cliente.

Estos dos puntos requieren operar sobre produccion y conviene hacerlos en vivo con el comprador.

## Mensaje corto para el comprador

```text
La web de reservas ya esta online:
https://barberia-mariano-martinez.com

Panel admin:
https://barberia-mariano-martinez.com/index.html?admin=1

El sistema permite reservar, modificar y cancelar turnos por mail, y manda un recordatorio automatico al cliente 3 horas antes. El admin puede organizar la agenda online, configurar horarios, servicios, precios, bloqueos, descansos y datos de contacto. Esta publicado en Netlify, usa Supabase como base de datos y Resend para los emails.
```
