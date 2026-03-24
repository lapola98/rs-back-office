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