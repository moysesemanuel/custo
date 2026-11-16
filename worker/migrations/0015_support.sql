-- Suporte: conversas (dúvida, sugestão, reclamação) entre o cliente, o assistente de IA e a equipe. Aditiva: só cria tabelas novas.
CREATE TABLE IF NOT EXISTS support_tickets (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('question', 'suggestion', 'complaint')),
  -- open = aguardando a equipe; answered = respondida (pela IA ou pela equipe); closed = encerrada pela equipe
  status          TEXT NOT NULL CHECK (status IN ('open', 'answered', 'closed')),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  unread_for_user INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (status, updated_at);

CREATE TABLE IF NOT EXISTS support_messages (
  id         TEXT PRIMARY KEY,
  ticket_id  TEXT NOT NULL,
  author     TEXT NOT NULL CHECK (author IN ('user', 'ai', 'team')),
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages (ticket_id, created_at);
