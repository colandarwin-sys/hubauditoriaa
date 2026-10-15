# Hub Auditoría — V33 (preparación GitHub / Netlify / Supabase)

## Estado actual
Esta entrega permite subir el código a **GitHub (repositorio PRIVADO)** y publicar en **Netlify** una página inicial segura. **No es el portal operativo completo alojado en Netlify**. La versión V32 usa Python, SQLite y endpoints `/api/*`, incompatibles con Netlify estático sin migración de backend.

## Estructura
- `netlify-site/`: sitio público seguro, sin datos de pacientes, para Netlify.
- `app/static/`: interfaz original del Hub Auditoría (V32); no es el directorio publicado.
- `app/server.py`: backend Python de referencia, para ejecución local previa a la migración.
- `app/data/`: directorio vacío para SQLite local; no contiene datos clínicos.
- `netlify.toml`: publicación configurada en `netlify-site`.
- `.env.example`: nombres de variables futuras, sin secretos.

## Subir a GitHub
1. Crear repositorio **privado** en GitHub.
2. Subir el contenido de esta carpeta (no el ZIP como un único archivo).
3. Confirmar que no se han añadido archivos `.db`, respaldos, historiales ni datos personales.
4. No publicar `app/static/` directamente sin revisión de seguridad.

## Publicar en Netlify
1. Netlify → Add new project → Import an existing project → GitHub.
2. Seleccionar el repositorio privado.
3. Configuración: el `netlify.toml` ya define `publish = "netlify-site"`. No hace falta comando de compilación.
4. Deploy. Se mostrará una **página inicial de prepublicación**, no un inicio de sesión funcional.

## Ejecutar backend local de referencia (opcional)
Requiere Python 3. Se deben configurar `ADMIN_USERNAME` y `ADMIN_PASSWORD` como variables de entorno antes del primer inicio, utilizando credenciales fuertes. Ejemplo POSIX:

```sh
cd app
ADMIN_USERNAME=mi_admin ADMIN_PASSWORD='CLAVE_NUEVA_Y_SEGURA' python server.py
```

**Atención:** faltarán los datos reales de tarifarios y expedientes deliberadamente. Esta copia no sustituye el respaldo local de la V32. La autenticación y persistencia de este servidor no están diseñadas para una publicación pública directa.

## Próxima fase: Supabase
1. Inventariar modelos (usuarios/roles, expedientes, snapshots, tarifarios, vigencias, horarios, distribuciones, seguimiento y bitácora).
2. Diseñar tablas PostgreSQL con llaves, unicidad, fechas y auditoría.
3. Configurar Supabase Auth, roles y Row Level Security (RLS); nunca exponer `service_role` en navegador.
4. Crear un servicio seguro para tareas privilegiadas e importaciones.
5. Migrar datos privados **directamente en entorno seguro**, no a través de GitHub.
6. Reemplazar `/api/*` y las lecturas de archivos JSON por una capa de datos segura.
7. Probar controles de acceso por usuario, exportación, concurrencia y recuperación antes de habilitar el portal en producción.

## Advertencias
- Se retiraron `auditoria.db`, el histórico real de expedientes y el tarifario real del paquete de despliegue.
- No hay credenciales predeterminadas; el bootstrap local requiere variables de entorno.
- No publicar información de salud personal ni archivos de contratos/tarifarios en un sitio público.
- Mantener la V32 original como respaldo privado.
