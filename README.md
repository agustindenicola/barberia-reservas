# Barbería Mariano Martínez

Web para que clientes reserven, modifiquen y cancelen turnos online sin mandar mensajes.

## Links

Cliente:

```text
https://barberia-mariano-martinez.com
```

Admin:

```text
https://barberia-mariano-martinez.com/index.html?admin=1
```

## Funciona actualmente

- Cliente: elige servicio, fecha, horario libre, carga nombre/email/teléfono y confirma el turno.
- Gestion del cliente: recibe un link por mail para modificar o cancelar.
- Recordatorio automatico: el cliente recibe un mail 3 horas antes del turno.
- Administracion: entra con usuario y contrasena de Supabase Auth.
- Desde administracion se configuran dias abiertos, horarios, descansos, anticipacion maxima, servicios, duracion, precio, agenda online y email de avisos.
- La agenda se actualiza sola en pantalla, sin F5.
- Las reservas ocupan automaticamente su bloque horario segun la duracion del servicio.
- No usa sena: el cliente confirma el turno directamente.
- Email y telefono obligatorios.
- La app online guarda reservas en Supabase.
- El sitio esta publicado en Netlify.

## Configuracion actual

- Martes a sabado: 13:00 a 21:00.
- Domingo y lunes: cerrado.
- Corte: 30 minutos.
- Mail de avisos definitivo: `barberia.marianomartinez@gmail.com`.
- Remitente de emails: `Reservas <reservas@barberia-mariano-martinez.com>`.
- Recordatorios: mail automatico al cliente 3 horas antes.

## Pendiente antes de abrirlo al publico

- Limpiar reservas de prueba.
- Hacer una prueba final desde el dominio propio con un mail real del cliente.

## Cierre para venta

Ver:

```text
CIERRE_VENTA_BARBERIA.md
```

## Nota sobre emails

La logica de mails ya esta integrada con Resend y el dominio esta verificado. La prueba tecnica confirma envio correcto al cliente y al barbero.

## Desarrollo local

```bash
npm run build
```

Para revisar sintaxis:

```bash
node --check app.js
```
