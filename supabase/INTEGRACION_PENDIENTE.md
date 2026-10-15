# Preparación para Supabase — NO CONECTADO

1. Selecciona tú el proyecto que utilizarás (no compartas credenciales).
2. Haz una copia de respaldo de sus tablas actuales.
3. Define entidades: perfiles/Auth, permisos, expedientes, cortes, cargas, tarifas, vigencias, distribuciones, asignaciones, resultados, seguimiento, logs.
4. Aplicar RLS a cada tabla; construir roles y validaciones desde servidor para tareas privilegiadas.
5. Implementar autenticación Supabase Auth antes de habilitar usuarios reales.
6. Sustituir el adaptador `site/js/demo_api.js` por consultas y funciones seguras.
7. Migrar datos exclusivamente mediante proceso privado, nunca en el repositorio público.
8. Probar todos los flujos y exportaciones antes del lanzamiento operativo.

La V34 es una versión de demostración y NO incluye migraciones SQL listas para ejecutar.
