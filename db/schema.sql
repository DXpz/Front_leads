-- Estado del formulario (un solo registro, id = 1)
CREATE TABLE IF NOT EXISTS lead_app_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO lead_app_state (id, payload)
VALUES (
  1,
  '{"draft":{},"history":[],"currentStageIndex":0}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
