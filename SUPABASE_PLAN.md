# Plan de integración Supabase (pendiente de implementar)

**Estado:** diseño preliminar, sin conexión real configurada.

## Inventario de origen
- SQLite local: usuarios, horarios, distribuciones, asignaciones, parámetros, perfiles, seguimiento, bitácora.
- Datos de expedientes: cortes y registros de `seed.js` (no incluidos en este paquete).
- Tarifarios: registros por IAFA y vigencia de JSON locales (no incluidos en este paquete).

## Riesgos y controles prioritarios
- Datos de pacientes: permisos por mínimos privilegios, política de retención y trazabilidad de cambios.
- Tarifarios: preservar PROFAT/CPMS, fuente, vigencia, IAFA y versiones; no mezclar validez tarifaria con evidencia de convenio.
- Usuarios: migración a Supabase Auth, evitar reutilizar contraseñas locales; asignar roles seguros y RLS.
- Importaciones: validación servidor, límites por archivo y trazabilidad de quién modificó precios.
- Exportaciones: aplicar exactamente los filtros activos **y permisos** del usuario.
- Auditoría: registro inmutable de operaciones críticas y controles de acceso.

## Alcance siguiente entrega
Diseñar esquema SQL con RLS, prototipo de autenticación, migrador de datos con saneamiento y adaptación de los cuatro módulos. Se requiere proyecto Supabase, políticas acordadas y conjunto de datos autorizado para migración.
