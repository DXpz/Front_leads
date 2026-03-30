# Documentación del frontend — Registro de oportunidades (FRONT_LEADS)

Este documento describe **qué hace** la aplicación, **por qué** está organizada así y **cómo** encajan estado local, API y la experiencia del asesor.

---

## 1. Propósito

La aplicación es un **formulario multi-etapa** para registrar y avanzar oportunidades de venta. Debe:

- Obligar a **identificar primero** al cliente u oportunidad (Paso 1) antes de mostrar el ciclo completo.
- Mantener **borrador + historial de envíos** sincronizado con el backend cuando la API está disponible.
- Complementar el formulario con datos del **directorio de oportunidades** y de la **auditoría CRM** cuando existe un identificador común.
- Mostrar un **historial unificado** (envíos guardados + contexto de auditoría cuando la API lo permite).

No hay framework de UI: **TypeScript** puro, **Vite** como bundler y **Tailwind** para estilos. Toda la lógica de pantalla vive principalmente en `src/app.ts`.

---

## 2. Cómo arrancar el proyecto

| Comando        | Uso |
|----------------|-----|
| `npm run dev`  | Servidor de desarrollo (Vite). Por defecto reenvía `/api` a `http://localhost:3001`. |
| `npm run build`| Genera `dist/` para producción. |
| `npm run preview` | Sirve el build local. |

**API base**

- En desarrollo, las rutas `/api/*` se **proxifican** a la API (ver `vite.config.ts`). No hace falta CORS para el navegador en ese caso.
- Si despliegas el front **sin** proxy, puedes definir `VITE_API_BASE_URL` apuntando al servidor de la API (ver comentarios en `src/api.ts`).

### 2.1 Configuración actual (ngrok)

Base activa para API:

- `https://focal-unpointed-hortencia.ngrok-free.dev`

Archivos de referencia en este repo:

- `.env` (uso local).
- `.env.example` (plantilla compartible).

Ejemplo:

```env
VITE_API_BASE_URL=https://focal-unpointed-hortencia.ngrok-free.dev
```

### 2.2 Despliegue en Vercel con ngrok

1. En Vercel, abrir el proyecto del frontend.
2. Ir a **Settings → Environment Variables**.
3. Crear `VITE_API_BASE_URL` con la URL pública de ngrok.
4. Aplicar la variable en `Production` (y opcionalmente `Preview`/`Development`).
5. Hacer **Redeploy** para que el build tome el nuevo valor.

Importante: en plan free de ngrok, la URL cambia al reiniciar el túnel. Cada vez que cambie:

- actualizar `VITE_API_BASE_URL` en Vercel,
- redeploy,
- y actualizar cualquier webhook/cliente externo que apunte a la API.

---

## 3. Estructura de archivos (lo esencial)

```
src/
  main.ts          → Punto de entrada: importa estilos y llama a mountApp()
  app.ts           → Orquestación: gate, formulario, stepper, API, historial, actividades
  api.ts           → Construcción de URLs (`apiUrl`)
  store.ts         → Carga/guardado de AppState: localStorage + PUT/GET /api/state
  types.ts         → Tipos: OpportunityForm, StageEntry, AppState
  migrate.ts       → Normalización de JSON antiguo y filas de historial desde la API
  stages.ts        → Definición de las 6 etapas del embudo
  opportunityForm.ts → Lectura/escritura del DOM del bloque “oportunidad”
  stageQuestions.ts  → Preguntas dinámicas por etapa (y modo solo lectura)
  ui/stepper.ts    → Render del stepper interactivo
  ui/historyTable.ts → Filtros locales y HTML de la tabla de historial
  utils/*          → Formato, CSV, escape HTML
index.html         → Maquetación: Paso 1 (#client-id-gate), workspace (#app-workspace), modales
```

La **única función exportada relevante** para el arranque es `mountApp()` en `app.ts`.

---

## 4. Experiencia del asesor: Paso 1 y workspace

### 4.1 Por qué existe el “Paso 1”

El identificador (en pantalla: **ID del cliente** / nº de oportunidad) es la **clave** que enlaza:

- Directorio (`GET /api/opportunity`)
- Auditoría (`GET /api/audit/by-client/…`)
- Estado persistido (`GET/PUT /api/state`)
- Historial de envíos (`GET /api/history`)

Sin un paso explícito, un asesor podría trabajar sobre el formulario sin haber fijado bien esa clave. Por decisión de producto, **siempre** al entrar en la página:

1. Se muestra el panel **Paso 1 · Identifica la oportunidad** (`#client-id-gate`).
2. El bloque de título/acciones **Registro de lead** (`#app-page-header`) y el **formulario completo** (`#app-workspace`) están **ocultos** hasta que el asesor pulsa **Continuar** (o Enter).

