# Hub Auditoría V34 — Vista previa para GitHub y Netlify

## IMPORTANTE

Esta publicación contiene la interfaz completa de la V32 y un **adaptador local de demostración** para abrir los módulos sin servidor Python. **NO es una aplicación operativa compartida ni ofrece autenticación real**. Está destinada a **probar la interfaz** mientras se desarrolla la conexión Supabase.

- Datos clínicos, tarifarios reales y base SQLite: **excluidos deliberadamente**.
- Entrada: botón **Explorar Hub Auditoría** (las credenciales en pantalla no tienen valor de seguridad).
- Algunos controles pueden utilizarse de forma local, con almacenamiento por navegador. Cambios en un equipo no aparecen en otros.
- Importación persistente de tarifarios, exportaciones del servidor, autenticación real y sincronización requieren Supabase y código backend adicional.
- **No ingreses información clínica ni real**. El sitio de demostración no es seguro para producción.

## Subir a tu GitHub existente

1. Respalda tu repositorio antiguo antes de reemplazar archivos.
2. Sube los archivos y carpetas de este ZIP a la **raíz** del repositorio, no el ZIP comprimido.
3. Asegúrate de que `netlify.toml` quede al mismo nivel que `site/`.
4. En Netlify configura **Publish directory: site**. No uses la antigua carpeta `netlify-site`.
5. Si el sitio anterior no se actualiza, revisa rama `main` y último Deploy en Netlify; fuerza un deploy si corresponde.
6. Entra al dominio Netlify; `index.html` redirige a `login.html` (modo demostración).

## Archivos

- `site/`: interfaz existente y recursos estáticos.
- `site/js/demo_api.js`: adaptador local de prueba; se reemplazará en la migración a Supabase.
- `supabase/INTEGRACION_PENDIENTE.md`: próximos pasos.
- `netlify.toml`: configuración de despliegue.
- `.env.example`: ejemplo sin secretos.

## Comprobaciones

- Interfaz: vistas de los módulos, gráficos y controles del navegador.
- Distribución: guardado de demostración en navegador, no compartido.
- Tarifarios: lectura de Excel para vista previa; guardado en base compartida aún pendiente.
- Expedientes: datos iniciales vacíos; utiliza solo archivos ficticios para explorar el proceso.
- Excel de servidor: exportaciones de `/api/export/*` necesitan migración. Las exportaciones del navegador podrán probarse donde no requieran backend.

El último proyecto plenamente operativo **local** sigue siendo V32, que debe mantenerse respaldado. Esta versión es una publicación de prueba, no reemplazo funcional de V32 en producción.
