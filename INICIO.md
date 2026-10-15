# Hub Auditoría — publicación GitHub / Netlify / Supabase

Este paquete se generó a partir del ZIP **Hub_Auditoria_V32_GESTION_USUARIOS_SCROLL(1).zip**. Conserva sus pantallas originales, estilos y módulos. No es una pantalla de demostración.

## Antes de reemplazar el proyecto

1. Guarda un respaldo de tu repositorio actual. **No publiques `Hub_Auditoria_V32_DATOS_PRIVADOS_MIGRACION.json` en GitHub.** Contiene expedientes de pacientes y datos comerciales.
2. La clave `service_role` que anteriormente se compartió en la conversación debe tratarse como comprometida. Rótala de manera controlada en Supabase antes de usar datos reales, comprobando primero sus dependencias. Nunca coloques una clave privada en `site/` ni en variables públicas del build.
3. Elimina del repositorio GitHub **todos los archivos antiguos salvo `.git`**, incluidos `app/`, `static/`, `netlify-site/`, `node_modules/` y scripts de versiones anteriores. Copia SOLO el contenido de este ZIP en la raíz; el commit debe registrar las eliminaciones.

## 1. Supabase (proyecto que tú elijas)

- SQL Editor → New query → pegar **todo** `supabase.sql` → Run. Son migraciones aditivas para tablas `hub_*`; incluyen políticas RLS y la función de importación transaccional.
- No cambies ni borres tablas que no empiecen por `hub_`.
- Las contraseñas locales de la V32 no se publican; los usuarios se deben crear en Supabase Auth mediante la Gestión de usuarios del Hub después de crear el administrador.

## 2. Netlify

Conecta tu repositorio a Netlify. `netlify.toml` indica publicación de `site` y funciones en `netlify/functions`. No hace falta introducir un comando de build.

Configura estas **variables privadas** en `Project configuration → Environment variables`, disponibles para `Functions` o `All scopes`:

- `SUPABASE_URL` = `https://TU-REF.supabase.co` (SIN `/rest/v1/`)
- `SUPABASE_SERVICE_ROLE_KEY` = clave privilegiada vigente de Supabase, **únicamente en Functions** y nunca en el código público.
- `HUB_BOOTSTRAP_USERNAME` = usuario inicial administrador (por ejemplo `dcolan`)
- `HUB_BOOTSTRAP_PASSWORD` = contraseña inicial **nueva de 12 caracteres o más**.

**Atención:** evita nombres personalizados; el código usa los nombres exactos de arriba. El escaneo de secretos de Netlify debe permanecer habilitado. Si da coincidencias revisa que el GitHub no conserve archivos antiguos ni valores de credenciales incrustados.

## 3. Primera entrada

- Despliega (debería aparecer `Published`).
- Visita `https://TU-SITIO.netlify.app/instalacion.html`, introduce el usuario y la contraseña de instalación de las variables anteriores, y crea el administrador.
- Ingresa en `/login.html` con ese usuario y contraseña.
- Cuando compruebes el acceso, elimina las variables temporales `HUB_BOOTSTRAP_USERNAME` y `HUB_BOOTSTRAP_PASSWORD` de Netlify; vuelve a desplegar. El código también bloquea crear otro administrador inicial cuando ya existe uno.

## 4. Restaurar los datos privados de la V32

La migración privada se entrega **separada** del ZIP de GitHub.

- Inicia sesión como administrador y abre `/importacion.html`.
- Selecciona **`Hub_Auditoria_V32_DATOS_PRIVADOS_MIGRACION.json`** en tu computadora.
- Pulsa **Importar a Supabase** y espera a que el indicador llegue al 100 %. No cierres esa pestaña mientras importa los 19 120 registros de tarifas y los 3 cortes históricos.
- Comprueba el histórico y los indicadores. Puedes reintentar la importación si se interrumpe; se actualiza por PROFAT/IAFA o fecha de corte.
- La importación recupera también los usuarios `ctejada` y `avillanueva` (y otras cuentas contenidas en la V32), conservando los perfiles de permisos. **No se reutilizan sus contraseñas antiguas.** Se crean contraseñas nuevas y el navegador descarga `CREDENCIALES_TEMPORALES_HUB_PRIVADO.txt` para entregarlas de forma segura a cada usuario. Ese archivo es confidencial: no lo subas a GitHub ni lo envíes por canales públicos.

No cargues el archivo privado en GitHub, en Netlify como sitio estático ni en enlaces compartidos. Debe viajar desde tu navegador autenticado directamente a la API protegida del Hub.

## 5. Módulos y fotografías

- **Distribución de tareas**: operaciones, resultados, seguimiento, dashboard, históricos, configuración y perfiles.
- **Expedientes pendientes**: cortes, filtros, antigüedad, históricos, importaciones y exportaciones. El guardado se realiza contra Supabase, no localStorage.
- **Gestión de tarifarios**: comparador, directorio, histórico, actualización/nuevas IAFAS, importación transaccional con respaldo de tarifa anterior.
- **Gestión de usuarios**: roles, permisos, alta, baja, edición y fotografía. Clic en la fotografía del menú para editar tu foto; fotos de colaboradores en «Perfiles del equipo».

## Validación y límites

El paquete fue comprobado sintácticamente y con pruebas aisladas de rutas, pero **no es posible certificar un despliegue real ni las conexiones a tu Supabase sin ejecutar el proyecto en tu entorno**. La instalación requerirá los cuatro pasos anteriores. No se garantiza la migración automática de contraseñas antiguas: se recrean los usuarios de manera segura.

No uses información clínica real hasta confirmar autenticación, permisos, pruebas de inserción y lectura entre computadoras, exportación de Excel, y rotación de la clave expuesta anteriormente.
