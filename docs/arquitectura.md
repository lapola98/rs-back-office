# Arquitectura

## 1. Visión general

Aplicación web tipo SaaS para gestión de back office multi-cliente.

El sistema permite a múltiples clientes (tenants) operar dentro de una misma plataforma, gestionando datos, procesos y documentos de forma centralizada.

Arquitectura orientada a MVP:
- Prioriza velocidad de desarrollo
- Baja complejidad técnica
- Escalable de forma progresiva

---

## 2. Componentes del sistema

### Frontend
- HTML + JavaScript
- Maneja la interfaz de usuario
- Consume directamente servicios de Supabase
- Contiene lógica de presentación y parte de la lógica operativa
- Desplegado en Vercel (hosting, CDN y despliegue continuo)

**Nota:** La lógica crítica no debería depender completamente del frontend (a mejorar progresivamente)

---

### Backend (Supabase)

#### Base de datos
- PostgreSQL gestionado por Supabase
- Fuente única de verdad del sistema

#### Autenticación
- Supabase Auth
- Manejo de usuarios, sesiones y acceso

#### Storage
- Supabase Storage
- Almacenamiento de archivos (ej. extractos de clientes)

#### Seguridad
- Row Level Security (RLS)
- Control de acceso basado en cliente (multi-tenant)

---

## 3. Modelo de datos (conceptual)

Arquitectura multi-tenant basada en separación lógica.

### Principios:
- Todas las tablas relevantes incluyen:
  - `client_id`
  - `created_at`
  - `created_by` (recomendado)

### Entidades principales:
- clientes
- usuarios
- registros operativos (según módulos)
- archivos/documentos

### Relaciones:
- Un cliente tiene múltiples usuarios
- Un usuario pertenece a uno o más clientes (según modelo)
- Todos los datos están aislados por `client_id`

---

## 4. Multi-tenancy

Estrategia actual:
- Single database (Postgres)
- Separación lógica por `client_id`

### Control de acceso:
- Implementado mediante RLS (Row Level Security)

### Riesgos:
- Fuga de datos si RLS está mal configurado
- Dependencia de disciplina en queries y políticas

---

## 5. Manejo de archivos (extractos)

- Archivos almacenados en Supabase Storage
- Base de datos guarda:
  - metadata del archivo
  - relación con cliente (`client_id`)
  - estado/procesamiento (si aplica)

### Consideración:
Evitar procesar archivos directamente desde frontend en lógica compleja

---

## 6. Lógica de negocio

Estado actual:
- Distribuida entre frontend y base de datos

### Riesgos:
- Duplicación de lógica
- Difícil mantenimiento

### Objetivo futuro:
- Centralizar lógica crítica
- Reducir dependencia del frontend

---

## 7. Flujo general del sistema

1. Usuario inicia sesión (Supabase Auth)
2. Se identifica el cliente (tenant)
3. Frontend consulta datos
4. Supabase aplica RLS según `client_id`
5. Usuario interactúa con información del sistema
6. Archivos se cargan en Storage y se registran en DB

---

## 8. Estado actual de la arquitectura

- Arquitectura simple y funcional
- Optimizada para velocidad
- Adecuada para MVP y primeras etapas

### Limitaciones actuales:
- Lógica de negocio parcialmente descentralizada
- Dependencia directa de Supabase
- Sin capa backend intermedia

---

## 9. Consideraciones futuras (no implementar aún)

- Backend propio (API intermedia)
- Procesamiento asíncrono (jobs/colas)
- Sistema robusto de roles y permisos
- Auditoría completa de acciones
- Modularización del sistema

---

## 10. Principios de diseño

- Simplicidad sobre complejidad
- Velocidad sobre optimización temprana
- Multi-tenant desde el inicio
- Evitar sobrearquitectura
- Mantener portabilidad futura (evitar lock-in innecesario)