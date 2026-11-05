# Especificación — App de ayuno intermitente (MVP)

> Nombre: **Ayunora** · Dominio: **ayunora.es**. Está inspirada en la funcionalidad de Fastic, pero **no usa su nombre, su marca, sus textos ni sus ilustraciones**.
> Fecha: 2026-11-05 · Estado: borrador v1

## 1. Objetivo

Hacer una PWA sencilla, instalable en el iPhone, para registrar ayunos intermitentes. La app avisa con notificaciones push de la hora de empezar, de los hitos durante el ayuno y del final. Guarda el historial y el peso, y muestra estadísticas.

**Usuarios:** uso personal. Cada cuenta tiene sus datos separados y solo se crean con invitación, por si alguien más de casa la usa. No es un producto público.

### No-objetivos del MVP

- Ni dietas, ni recetas, ni contador de calorías, ni registro de agua.
- Ni integración con Apple Health (una PWA no tiene acceso).
- Ni funcionamiento offline completo (ver §8).
- Ni registro abierto: solo se crean cuentas con código de invitación.

## 2. Plataforma y restricciones clave

| Restricción                                                                                                     | Consecuencia en el diseño                                                                                                           |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Una PWA en iOS **no puede programar notificaciones locales**.                                                   | Todas las notificaciones son **Web Push enviadas desde el servidor** a su hora. Hace falta un planificador en el backend.           |
| En iOS, el Web Push solo funciona si la PWA está **instalada** en la pantalla de inicio (iOS 16.4 o posterior). | Un onboarding guía la instalación. El permiso de notificaciones se pide **dentro de la app instalada y tras un toque del usuario**. |
| iOS suspende la app en segundo plano.                                                                           | El temporizador **siempre se calcula desde `started_at`**, nunca con un contador que avanza.                                        |
| En iOS, la PWA instalada tiene sus propias cookies, separadas de Safari.                                        | El login se hace **dentro de la PWA**. Por eso se descarta el enlace mágico por email.                                              |
| En iOS, si llega un push y no se muestra notificación, el sistema puede revocar la suscripción.                 | El service worker **siempre** muestra una notificación al recibir un push.                                                          |
| El VPS tiene 1 vCore, ~800 MiB de RAM libres y lo comparte con 6 sitios WordPress.                              | Un solo proceso Node ligero, con un objetivo de menos de 120 MB de RSS y `MemoryMax` en systemd.                                    |

## 3. Stack

- **Frontend:** Vite + React + TypeScript, `vite-plugin-pwa` (injectManifest, con service worker propio para push), TanStack Query, React Router, Tailwind CSS. Gráficos con Recharts o SVG propio (por decidir según el peso del bundle).
- **Backend:** Hono sobre `@hono/node-server` (Node 24 LTS), Drizzle ORM con `better-sqlite3` en modo WAL, `web-push` (VAPID), `@node-rs/argon2` para las contraseñas y `zod` para validar, compartido con el cliente.
- **Planificador:** un bucle dentro del mismo proceso que lee la tabla `notification_jobs` (ver §6). Sin Redis ni colas externas.
- **Despliegue:** un único proceso Node que sirve la API (`/api/*`) y los estáticos de la SPA. Corre como servicio **systemd** en el VPS de IONOS, detrás del Nginx de WordOps y de Cloudflare.
- **Estructura:** un solo paquete con `src/web`, `src/server` y `src/shared` (tipos, esquemas zod, lógica de fases y planes).

## 4. Funcionalidades (MVP)

### 4.1 Cuentas

- **Registro** con email, contraseña (mínimo 8 caracteres), nombre y **código de invitación**, que es una variable de entorno (`INVITE_CODE`).
- **Login y logout.** La sesión es una cookie `httpOnly`, `Secure` y `SameSite=Lax` que dura 1 año y se renueva con el uso. Los tokens de sesión se guardan hasheados.
- La **zona horaria** del usuario se toma del navegador (`Intl.DateTimeFormat().resolvedOptions().timeZone`) y se puede editar en Ajustes.
- Límite de intentos de login: como máximo 10 por IP cada 15 minutos (en memoria).

### 4.2 Planes de ayuno