Esto está gobernado por `setGateVisibility(els, gateActive)` en `app.ts`.

### 4.2 Sugerencias sin saltarse el paso

Opcionalmente se **precarga** el campo del Paso 1 con (en este orden de prioridad):

- `?client_id=...` en la URL (`readUrlClientIdParam()`),
- último valor en `sessionStorage` (`lead-session-client-id`),
- nº de oportunidad del borrador en `AppState`.

Aun así **no** se abre el workspace ni se llama a la API de lookup hasta que el usuario confirma con **Continuar** (`applyClientIdAndOpenWorkspace`).

### 4.3 “Cambiar cliente”

El botón **Cambiar cliente** borra la clave de sesión, vuelve a mostrar el Paso 1 y copia el último identificador al campo para que pueda **confirmarlo o cambiarlo** y volver a pulsar Continuar.

---

## 5. Modelo de datos en el navegador (`AppState`)

Definido en `types.ts`:

| Campo               | Significado |
|---------------------|-------------|
| `draft`             | Borrador parcial del formulario (lo que se está editando). |
| `history`           | Lista de envíos (`StageEntry`): cada uno es una “foto” del formulario en una etapa y una fecha. |
| `currentStageIndex` | Índice 0..5 de la etapa seleccionada en el stepper. |

Un **StageEntry** guarda `stageId`, `createdAt` y un `snapshot` completo `OpportunityForm` (incluye `stageData`: respuestas de las preguntas de esa etapa).

La persistencia:

- **localStorage** (`formulario-leads-v2`) — siempre que se llama `saveStateLocal` / `saveState`.
- **Servidor** — `PUT /api/state` con el JSON completo del estado; `GET /api/state` al cargar.

La función `loadState()` en `store.ts` intenta: servidor útil → si no, local; si el servidor está vacío pero el local tiene datos, **sube** el local al servidor. Así se evita perder trabajo por un reinicio de BD durante desarrollo.

### 5.1 Por qué `saveStateSynced` en el envío

Al enviar una etapa se usa **`saveStateSynced`**: guarda en local y **espera** al `PUT /api/state`. Motivo: si inmediatamente después se pide `GET /api/history`, la base ya tiene el estado actualizado y el historial no “parpadea” vacío por una condición de carrera.

---

## 6. Flujo después de “Continuar” (`applyClientIdAndOpenWorkspace`)

Orden lógico:

1. Validar que el campo del Paso 1 no esté vacío.
2. Guardar el id en `sessionStorage` y en `form.opportunityNumber`.
3. **`mergeLoadedCacheFromStateHistory`**: rellena una cache en memoria de respuestas por etapa leyendo el `history` ya cargado en `AppState` para esa oportunidad.
4. **`writeOpportunityForm`**: vuelca el borrador del estado al DOM.
5. Forzar de nuevo el nº de oportunidad al id elegido (coherencia con el Paso 1).
6. **`ensureDefaultDates`**: fechas por defecto si faltan.
7. **`setGateVisibility(false)`**: muestra encabezado + workspace.
8. **`lookupOpportunityAndFill`**: enriquece datos (ver siguiente sección).
9. **`persistDraft`**, **`fullRender`**, **`syncHistorySearchWithOpportunity`**: historial de tabla alineado al mismo identificador.

---

## 7. Enriquecimiento: directorio, auditoría y datos por etapa

### 7.1 Directorio

`GET /api/opportunity?number=...`

Si responde OK, rellena **solo campos vacíos** del formulario (nombre cliente, email, teléfono, vendedor) mediante `fillIfEmpty`, para no pisar lo que el asesor ya escribió.

### 7.2 Auditoría por cliente

`GET /api/audit/by-client/{id}`

- Actualiza la variable global **`crmOpportunityStageIndexFromApi`**: índice 0..5 del embudo según `opportunity_stage` de la API (valores 1..6 en CRM → se resta 1).
- Rellena campos vacíos: cliente, vendedor, asunto, notas, fechas, territorio, etc.

Ese índice alimenta:

- la **barra de probabilidad** y el **stepper** (progreso “CRM”),
- la decisión de si la etapa actual es **editable** o **solo lectura** (ver §8).

### 7.3 Respuestas por etapa desde el estado en servidor

No existe un endpoint dedicado “solo preguntas”. Se usa:

`GET /api/state` → se recorre `history` del JSON y se extraen `stageData` por `stageId` que coincidan en oportunidad / `clientId`. Resultado: **`loadedStageDataCache`**.

`lookupOpportunityAndFill` fusiona directorio + auditoría + esa cache y, si hay etapa CRM conocida, posiciona `currentStageIndex` y el borrador (`draft`) con el último snapshot de esa etapa o los `stageData` cargados.

