# Hub Auditoría — V32 adaptada para GitHub, Netlify y Supabase

**Esta entrega contiene las pantallas completas de la V32 (no una maqueta).** La API de Python ha sido sustituida por una primera implementación de funciones Netlify conectadas a Supabase. Para utilizarla hay que **configurar Supabase**: no existen contraseñas predefinidas ni datos incrustados en GitHub.

## Instrucciones (en orden)

1. Conserva tu respaldo de la **V32 local**. No elimines el archivo ZIP original ni su base SQLite.
2. En el **Supabase existente que tú elijas**, abre SQL Editor y ejecuta `supabase/01_hub_schema.sql`. El script **crea tablas `hub_*` nuevas**, no borra las existentes.
3. En **Netlify > Site configuration > Environment variables** agrega **SUPABASE_URL** (URL de tu proyecto), **SUPABASE_SERVICE_ROLE_KEY** (clave secreta, solo en Netlify) y credenciales temporales de instalación **HUB_BOOTSTRAP_USERNAME** y **HUB_BOOTSTRAP_PASSWORD**. Usa una contraseña nueva y robusta (no uses la contraseña original). **Nunca subas estas cuatro variables a GitHub.**
4. Sube **el contenido de este ZIP** (las carpetas `site`, `netlify`, `supabase`, etc.) a la raíz del repositorio existente. Confirma que `netlify.toml` está en la raíz.
5. Netlify: vincula el repositorio/rama correcta. Directorio de publicación: `site`; funciones: `netlify/functions`. Netlify instalará `exceljs` a partir de `package.json`. Publica y abre `/instalacion.html` una sola vez. Ingresa allí las credenciales exactas que configuraste en las variables de instalación para crear el primer administrador.
6. Entra a `/login.html` con ese administrador. Crea los demás usuarios desde **Gestión de usuarios**, **asignando contraseñas nuevas**. Por seguridad no se copiaron las contraseñas de SQLite. Cuando termine la instalación, **elimina HUB_BOOTSTRAP_USERNAME y HUB_BOOTSTRAP_PASSWORD de Netlify** y vuelve a desplegar.
7. Conserva la versión original local para consultar registros previos hasta completar una importación privada. Si el proyecto anterior contenía expedientes o tarifas, **no subas sus archivos de datos a GitHub**.

## Qué funciona cuando Supabase queda conectado

- Inicio/cierre de sesión real con Supabase Auth y cookies HttpOnly.
- Gestión de usuarios y permisos; perfiles de equipo; configuraciones; carga/guardado de horarios, distribuciones, seguimiento y consultas del dashboard.
- Tarifarios: lectura en backend autenticado, análisis en las pantallas originales, importación por IAFA con validación básica e historial de importaciones. Descargas de Distribución: `.xlsx` con colores negro/verde y filtros.
- Navegación y estilos originales V32: gráficos, filtros, tablas, ventanas y animaciones.

## Limitaciones REALES pendientes de migrar antes de producción clínica

1. **Expedientes pendientes** sigue usando el almacenamiento local del navegador; aún no sincroniza cargas ni cortes entre equipos con Supabase. Sus archivos de pacientes originales se excluyeron del sitio público.
2. Los **tarifarios históricos originales** no están incluidos en la carpeta pública. Para que aparezcan deben importarse **desde una cuenta autenticada** una vez configurado Supabase (o realizar migración privada). Mientras no se importen, el módulo inicia sin registros.
3. La importación de tarifas en la API nueva usa **upsert por lotes**, no el reemplazo atómico y copia de respaldo que tenía Python: los registros ausentes del nuevo archivo quedan conservados. **No usar para conciliación productiva hasta cerrar esta diferencia funcional**.
4. Las descargas de Excel del servidor mantienen los datos principales, pero todavía **no todas las pestañas y cálculos auxiliares** de la exportación Python original.
5. Netlify tiene límites de tamaño/duración para funciones: importaciones grandes requieren pruebas por IAFA y eventualmente una función de importación asíncrona.
6. La autenticación es real, pero resta una auditoría completa de políticas, flujos de permisos, expiración de sesiones, importación de históricos y cargas multiusuario antes de utilizar datos clínicos reales.
7. Los historiales antiguos de SQLite no se migran automáticamente. Guardar siempre la V32 original.

**No se afirma que la web ya sea equivalente al 100% a la V32 local.** Este paquete prepara las conexiones verdaderas, evita simulaciones de acceso y conserva el código visual original.

## Seguridad

No publiques nunca `auditoria.db`, archivos de expedientes, `seed.js` original con pacientes, `tariffs.json` original, `.env`, hashes de contraseñas ni llaves Supabase. La clave service-role solamente va como variable privada en Netlify. El SQL revoca acceso directo anon/authenticated a tablas Hub: la función valida una sesión Supabase antes de usar la clave privada. Haz un respaldo independiente de las bases antiguas antes de migrar.