| Plan          | Ayuno                            | Ventana para comer |
| ------------- | -------------------------------- | ------------------ |
| 16:8          | 16 h                             | 8 h                |
| 18:6          | 18 h                             | 6 h                |
| 20:4          | 20 h                             | 4 h                |
| OMAD (23:1)   | 23 h                             | 1 h                |
| Personalizado | de 1 a 72 h, en saltos de 15 min | —                  |

- El usuario tiene un **plan por defecto** en Ajustes.
- Al empezar un ayuno se puede cambiar el plan solo para ese ayuno.
- El objetivo se **copia en el ayuno** (`goal_minutes`), de modo que cambiar el plan después no altera el historial.

### 4.3 Temporizador (pantalla principal)

- **Sin ayuno activo:** se ven el plan seleccionado, el botón grande «Empezar ayuno», el tiempo desde el último ayuno («Comiendo desde hace 3 h 20 min») y la opción «Empecé antes…» para elegir la hora de inicio en el pasado.
- **Con ayuno activo:**
  - Un anillo de progreso con el tiempo transcurrido, el tiempo restante y el porcentaje.
  - La hora de inicio y la hora objetivo de fin («Terminas a las 12:30»).
  - La **fase actual** (§4.4), con su descripción breve y la siguiente fase («Cetosis en 2 h 10 min»).
  - El botón «Terminar ayuno». Si el objetivo no se ha cumplido, pide confirmación.
  - Se puede **editar la hora de inicio** del ayuno en curso.
- Al pasar el objetivo, el anillo indica «¡Objetivo cumplido!» y sigue contando el tiempo extra.
- Al terminar se muestra un resumen: la duración, si se cumplió el objetivo y la racha actual. Opcionalmente se puede pedir el peso del día.
- Solo puede haber **un ayuno activo por usuario**. Lo garantiza la BD con un índice único parcial.

### 4.4 Fases del ayuno

Contenido informativo. Los textos son propios y llevan un aviso de que no son consejo médico.

| Desde | Fase             | Idea clave                                                        |
| ----- | ---------------- | ----------------------------------------------------------------- |
| 0 h   | Digestión        | El cuerpo procesa la última comida y sube el azúcar en sangre.    |
| 4 h   | Bajada de azúcar | Se estabiliza la insulina y empieza a usar reservas de glucógeno. |
| 12 h  | Quema de grasa   | El glucógeno se agota y aumenta el uso de grasa como energía.     |
| 18 h  | Cetosis          | Aumenta la producción de cuerpos cetónicos.                       |
| 24 h  | Autofagia        | Se intensifican los procesos de reciclaje celular.                |

- Las fases se definen en `src/shared/phases.ts`, que es la única fuente de verdad para la UI y para los hitos de notificación.

### 4.5 Notificaciones

Todas se pueden configurar en Ajustes, por tipo y por usuario.

| Tipo                    | Cuándo                                                                              | Ejemplo de texto                                   | Por defecto                             |
| ----------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------- |
| **Fin de ayuno**        | `started_at + goal`                                                                 | «¡Lo has conseguido! 16 h de ayuno completadas 🎉» | activado                                |
| **Aviso previo**        | `fin − N min` (N configurable: 15, 30 o 60)                                         | «Te quedan 30 min para completar tu ayuno»         | activado, 30 min                        |
| **Hitos**               | Al entrar en cada fase (§4.4) **antes** del objetivo                                | «Llevas 12 h: has entrado en quema de grasa 🔥»    | activado                                |
| **Recordatorio diario** | A una hora local configurable (por ejemplo, 20:00), **solo si no hay ayuno activo** | «¿Empezamos el ayuno de hoy?»                      | desactivado; se activa en el onboarding |

- Al tocar una notificación se abre la PWA en la pantalla del temporizador.
- Ajustes incluye el botón **«Enviar notificación de prueba»**.
- Se admiten varios dispositivos por usuario: se envía a todas sus suscripciones. Las que responden 404 o 410 se borran.

### 4.6 Historial

- Lista de ayunos (los más recientes primero), con fecha, duración, objetivo, ✓ o ✗ según si se cumplió el objetivo, y la nota.
- Se puede **editar** el inicio, el fin, el objetivo y la nota. Hay validación: el fin es posterior al inicio, la duración no supera 7 días y no puede solaparse con otro ayuno del mismo usuario.
- Se puede **borrar** un ayuno, con confirmación.
- Se pueden **añadir ayunos pasados a mano**, por si se olvidó registrarlos.