---

## 8. Stepper, etapa actual y modo solo lectura

- Las etapas están en `stages.ts` (`asignacion` … `cierre`).
- **`furthestReachedStageIndex`**: máximo entre el último envío en `history` local y el índice de la auditoría CRM.
- **`isCurrentStageEditable`**: solo la etapa **igual al “tope” alcanzado** es editable; las anteriores se pueden **navegar** para revisar pero el formulario y las preguntas pasan a solo lectura (`setLeadFormFieldsReadonly`, `readOnly` en `stageQuestions.ts`).

Al hacer clic en otra etapa del stepper:

- Se persiste el borrador actual,
- Se carga snapshot o cache del paso elegido,
- Se guarda con `saveState` y se hace `fullRender`.

El **porcentaje de cierre** mostrado se deriva de la etapa de progreso efectiva (`effectiveProgressIndex`: prioriza CRM si hay dato de auditoría).

---

## 9. Envío del formulario (una etapa)

En el `submit` del formulario (`lead-form`):

1. Comprueba validez HTML5 y que la etapa sea editable.
2. Lee las respuestas de la etapa (`readStageQuestionValues`) y arma un `snapshot` con `readOpportunityForm`.
3. Añade una entrada a `state.history`.
4. Opcionalmente incrementa `currentStageIndex` si “Avanzar etapa al enviar” está marcado.
5. **`saveStateSynced(state)`** — persistencia atómica respecto al historial en servidor.
6. Si hay nº de oportunidad, **`PUT /api/opportunity`** para mantener el directorio alineado.
7. Refresca vista y sincroniza búsqueda de historial.

---

## 10. Tabla “Historial de etapas”

### 10.1 Fuente principal

`paintHistoryTable` llama a:

- `GET /api/history?opportunityNumber={q}&mergeAudit=1`
- Si no hay filas, reintenta con `clientId={q}`.

El parámetro **`mergeAudit=1`** pide al backend fusionar filas “tipo CRM” con los envíos guardados, para una vista más completa (detalle depende de la implementación en API_LEADS).

### 10.2 Fallback

Si la petición falla, se filtran las entradas **`state.history` en memoria** con la misma semántica que la API (`filterHistoryByOpportunityNumber` en `historyTable.ts`).

### 10.3 Búsqueda vacía

Si el campo de búsqueda está vacío, la UI muestra un mensaje de **espera** (no lista todo el historial global por rendimiento y claridad).

### 10.4 Sincronización con el formulario

`syncHistorySearchWithOpportunity` copia el **nº de oportunidad del formulario** al input de búsqueda y repinta la tabla. Se usa tras Continuar, tras enviar etapa y cuando cambia el lookup.

---

## 11. Actividades (agenda)

Las actividades **no** pasan por la API documentada del mismo modo que el estado: se guardan en **localStorage** (`formulario-leads-activities-v1`) agrupadas por número de oportunidad. El modal permite crear/listar/borrar y actualiza el contador en el formulario.

---

## 12. Migración y compatibilidad (`migrate.ts`)

- **`migrateAppStateFromUnknown`**: al leer estado guardado, normaliza estructuras antiguas.
- **`normalizeHistoryRow`**: convierte cada elemento devuelto por `GET /api/history` a un `StageEntry` válido o `null` si no es usable.
- **`snapshotFromUnknown`**: mapea campos legacy (`bpName`, `owner`, etc.) al modelo actual e incluye `clientId` alineado con `opportunityNumber` cuando aplica.

---

## 13. Otros detalles

- **Asesores sugeridos**: `GET /api/metrics/lista-asesores` rellena un `<datalist>` en el campo vendedor.
- **Exportar JSON**: exporta el `AppState` en memoria + metadatos (no sustituye al backup del servidor).
- **Limpiar formulario**: vacía campos del borrador en pantalla; **no** borra historial ni la base (mensaje de confirmación).
- **Numeración local de oportunidad**: si falta número y hay nombre, puede asignarse un contador en `localStorage` (`assignOpportunityNumberIfMissing`); el flujo principal espera que el asesor ya haya fijado el id en el Paso 1.

---

## 14. Resumen mental en una frase

> El front **fija siempre un identificador en el Paso 1**, enriquece el formulario con **directorio + auditoría + estado previo**, guarda cada envío en **`AppState` sincronizado con el servidor**, y muestra el **historial remoto** (con `mergeAudit`) alineado a ese mismo identificador, con **etapas pasadas en solo lectura** cuando el CRM ya avanzó.

Para el contrato exacto de cada endpoint, complementar con la documentación de **API_LEADS** en el repositorio del backend.
