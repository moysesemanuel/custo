-- Nome da pessoa titular da licença (informado no cadastro pelo painel administrativo).
-- Usado só para falar com a pessoa pelo nome (saudação no app). Aditiva: licenças existentes ficam sem nome (NULL).
ALTER TABLE licenses ADD COLUMN holder_name TEXT CHECK (holder_name IS NULL OR (length(holder_name) BETWEEN 1 AND 60));
