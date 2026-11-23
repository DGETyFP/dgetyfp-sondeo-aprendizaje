# Red de Inclusión DGETyFP

Herramienta del Equipo de Inclusión de la Dirección General de Educación Técnica y Formación Profesional (DGETyFP), Ministerio de Educación de la Provincia de Córdoba.

- Presentación de la jornada (diapositivas 1 a 15)
- Sondeos: VAK (modelo PNL), hemisférico y VAK para docentes
- Registro del grupo (los datos quedan solo en el navegador de quien lo usa)
- Material de consulta
- **Comunidad**: foro de inquietudes y soluciones, con respuestas, "Me pasa lo mismo" y "Me sirve"
- **Novedades**: publicaciones del equipo con reacciones, comentarios y consultas sobre el alcance
- **Sugerir mejoras**: botón en todas las pantallas
- **Administración** (`#admin`): moderación, respuestas, novedades, sugerencias y configuración

## Cómo funciona

- Es una app instalable (PWA): `manifest.webmanifest`, íconos en `icons/` y `sw.js`, que guarda la app para usarla sin conexión. El botón "Instalar app" usa la instalación del navegador o muestra las instrucciones de cada sistema.

- La página está en `index.html`. Cada cambio que se sube a `main` se publica solo en Netlify.
- Los datos de Comunidad, Novedades y Sugerencias se guardan en Netlify Blobs a través de la función `netlify/functions/api.mjs` (lógica en `netlify/functions/lib/core.mjs`).
- La clave de las administradoras es la variable de entorno `ADMIN_KEY` en Netlify (Site configuration → Environment variables). Después de cambiarla hay que volver a publicar el sitio.
- Cada tema nuevo envía el formulario oculto `nuevo-tema` de Netlify Forms; las notificaciones por email se configuran en Netlify → Forms.