### 4.7 Estadísticas

- **Racha actual y mejor racha:** días consecutivos con al menos un ayuno que cumplió su objetivo. El día se asigna por la **fecha de fin en la zona horaria del usuario**.
- **Gráfico semanal:** las horas de ayuno de cada uno de los últimos 7 días, con una línea en el objetivo.
- **Medias:** la duración media en los últimos 7 y 30 días, y el porcentaje de objetivos cumplidos.
- **Totales:** número de ayunos, horas acumuladas y el ayuno más largo.

### 4.8 Peso

- Registro de peso en kg, con un decimal: fecha, valor y nota opcional. Se admite un registro por día; si se mete otro el mismo día, se sobrescribe.
- Gráfico de evolución (30 días, 90 días o todo), con el peso actual, la variación desde el primer registro y la variación de los últimos 30 días.
- **Peso objetivo** opcional, que aparece como línea en el gráfico.

### 4.9 Ajustes

- Nombre, zona horaria y plan por defecto.
- Notificaciones: activar o desactivar cada tipo, elegir los minutos del aviso previo y la hora del recordatorio diario.
- Estado del push en este dispositivo (activado, denegado o no instalada), con el botón para activarlo y el de prueba.
- Peso objetivo.
- Cerrar sesión.

### 4.10 Onboarding (primera vez)

1. Si se abre en Safari sin instalar, se muestra una guía visual: «Compartir → Añadir a pantalla de inicio».
2. Ya dentro de la PWA instalada, se pasa al login o al registro.
3. Se elige el plan por defecto.
4. «Activa las notificaciones»: un botón que lanza `Notification.requestPermission()` y suscribe el dispositivo.
5. Recordatorio diario, que es opcional (se elige la hora).

## 5. Modelo de datos (SQLite + Drizzle)

Todas las fechas se guardan como **enteros con milisegundos UTC**. Para la lógica de calendario se usa la zona horaria del usuario.

```
users               id, email (unique, lowercase), password_hash, name, timezone, created_at
sessions            id (sha256 del token), user_id → users, expires_at, created_at, last_seen_at, user_agent
settings            user_id (PK) → users, default_plan, custom_goal_minutes,
                    notify_goal, notify_pre_end, pre_end_minutes, notify_milestones,
                    reminder_enabled, reminder_time ('HH:MM'), weight_goal_kg
fasts               id, user_id → users, started_at, ended_at (null = activo), goal_minutes, plan,
                    note, created_at, updated_at
                    UNIQUE INDEX (user_id) WHERE ended_at IS NULL
                    INDEX (user_id, started_at)
weights             id, user_id → users, day ('YYYY-MM-DD' local), kg (real), note, created_at
                    UNIQUE (user_id, day)
push_subscriptions  id, user_id → users, endpoint (unique), p256dh, auth, user_agent,
                    created_at, last_success_at
notification_jobs   id, user_id → users, fast_id → fasts (nullable), kind
                    ('goal'|'pre_end'|'milestone'|'daily_reminder'), payload (json),
                    send_at, status ('pending'|'sent'|'canceled'|'failed'), attempts, sent_at
                    INDEX (status, send_at)
```

## 6. Planificador de notificaciones

- **Al empezar un ayuno** (o al editar su inicio u objetivo), en una única transacción:
  1. Se cancelan los jobs `pending` de ese ayuno.
  2. Se crean los jobs nuevos: `goal`, `pre_end` (solo si cae en el futuro y está activado) y un `milestone` por cada fase cuyo inicio caiga después de ahora y antes del objetivo.
- **Al terminar o borrar un ayuno:** se cancelan sus jobs `pending`.
- **Recordatorio diario:** se mantiene siempre un único job `pending` por usuario, el de la próxima ocurrencia en su zona horaria (con los cambios de hora resueltos por la librería de fechas). Al enviarse o al cambiar los ajustes, se programa el siguiente. En el momento del envío, **si hay un ayuno activo se omite** y se reprograma.
- **Bucle de envío:** cada 15 s se buscan los jobs `pending` con `send_at <= now`, se envían, se marcan como `sent` y, en caso de error, se reintenta como máximo 3 veces.
- **Tras un reinicio o una caída:** los jobs con más de 15 min de retraso se envían solo si son `goal`. Los `milestone`, `pre_end` y `daily_reminder` atrasados se marcan como `canceled`, porque ya no aportan.
- Con un solo proceso no hace falta ningún bloqueo. Si algún día hubiera más de uno, se reclamaría el job con `UPDATE … WHERE status='pending'`.

