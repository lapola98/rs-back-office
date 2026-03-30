## 2026-03-27

- Decisión: Desplegar el frontend en Vercel como plataforma de hosting principal

- Contexto:
  La aplicación es un SaaS web con frontend desacoplado que consume directamente servicios de Supabase.

- Motivo:
  - Permite despliegue rápido y continuo (CI/CD integrado)
  - Reduce necesidad de gestionar infraestructura
  - Incluye CDN global (mejora performance)
  - Simplifica manejo de entornos y variables

- Alternativa considerada:
  Hosting manual (VPS) o despliegue en AWS (S3 + CloudFront / Amplify)

- Razón para no elegir alternativas:
  - Mayor complejidad operativa
  - Más tiempo de configuración y mantenimiento
  - No aporta ventajas relevantes en etapa MVP

- Riesgos:
  - Dependencia de Vercel como proveedor
  - Limitaciones en configuraciones avanzadas (edge cases)
  - Posibles costos con alto tráfico

- Mitigación:
  - Mantener frontend desacoplado (estático / portable)
  - Evitar features propietarias específicas de Vercel
  - Controlar uso de ancho de banda y builds

- Señales de revisión futura:
  - Incremento significativo de tráfico
  - Necesidad de control fino de infraestructura
  - Requerimientos de backend server-side más complejos

## 2026-03-24

- Decisión: Mantener Supabase como backend principal (DB, auth y storage) para el MVP y primeras etapas de crecimiento.

- Contexto:
  El producto es un SaaS de back office multi-cliente que requiere manejo de datos operativos y carga de documentos (extractos).

- Motivo:
  - Permite alta velocidad de desarrollo siendo un equipo de 1 persona
  - Reduce complejidad técnica (auth, base de datos y storage integrados)
  - Suficiente para validar producto y operar primeros clientes
  - Evita sobrearquitectura temprana

- Alternativa considerada:
  Migrar o construir directamente sobre AWS (RDS, S3, etc.)

- Razón para no elegir AWS ahora:
  - Mayor complejidad técnica y operativa
  - Mayor tiempo de desarrollo
  - No es necesario en etapa actual
  - Riesgo de distraerse de la validación del producto

- Riesgos:
  - Dependencia de Supabase como proveedor
  - Posible aumento de costos con alto uso de compute/egress
  - Limitaciones si el sistema evoluciona hacia procesamiento intensivo

- Mitigación:
  - Diseñar modelo de datos portable (Postgres estándar)
  - Separar lógica de negocio del frontend
  - Evitar acoplamiento excesivo al SDK de Supabase
  - Usar storage y DB de forma estructurada (no improvisada)

- Señales de revisión futura:
  - Aumento significativo de clientes y carga operativa
  - Necesidad de procesamiento pesado de archivos
  - Complejidad creciente en lógica de negocio
  - Costos no controlables en Supabase


  # 🧠 Decisión: Generación de tareas recurrentes con pg_cron + función SQL

## Contexto

El sistema requiere generar tareas recurrentes mensuales basadas en:

- servicios contratados por empresa (`company_services`)
- plantillas de tareas (`task_templates`)
- diferenciación de ownership (`owner_type`: cliente vs RS)

Ejemplos:
- Cliente: subir extracto bancario, novedades de nómina  
- RS: cierre contable mensual, liquidación de retención en la fuente  

Se evaluaron varias alternativas para ejecutar este proceso de forma automática.

---

## Opciones evaluadas

### 1. Supabase pg_cron + función SQL (elegida)

- Cron ejecuta directamente una función en Postgres  
- Lógica completamente dentro de la base de datos  

### 2. Supabase pg_cron + Edge Function

- Cron llama una función HTTP (TypeScript)  
- Lógica fuera de la base de datos  

### 3. Cron externo (GitHub Actions / servidor / Zapier)

- Job fuera de Supabase que ejecuta lógica contra la DB  

---

## Decisión

Se utilizará:

👉 **pg_cron + función SQL (`generate_monthly_tasks`)**

---

## Justificación

### Costos

- No genera invocaciones de Edge Functions  
- No requiere infraestructura adicional  
- Uso directo de recursos de la base de datos  

→ opción más económica  

---

### Seguridad

- No expone endpoints HTTP  
- No requiere manejo de tokens  
- No depende de credenciales externas  

→ menor superficie de ataque  

---

### Fiabilidad

- Sin dependencias de red  
- Sin riesgo de fallos HTTP  
- Ejecución directa en la base de datos  

→ mayor robustez para jobs recurrentes  

---

### Simplicidad

- Menos componentes  
- Menor complejidad operativa  
- Fácil debugging desde SQL  

→ menor deuda técnica  

---

### Escalabilidad

- Lógica set-based (joins entre tablas)  
- Adecuado para crecimiento en número de empresas y tareas  
- Bajo volumen de jobs  

→ suficiente para etapa actual  

---

## Diseño implementado

### Flujo

1. `task_templates` define reglas  
2. `company_services` define alcance por empresa  
3. función `generate_monthly_tasks(year, month)`:
   - cruza plantillas + servicios  
   - genera tareas en `tasks`  
   - evita duplicados  
4. `pg_cron` ejecuta la función mensualmente  

---

### Frecuencia

- Ejecución: 1 vez al mes  
- Ejemplo: día 1 a las 06:00  

---

## Consideraciones técnicas

### Idempotencia (crítico)

La función debe evitar duplicados:

- uso de `unique_key`  
- índice único en `tasks`  

Esto permite que el cron:
- pueda ejecutarse más de una vez sin errores  
- sea seguro ante reintentos  

---

### Alcance actual

- Solo tareas mensuales (`frequency = 'monthly'`)  
- No incluye:
  - tareas anuales  
  - SLA  
  - facturación  
  - dependencias entre tareas  

---

## Limitaciones conocidas

- No soporta aún:
  - reglas complejas (ej. días hábiles)  
  - lógica condicional avanzada  
  - integraciones externas  

---

## Evolución futura

Se evaluará migrar a:

👉 **pg_cron → Edge Function**

cuando se requiera:

- integración con APIs externas  
- notificaciones (email, WhatsApp, etc.)  
- lógica compleja no adecuada para SQL  
- observabilidad avanzada  

---

## Estado

- [x] Decisión adoptada  
- [x] Implementación inicial  

---

## Resumen

Para generación de tareas recurrentes:

- se prioriza simplicidad, costo y robustez  
- se evita complejidad prematura  
- se mantiene lógica dentro de la base de datos  

👉 **pg_cron + función SQL es la opción óptima para esta etapa del sistema**