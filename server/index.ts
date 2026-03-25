import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { pool } from '../db/index.js';
import { startMeetingAuditor } from './auditor.js';

const PORT = Number(process.env.PORT) || 3001;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Falta DATABASE_URL en .env (ej. postgresql://postgres:postgres@localhost:5433/formulario_leads)');
  process.exit(1);
}

const defaultPayload = () =>
  ({
    draft: {},
    history: [],
    currentStageIndex: 0,
  }) as const;

async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_app_state (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS opportunity_directory (
      opportunity_number TEXT PRIMARY KEY,
      client_name TEXT NOT NULL DEFAULT '',
      client_email TEXT NOT NULL DEFAULT '',
      client_phone TEXT NOT NULL DEFAULT '',
      seller_name TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audits (
      id BIGSERIAL PRIMARY KEY,
      client_id TEXT NOT NULL DEFAULT '',
      client_name TEXT NOT NULL DEFAULT '',
      client_email TEXT NOT NULL DEFAULT '',
      client_phone TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      start_time TIMESTAMPTZ,
      end_time TIMESTAMPTZ,
      description TEXT NOT NULL DEFAULT '',
      validator_source TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      meeting_day TEXT NOT NULL DEFAULT '',
      advisor_name TEXT NOT NULL DEFAULT '',
      advisor_status TEXT NOT NULL DEFAULT 'pending',
      status TEXT NOT NULL DEFAULT 'pending',
      reminder_minutes INTEGER NOT NULL DEFAULT 15,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    ALTER TABLE audits
    ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE audits
    ADD COLUMN IF NOT EXISTS advisor_name TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE audits
    ADD COLUMN IF NOT EXISTS advisor_status TEXT NOT NULL DEFAULT 'pending';
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'opportunity_number_seq') THEN
        CREATE SEQUENCE opportunity_number_seq START 1;
      END IF;
    END $$;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS opportunity_activities (
      id UUID PRIMARY KEY,
      opportunity_number TEXT NOT NULL REFERENCES opportunity_directory(opportunity_number) ON DELETE CASCADE,
      title TEXT NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS opportunity_activities_by_opp
      ON opportunity_activities (opportunity_number, scheduled_at);
  `);
  await pool.query(`
    INSERT INTO lead_app_state (id, payload)
    VALUES (1, $1::jsonb)
    ON CONFLICT (id) DO NOTHING;
  `, [JSON.stringify(defaultPayload())]);
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Recibe datos de auditoria desde Make y los guarda en PostgreSQL.
app.post('/api/audit', async (req, res) => {
  const {
    client_id,
    nombre, correo, telefono, asunto,
    ubicacion, fecha_inicio, fecha_fin,
    descripcion, validador, pais, dia_reunion,
    asesor,
  } = (req.body ?? {}) as Record<string, unknown>;

  try {
    const query = `
      INSERT INTO audits (
        client_id, client_name, client_email, client_phone, subject,
        location, start_time, end_time, description,
        validator_source, country, meeting_day, advisor_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, client_id
    `;

    const result = await pool.query(query, [
      String(client_id ?? ''),
      String(nombre ?? ''),
      String(correo ?? ''),
      String(telefono ?? ''),
      String(asunto ?? ''),
      String(ubicacion ?? ''),
      fecha_inicio ? new Date(String(fecha_inicio)) : null,
      fecha_fin ? new Date(String(fecha_fin)) : null,
      String(descripcion ?? ''),
      String(validador ?? ''),
      String(pais ?? ''),
      String(dia_reunion ?? ''),
      String(asesor ?? ''),
    ]);

    const row = result.rows[0] as { id: number; client_id: string };
    res.json({
      ok: true,
      message: 'Auditoria registrada correctamente',
      id: row?.id,
      client_id: row?.client_id,
    });
  } catch (e) {
    console.error('Error en /api/audit:', e);
    res.status(500).json({ error: 'Error al registrar auditoria' });
  }
});

// Actualiza estado del asesor ('accepted' o 'declined') para una auditoria.
app.patch('/api/audit/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = (req.body ?? {}) as { status?: unknown };

  if (status !== 'accepted' && status !== 'declined') {
    res.status(400).json({ error: "status debe ser 'accepted' o 'declined'" });
    return;
  }

  try {
    const result = await pool.query(
      `
      UPDATE audits
      SET advisor_status = $1
      WHERE id = $2
      RETURNING id, client_id, client_name, advisor_name, advisor_status, created_at
      `,
      [status, id],
    );

    const row = result.rows[0] as
      | {
          id: number;
          client_id: string;
          client_name: string;
          advisor_name: string;
          advisor_status: string;
          created_at: string;
        }
      | undefined;

    if (!row) {
      res.status(404).json({ error: 'Auditoria no encontrada' });
      return;
    }

    res.json({
      ok: true,
      message: `Estado actualizado a ${status}`,
      id: row.id,
      client_id: row.client_id,
      advisor_status: row.advisor_status,
    });
  } catch (e) {
    console.error('Error en PATCH /api/audit/:id/status:', e);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

// Actualiza estado del asesor buscando por `client_id`.
// Útil cuando Make solo conoce el id del cliente, pero no el id interno de `audits`.
app.patch('/api/audit/client/:client_id/status', async (req, res) => {
  const { client_id } = req.params;
  const { status } = (req.body ?? {}) as { status?: unknown };

  if (status !== 'accepted' && status !== 'declined') {
    res.status(400).json({ error: "status debe ser 'accepted' o 'declined'" });
    return;
  }

  try {
    const result = await pool.query(
      `
      WITH target AS (
        SELECT id
        FROM audits
        WHERE client_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      )
      UPDATE audits
      SET advisor_status = $1
      WHERE id IN (SELECT id FROM target)
      RETURNING id, client_id, client_name, advisor_name, advisor_status, created_at
      `,
      [status, client_id],
    );

    const row = result.rows[0] as
      | {
          id: number;
          client_id: string;
          client_name: string;
          advisor_name: string;
          advisor_status: string;
          created_at: string;
        }
      | undefined;

    if (!row) {
      res.status(404).json({ error: 'Auditoria no encontrada para ese client_id' });
      return;
    }

    res.json({
      ok: true,
      message: `Estado actualizado a ${status}`,
      id: row.id,
      client_id: row.client_id,
      advisor_status: row.advisor_status,
    });
  } catch (e) {
    console.error('Error en PATCH /api/audit/client/:client_id/status:', e);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

// Actualiza solo el nombre del asesor (`audits.advisor_name`) para una auditoria.
// No toca `advisor_status`.
app.patch('/api/audit/:id/advisor-name', async (req, res) => {
  const { id } = req.params;
  const body = (req.body ?? {}) as Record<string, unknown>;

  const rawName =
    body.advisor_name ?? body.asesor ?? body.advisorName ?? body.name ?? null;
  const advisorName = rawName == null ? '' : String(rawName).trim();

  if (!advisorName) {
    res.status(400).json({ error: "Falta advisor_name" });
    return;
  }

  try {
    const result = await pool.query(
      `
      UPDATE audits
      SET advisor_name = $1
      WHERE id = $2
      RETURNING id, client_id, client_name, advisor_name, advisor_status, created_at
      `,
      [advisorName, id],
    );

    const row = result.rows[0] as
      | {
          id: number;
          client_id: string;
          client_name: string;
          advisor_name: string;
          advisor_status: string;
          created_at: string;
        }
      | undefined;

    if (!row) {
      res.status(404).json({ error: 'Auditoria no encontrada' });
      return;
    }

    res.json({
      ok: true,
      message: 'Advisor name actualizado',
      id: row.id,
      client_id: row.client_id,
      advisor_name: row.advisor_name,
    });
  } catch (e) {
    console.error('Error en PATCH /api/audit/:id/advisor-name:', e);
    res.status(500).json({ error: 'Error al actualizar el nombre' });
  }
});

// Actualiza solo el nombre del asesor (`audits.advisor_name`) buscando por `client_id`.
// No toca `advisor_status`.
app.patch('/api/audit/client/:client_id/advisor-name', async (req, res) => {
  const { client_id } = req.params;
  const body = (req.body ?? {}) as Record<string, unknown>;

  const rawName =
    body.advisor_name ?? body.asesor ?? body.advisorName ?? body.name ?? null;
  const advisorName = rawName == null ? '' : String(rawName).trim();

  if (!advisorName) {
    res.status(400).json({ error: "Falta advisor_name" });
    return;
  }

  try {
    const result = await pool.query(
      `
      WITH target AS (
        SELECT id
        FROM audits
        WHERE client_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      )
      UPDATE audits
      SET advisor_name = $1
      WHERE id IN (SELECT id FROM target)
      RETURNING id, client_id, client_name, advisor_name, advisor_status, created_at
      `,
      [advisorName, client_id],
    );

    const row = result.rows[0] as
      | {
          id: number;
          client_id: string;
          client_name: string;
          advisor_name: string;
          advisor_status: string;
          created_at: string;
        }
      | undefined;

    if (!row) {
      res.status(404).json({ error: 'Auditoria no encontrada para ese client_id' });
      return;
    }

    res.json({
      ok: true,
      message: 'Advisor name actualizado',
      id: row.id,
      client_id: row.client_id,
      advisor_name: row.advisor_name,
    });
  } catch (e) {
    console.error('Error en PATCH /api/audit/client/:client_id/advisor-name:', e);
    res.status(500).json({ error: 'Error al actualizar el nombre' });
  }
});

app.get('/api/state', async (_req, res) => {
  try {
    const { rows } = await pool.query<{ payload: unknown }>(
      'SELECT payload FROM lead_app_state WHERE id = 1',
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: 'no estado' });
      return;
    }
    res.json(row.payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'no se pudo leer el estado' });
  }
});

app.put('/api/state', async (req, res) => {
  try {
    const body = req.body as unknown;
    if (typeof body !== 'object' || body === null) {
      res.status(400).json({ error: 'JSON inválido' });
      return;
    }
    await pool.query(
      `UPDATE lead_app_state SET payload = $1::jsonb, updated_at = now() WHERE id = 1`,
      [JSON.stringify(body)],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'no se pudo guardar' });
  }
});

type OpportunityDirectoryRow = {
  opportunity_number: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  seller_name: string;
  updated_at: string;
};

function normKey(s: string): string {
  return s.trim();
}

/** Obtiene datos de cliente/vendedor por nº de oportunidad. */
app.get('/api/opportunity', async (req, res) => {
  try {
    const num = normKey(String(req.query.number ?? ''));
    if (!num) {
      res.status(400).json({ error: 'Falta number' });
      return;
    }
    const { rows } = await pool.query<OpportunityDirectoryRow>(
      `SELECT opportunity_number, client_name, client_email, client_phone, seller_name, updated_at
       FROM opportunity_directory
       WHERE opportunity_number = $1`,
      [num],
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: 'no encontrado' });
      return;
    }
    res.json({
      opportunityNumber: row.opportunity_number,
      clientName: row.client_name,
      clientEmail: row.client_email,
      clientPhone: row.client_phone,
      sellerName: row.seller_name,
      updatedAt: row.updated_at,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'no se pudo buscar la oportunidad' });
  }
});

/** Guarda/actualiza cliente y vendedor asociados al nº de oportunidad. */
app.put('/api/opportunity', async (req, res) => {
  try {
    const body = req.body as unknown;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'JSON inválido' });
      return;
    }
    const b = body as Record<string, unknown>;
    const opportunityNumber = normKey(String(b.opportunityNumber ?? ''));
    if (!opportunityNumber) {
      res.status(400).json({ error: 'Falta opportunityNumber' });
      return;
    }
    const clientName = String(b.clientName ?? '').trim();
    const clientEmail = String(b.clientEmail ?? '').trim();
    const clientPhone = String(b.clientPhone ?? '').trim();
    const sellerName = String(b.sellerName ?? '').trim();

    await pool.query(
      `INSERT INTO opportunity_directory (
         opportunity_number, client_name, client_email, client_phone, seller_name
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (opportunity_number) DO UPDATE SET
         client_name = EXCLUDED.client_name,
         client_email = EXCLUDED.client_email,
         client_phone = EXCLUDED.client_phone,
         seller_name = EXCLUDED.seller_name,
         updated_at = now()`,
      [opportunityNumber, clientName, clientEmail, clientPhone, sellerName],
    );

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'no se pudo guardar la oportunidad' });
  }
});

/** Devuelve el próximo número de oportunidad (autonumérico). */
app.get('/api/opportunity/next-number', async (_req, res) => {
  try {
    const { rows } = await pool.query<{ n: string }>(`SELECT nextval('opportunity_number_seq')::text as n`);
    res.json({ opportunityNumber: rows[0]?.n ?? '' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'no se pudo generar número' });
  }
});

type OpportunityActivityRow = {
  id: string;
  opportunity_number: string;
  title: string;
  scheduled_at: string;
  notes: string;
  created_at: string;
};

/** Lista actividades por nº de oportunidad. */
app.get('/api/activities', async (req, res) => {
  try {
    const num = normKey(String(req.query.number ?? ''));
    if (!num) {
      res.status(400).json({ error: 'Falta number' });
      return;
    }
    const { rows } = await pool.query<OpportunityActivityRow>(
      `SELECT id, opportunity_number, title, scheduled_at, notes, created_at
       FROM opportunity_activities
       WHERE opportunity_number = $1
       ORDER BY scheduled_at ASC`,
      [num],
    );
    res.json({ entries: rows, count: rows.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'no se pudo leer actividades' });
  }
});

/** Crea una actividad asociada a una oportunidad. */
app.post('/api/activities', async (req, res) => {
  try {
    const body = req.body as unknown;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'JSON inválido' });
      return;
    }
    const b = body as Record<string, unknown>;
    const id = normKey(String(b.id ?? ''));
    const opportunityNumber = normKey(String(b.opportunityNumber ?? ''));
    const title = String(b.title ?? '').trim();
    const scheduledAt = String(b.scheduledAt ?? '').trim();
    const notes = String(b.notes ?? '').trim();
    if (!id || !opportunityNumber || !title || !scheduledAt) {
      res.status(400).json({ error: 'Faltan campos' });
      return;
    }
    await pool.query(
      `INSERT INTO opportunity_activities (id, opportunity_number, title, scheduled_at, notes)
       VALUES ($1, $2, $3, $4::timestamptz, $5)`,
      [id, opportunityNumber, title, scheduledAt, notes],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'no se pudo guardar actividad' });
  }
});

/** Borra una actividad por id. */
app.delete('/api/activities/:id', async (req, res) => {
  try {
    const id = normKey(String(req.params.id ?? ''));
    if (!id) {
      res.status(400).json({ error: 'Falta id' });
      return;
    }
    await pool.query('DELETE FROM opportunity_activities WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'no se pudo borrar actividad' });
  }
});

/** Historial leído desde PostgreSQL (payload JSON). ?opportunityNumber= filtra por número de oportunidad. */
app.get('/api/history', async (req, res) => {
  try {
    const needle = String(req.query.opportunityNumber ?? '').trim().toLowerCase();
    const { rows } = await pool.query<{ payload: unknown }>(
      'SELECT payload FROM lead_app_state WHERE id = 1',
    );
    const row = rows[0];
    const payload =
      row?.payload && typeof row.payload === 'object' && row.payload !== null
        ? (row.payload as Record<string, unknown>)
        : {};
    const rawHistory = Array.isArray(payload.history) ? payload.history : [];
    const total = rawHistory.length;
    if (!needle) {
      res.json({ entries: rawHistory, total });
      return;
    }
    const entries = rawHistory.filter((item: unknown) => {
      if (!item || typeof item !== 'object') return false;
      const snap = (item as { snapshot?: { opportunityNumber?: unknown } }).snapshot;
      const num = String(snap?.opportunityNumber ?? '')
        .trim()
        .toLowerCase();
      return num.includes(needle);
    });
    res.json({ entries, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'no se pudo leer el historial' });
  }
});

async function main(): Promise<void> {
  await ensureSchema();
  startMeetingAuditor();
  app.listen(PORT, () => {
    console.log(
      `API PostgreSQL http://localhost:${PORT} (GET/PUT /api/state, GET /api/history, GET/PUT /api/opportunity, GET /api/opportunity/next-number, /api/activities, POST /api/audit, PATCH /api/audit/:id/status)`,
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});




