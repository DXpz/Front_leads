# Envío de Etapas a la API

El formulario unificado (`OpportunityForm`) se envía completo en cada etapa como `snapshot` dentro del `stage_feedback_json`. Cada etapa tiene su propio endpoint y payload específico.

---

## Flujo Común de Submit

1. **syncStageToApi()** → Writes a `/api/audit/client/...` (fuente de verdad del dashboard)
2. **saveStateSynced()** → PUT `/api/state` (persiste UI local)
3. **apiFetch('/api/opportunity', PUT)** → actualiza datos del cliente/oportunidad

---

## Etapa 1: Asignación

- **ID**: `asignacion`
- **Etiqueta**: Asignación
- **Tipo**: Automática (solo lectura)
- **Endpoint**: No se envía directamente
- **Origen de datos**: GET desde `/api/opportunity` y `/api/audit/by-client/{clientId}`

---

## Etapa 2: Reunión

- **ID**: `reunion`
- **Etiqueta**: Reunión
- **Endpoint**: `PATCH /api/audit/client/{clientId}/retroalimentacion`

### Payload enviado:

```json
{
  "stage": 2,
  "retroalimentacion": "temas_tratados | productos_ofrecidos | asistentes_reunion",
  "stage_feedback_json": {
    "2": {
      "temas_tratados": "...",
      "productos_ofrecidos": "...",
      "asistentes_reunion": "...",
      ...
    }
  }
}
```

### Efecto en API:
- Setea `advisor_feedback_at`
- Detiene alertas del auditor

---

## Etapa 3: Propuesta

- **ID**: `propuesta`
- **Etiqueta**: Propuesta
- **Endpoint**: `PUT /api/audit/client/{clientId}/propuesta`

### Payload enviado:

```json
{
  "resumen_general": "productos_propuestos",
  "tipo_propuesta": "tipo_solucion",
  "equipos": "modelo_equipo_propuesto xcantidad",
  "rubro": "industria_sector",
  "cantidad_oferta": "$valor_propuesta",
  "stage_feedback_json": {
    "3": {
      "productos_propuestos": "...",
      "tipo_solucion": "...",
      "modelo_equipo_propuesto": "...",
      "valor_propuesta": "...",
      ...
    }
  }
}
```

### Efecto en API:
- Alimenta gráfica "propuestas por rubro"
- Avanza stage a 4 en el CRM

---

## Etapa 4: Seguimiento

- **ID**: `seguimiento`
- **Etiqueta**: Seguimiento de propuesta
- **Endpoint**: `PUT /api/audit/client/{clientId}/seguimiento`

### Payload enviado:

```json
{
  "resultado_venta": "en_seguimiento",
  "resumen_general": "proximo_paso",
  "cliente_interesado": true,
  "cliente_ha_negociado": true,
  "motivo_perdida": "objeciones",
  "stage_feedback_json": {
    "5": {
      "proximo_paso": "...",
      "nivel_avance": "muy_cerca|estancado|en_riesgo",
      "objeciones": "...",
      ...
    }
  }
}
```

### Efecto en API:
- Avanza stage a 5 en el CRM
- Actualiza métricas de seguimiento

---

## Etapa 5: Cierre

- **ID**: `cierre`
- **Etiqueta**: Cierre
- **Endpoint**: `PUT /api/audit/client/{clientId}/seguimiento`

### Payload enviado:

```json
{
  "resultado_venta": "cerrada|perdida|en_seguimiento",
  "motivo_perdida": "razon_cierre u objeciones",
  "resumen_general": "razon_cierre",
  "cliente_interesado": true,
  "cliente_ha_negociado": true,
  "stage_feedback_json": {
    "6": {
      "resultado_cierre": "ganado|perdido|en_pausa",
      "razon_cierre": "...",
      "objeciones": "...",
      ...
    }
  }
}
```

### Efecto en API:
- Avanza stage a 6 en el CRM
- Alimenta ventas cerradas/perdidas y motivos

---

## mapeo de Nivel de Avance

| Valor en Formulario | `cliente_interesado` | `cliente_ha_negociado` |
|---------------------|---------------------|-----------------------|
| `muy_cerca`         | true                | true                  |
| `en_negociacion`   | true                | true                  |
| `estancado`         | true                | false                 |
| `en_riesgo`         | false               | false                 |

---

## Mapeo de Resultado de Cierre

| Valor en Formulario | `resultado_venta` |
|---------------------|------------------|
| `ganado`            | `cerrada`         |
| `perdido`           | `perdida`         |
| `en_pausa`          | `en_seguimiento`  |

---

## Referencias

- Código fuente: `src/app.ts` (función `syncStageToApi`, líneas 1044-1143)
- Tipos: `src/types.ts`
- Definición de etapas: `src/stages.ts`