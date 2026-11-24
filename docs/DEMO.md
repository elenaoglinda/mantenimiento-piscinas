# Demo de 10 minutos

Guion para enseñar Loro a una empresa de mantenimiento de piscinas, con la cuenta
**«Piscinas Mediterráneo (demo)»**: 3 clientes, 8 piscinas, 11 vasos y 90 días de historial.

## Antes de la demo (2 minutos, el mismo día)

1. Regenera la demo para que las fechas acaben hoy ([`scripts/demo/README.md`](../scripts/demo/README.md)):

   ```bash
   npx tsx scripts/demo-seed.ts --admin-email demo@cloro.app --reset
   ```

2. Entra en **https://panel.cloro.app** con ese correo (enlace mágico) en el móvil y en el
   portátil.
3. Ten WhatsApp abierto en el móvil: en el paso 6 te enviarás el informe a ti mismo.

> La demo es segura de enseñar: los clientes tienen correos `@example.com` y ningún teléfono,
> así que ningún envío llega a un desconocido; y las facturas son borradores que no se pueden
> emitir (la cuenta no tiene datos fiscales), así que nada llega a la AEAT.

## El recorrido

### 1. Inicio: lo que requiere atención (1 min)

Abre **Inicio**. En **Requiere atención** aparece una lectura fuera de rango de hace un par de
días: _Hotel Costa Blanca · Piscina exterior_, cloro libre bajo en el chapoteo. La campana de
arriba muestra el mismo aviso.

Qué decir: _«Cada mañana ves qué piscina necesita algo, sin abrir ninguna hoja de cálculo.»_
Señala también **Ruta de hoy**: la primera parada ya está hecha y el resto pendiente.

### 2. La piscina con el aviso (1 min)

Pulsa el aviso. Se abre la piscina en **Historial**, con la visita marcada.

- La tarjeta **Último estado del agua** de cada vaso, con su semáforo.
- La visita: lecturas, productos añadidos (cloro granulado de choque), tareas e incidencia
  con su **acción correctora**.

### 3. Historial y evolución del cloro (1,5 min)

- **Historial**: filtra por vaso o por fechas; la lista guarda el filtro en la dirección, así que
  se puede compartir.
- **Evolución** → parámetro **Cloro libre residual**, 90 días: la banda verde es el rango
  legal; los triángulos rojos, las lecturas fuera de rango.

Qué decir: _«Cuando el cliente pregunta "¿cómo ha ido el verano?", esto es la respuesta.»_

### 4. Su cliente (1 min)

Desde la cabecera, pulsa **Hotel Costa Blanca Playa**: todas sus piscinas (exterior, spa,
solárium, club infantil) y todas las visitas en una sola página.

### 5. Una visita con fotos, firma y PDF (2 min)

Abre la visita del aviso (o cualquiera de los últimos 7 días, todas firmadas):

- Fotos del vaso, firma de Andrés Pastor (jefe de mantenimiento del hotel) y la fecha.
- En **Enviar al cliente**, pulsa **Descargar PDF**: el informe con el logotipo de la empresa,
  cada lectura con su semáforo y su rango legal o recomendado, productos, tareas, incidencias,
  fotos y firma. Ábrelo en el móvil: está pensado para leerse ahí.

Si da tiempo: en **Piscinas → Hotel Costa Blanca · Spa → Resumen**, la tarjeta **Resumen
mensual para el cliente** genera el PDF del mes: evolución de cada vaso, visitas, lecturas fuera
de rango, incidencias y productos usados.

### 6. Enviarlo por WhatsApp (1 min)

Pulsa **Enviar por WhatsApp**. Se abre WhatsApp con el mensaje y el enlace al PDF (válido
30 días). El cliente de la demo no tiene teléfono, así que WhatsApp pregunta a quién enviarlo:
elígete a ti y ábrelo en el móvil delante del cliente.

**Enviar por email** hace lo mismo con el correo del cliente.

### 7. Exportar a SILOÉ (1,5 min)

Abre **SILOÉ** → año actual → **Generar resultados anuales**. Los vasos de tipo 2 y 3A ya
tienen sus códigos SILOÉ (la villa particular no está obligada a declarar). Rellena el código
de laboratorio con **Aplicar a todos** y descarga el XML.

Qué decir: _«Lo que antes era una semana de pasar el libro de registro a mano, ahora es un
botón. Y el XML sale de las mismas lecturas que acabas de ver.»_

## Después

- Para dejar la demo como nueva: `--reset` (borra solo la organización demo y la vuelve a crear).
- Si alguien probó a emitir una factura: no se puede (no hay datos fiscales), así que el reset
  sigue funcionando.
