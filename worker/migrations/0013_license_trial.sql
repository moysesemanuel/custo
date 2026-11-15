-- Período de teste da licença. Migração ADITIVA: nenhuma linha existente é alterada.
-- trial_days: dias de teste (NULL = licença sem prazo, como todas as existentes).
-- expires_at: fim do teste, definido no PRIMEIRO acesso (ativação da conta) = acesso + trial_days; pode ser prorrogado
--             ou removido (licença permanente) pelo painel. Depois desta data a conta perde o acesso (só baixa o backup do aparelho).
ALTER TABLE licenses ADD COLUMN trial_days INTEGER CHECK (trial_days IS NULL OR (trial_days BETWEEN 1 AND 365));
ALTER TABLE licenses ADD COLUMN expires_at TEXT;