## 7. API (Hono, prefijo `/api`, JSON validado con zod)

```
POST   /auth/register        {email, password, name, inviteCode, timezone}
POST   /auth/login           {email, password}
POST   /auth/logout
GET    /me                   → usuario + settings

GET    /fasts/active
POST   /fasts                {startedAt?, plan, goalMinutes}        → inicia el ayuno (409 si ya hay uno activo)
POST   /fasts/:id/stop       {endedAt?}
POST   /fasts/manual         {startedAt, endedAt, goalMinutes, plan, note?}
PATCH  /fasts/:id            {startedAt?, endedAt?, goalMinutes?, note?}
DELETE /fasts/:id
GET    /fasts?before=&limit=     (paginación por cursor)

GET    /stats/summary        → racha, mejor racha, medias, totales, últimos 7 días

GET    /weights?from=&to=
PUT    /weights/:day         {kg, note?}
DELETE /weights/:day

GET    /settings
PATCH  /settings

GET    /push/public-key
POST   /push/subscriptions   {endpoint, keys:{p256dh, auth}}
DELETE /push/subscriptions   {endpoint}
POST   /push/test
GET    /health               (sin autenticación; para la monitorización)
```

Seguridad:

- Todas las rutas, salvo `auth/*`, `push/public-key` y `health`, exigen sesión.
- Las peticiones que modifican datos comprueban la cabecera `Origin` (protección CSRF, además de `SameSite`).
- Todos los accesos se filtran por `user_id`.

## 8. PWA y comportamiento offline

- El manifest incluye `display: standalone`, `start_url: /`, iconos de 192 y 512 px (también _maskable_), un `apple-touch-icon` de 180 px y colores de tema. Las splash screens de iOS son opcionales.
- Service worker:
  - Precachea el _app shell_.
  - Usa la estrategia `NetworkFirst` para `GET /api/*`, con un tiempo de espera corto y la última respuesta en caché, para que el temporizador se vea aunque no haya red.
  - Gestiona `push` y `notificationclick`.
- **Offline en el MVP:** se puede consultar el estado (el temporizador sigue calculándose en local desde `started_at`), pero empezar, terminar o editar requiere red; si no la hay, aparece un aviso «Sin conexión». La cola de acciones offline queda para la v2.
- Al volver a primer plano (`visibilitychange`), se refrescan los datos.
- El _badge_ del icono (`navigator.setAppBadge`) es opcional y muestra un punto mientras hay un ayuno activo.

## 9. Interfaz

- Idioma: **español**. Formato de 24 h y kg.
- Navegación con una barra inferior de 4 pestañas: **Ayuno · Historial · Peso · Ajustes**. Las estadísticas van arriba, dentro de Historial.
- Pensada primero para el móvil, con _safe areas_ para iOS (`env(safe-area-inset-*)`), objetivos táctiles de 44 px o más y modo oscuro automático.
- Estética propia: colores cálidos y tipografía redondeada, **sin copiar el diseño de Fastic**.

## 10. Requisitos no funcionales

- La pantalla del temporizador se puede usar en menos de 1 s tras abrir la PWA instalada (gracias al _app shell_ en caché).
- El push llega con un margen de ±1 min sobre la hora prevista.
- El proceso Node consume menos de 120 MB de RSS en reposo.
- Backups diarios de la BD, integrados en el restic y R2 que ya existen en el VPS.
- Tests (Vitest) de la lógica de dominio: fases, cálculo de jobs, racha, estadísticas, zonas horarias y cambios de hora.

## 11. Decisiones abiertas

1. ~~Dominio~~ → **ayunora.es** (resuelto 2026-11-05).
2. ~~Nombre~~ → **Ayunora** (resuelto). Falta el icono definitivo.
3. Gráficos: Recharts (más cómodo, unos 100 kB) o SVG propio (más ligero). Se decide en el M3.
