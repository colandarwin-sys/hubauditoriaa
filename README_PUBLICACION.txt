PORTAL DE DISTRIBUCIÓN DE AUDITORÍA — VERSIÓN GITHUB + NETLIFY
===============================================================

ESTA CARPETA YA ESTÁ ORDENADA PARA SUBIRLA A GITHUB.
No subas el ZIP a GitHub. Descomprímelo y sube TODO lo que está dentro de esta carpeta.

IMPORTANTE
----------
La versión local utilizaba SQLite (auditoria.db). Netlify no puede mantener una base SQLite local persistente.
Por eso esta versión conserva la misma interfaz y lógica de distribución, pero la persistencia web se conecta a PostgreSQL/Supabase mediante una Netlify Function.

ESTRUCTURA
----------
static/                  -> portal web (login, operación, resultados, seguimiento, etc.)
netlify/functions/api.js -> backend web de usuarios, históricos, perfiles y seguimiento
netlify.toml             -> configuración automática de Netlify
package.json             -> dependencias del backend
supabase_setup.sql       -> crea las tablas y usuarios base en Supabase
.gitignore               -> evita subir archivos locales/sensibles

USUARIOS BASE MIGRADOS
----------------------
dcolan       / contraseña inicial: dcolan       / Administrador / Darwen Colán
ctejada      / contraseña inicial: ctejada      / Gerente       / Cindy Tejada
avillanueva  / contraseña inicial: avillanueva  / Coordinador   / Aryana Villanueva

Por seguridad, cambia las contraseñas desde el módulo Usuarios después del primer ingreso público.

PASO 1 — SUPABASE (UNA SOLA VEZ)
---------------------------------
1. Crea un proyecto en Supabase.
2. En Supabase entra a SQL Editor.
3. Abre el archivo supabase_setup.sql de esta carpeta.
4. Copia TODO su contenido, pégalo en SQL Editor y ejecuta Run.
5. En Supabase busca la cadena de conexión PostgreSQL (Connection string / Pooler).
   Para Netlify es recomendable la conexión del pooler para aplicaciones serverless.
6. Guarda esa cadena; la vas a pegar en Netlify como DATABASE_URL.

PASO 2 — GITHUB
---------------
1. Entra al repositorio que quieras usar.
2. Add file > Upload files.
3. Descomprime este ZIP en tu computadora.
4. Abre la carpeta PORTAL_DISTRIBUCION_AUDITORIA_NETLIFY_v01.
5. Selecciona TODO lo que hay DENTRO:
      .gitignore
      netlify.toml
      package.json
      supabase_setup.sql
      README_PUBLICACION.txt
      static
      netlify
6. Arrástralo a GitHub.
7. En mensaje de commit puedes poner: "Portal Distribución Auditoría - publicación inicial".
8. Pulsa Confirmar cambios / Commit changes.

PASO 3 — NETLIFY
----------------
1. En Netlify: Add new project / Import an existing project.
2. Elige GitHub.
3. Selecciona el repositorio donde acabas de subir estos archivos.
4. Netlify leerá netlify.toml automáticamente.
   Publish directory: static
   Functions directory: netlify/functions
5. ANTES de desplegar, agrega una variable de entorno:
      DATABASE_URL = <cadena de conexión PostgreSQL/Supabase>
6. Deploy.

No necesitas indicar un Build command manual. Netlify instalará las dependencias de package.json para la Function.

PASO 4 — PRUEBA
---------------
Cuando Netlify termine:
1. Abre el link .netlify.app.
2. Debe abrir directamente login.html.
3. Prueba con dcolan y su contraseña.
4. Entra a Usuarios y cambia las contraseñas iniciales.
5. Prueba Perfiles del equipo, Operación mensual, Resultados, Históricos y Seguimiento operativo.

ACTUALIZACIONES FUTURAS
-----------------------
Cuando haya una nueva versión del portal NO tienes que crear otro sitio Netlify.
Sube/reemplaza los archivos en ESTE MISMO repositorio y haz Commit changes.
Netlify detectará el cambio y publicará automáticamente sobre EL MISMO LINK.

QUÉ NO DEBES SUBIR
------------------
No subas auditoria.db, server.py, ABRIR PORTAL.bat o ABRIR PORTAL.vbs a esta versión web.
Esos archivos pertenecen a la versión local SQLite y no se utilizan en Netlify.
