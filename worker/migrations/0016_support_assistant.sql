-- Suporte: qual assistente virtual atende a conversa (Bianca ou Davi, alternando por cliente). Aditiva: conversas antigas ficam NULL (= Bianca).
ALTER TABLE support_tickets ADD COLUMN assistant TEXT CHECK (assistant IS NULL OR assistant IN ('bianca', 'davi'));
