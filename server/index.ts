import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import pg from 'pg';

const PORT = Number(process.env.PORT) || 3001;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Falta DATABASE_URL en .env (ej. postgresql://postgres:postgres@localhost:5433/formulario_leads)');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl });

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
  app.listen(PORT, () => {
    console.log(
      `API PostgreSQL http://localhost:${PORT}  (GET/PUT /api/state, GET /api/history, GET/PUT /api/opportunity)`,
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});




