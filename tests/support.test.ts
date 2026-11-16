/** Suporte: conversas do cliente, resposta da IA (só dúvidas, só pelo manual), encaminhamento à equipe e caixa no painel. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeServer, type Server, type Session } from './helpers/server';
import { SUPPORT_HANDOFF } from '../shared/supportKnowledge';

type Ticket = { id: string; kind: string; assistant: string; status: string; unread: boolean; messages: { author: string; body: string }[] };
let srv: Server; let ana: Session; let admin: Session;
let aiReply: string | Error; let aiCalls: { model: string; input: { messages: { role: string; content: string }[] } }[];
beforeEach(async () => {
  srv = makeServer(new Date('2026-11-16T15:00:00.000Z'));
  aiReply = 'Para cadastrar um ingrediente:\n1. Clique em "Novo ingrediente".'; aiCalls = [];
  srv.env.AI = { run: vi.fn(async (model: string, input: { messages: { role: string; content: string }[] }) => { aiCalls.push({ model, input }); if (aiReply instanceof Error) throw aiReply; return { response: aiReply }; }) };
  await srv.issueFor('ana@exemplo.com'); ana = await srv.login('ana@exemplo.com');
  await srv.issueFor('dono@exemplo.com'); admin = await srv.login('dono@exemplo.com');
  const userId = (srv.db.raw.prepare("SELECT id FROM users WHERE email = 'dono@exemplo.com'").get() as { id: string }).id;
  srv.db.raw.prepare("INSERT INTO admins (user_id, role, granted_at, granted_by) VALUES (?, 'owner', '2026-11-16T12:00:00.000Z', 'cli')").run(userId);
});
const send = async (body: unknown, s = ana) => srv.request('POST', '/api/support', { session: s, body });
const ticketOf = async (r: Response) => ((await r.json()) as { ticket: Ticket }).ticket;

describe('suporte do cliente', () => {
  it('dúvida: a IA responde com o manual no sistema; a conversa fica respondida', async () => {
    const t = await ticketOf(await send({ kind: 'question', message: 'Como cadastro um ingrediente?' }));
    expect(t.status).toBe('answered');
    expect(t.messages.map(m => m.author)).toEqual(['user', 'ai']);
    expect(aiCalls[0].input.messages[0].role).toBe('system');
    expect(aiCalls[0].input.messages[0].content).toMatch(/## Ingredientes/);
    expect(aiCalls[0].input.messages[1]).toEqual({ role: 'user', content: 'Como cadastro um ingrediente?' }); // só o texto da mensagem, sem dados da conta
    expect(t.messages[1].body).toBe('Olá! Vou te ajudar com sua dúvida.\n\nPara cadastrar um ingrediente:\n1. Clique em "Novo ingrediente".'); // sem nome cadastrado
  });

  it('saudação com o primeiro nome só na primeira resposta; o nome não vai para a IA', async () => {
    srv.db.raw.prepare("UPDATE licenses SET holder_name = 'Lana Costa' WHERE email = 'ana@exemplo.com'").run();
    const t = await ticketOf(await send({ kind: 'question', message: 'Como faço backup?' }));
    expect(t.messages[1].body.startsWith('Olá, Lana! Vou te ajudar com sua dúvida.\n\n')).toBe(true);
    aiReply = 'Use "Escolher arquivo de backup".';
    const t2 = await ticketOf(await srv.request('POST', `/api/support/${t.id}/messages`, { session: ana, body: { message: 'E para restaurar?' } }));
    expect(t2.messages[3].body).toBe('Use "Escolher arquivo de backup".'); // sem nova saudação
    expect(JSON.stringify(aiCalls.map(c => c.input.messages.slice(1)))).not.toMatch(/Lana/);
  });

  it('fora do manual, erro da IA ou cota do dia esgotada: a conversa fica aberta para a equipe, sem resposta inventada', async () => {
    aiReply = SUPPORT_HANDOFF;
    expect((await ticketOf(await send({ kind: 'question', message: 'Quero mais tempo de teste' }))).status).toBe('open');
    aiReply = new Error('quota');
    expect((await ticketOf(await send({ kind: 'question', message: 'Outra dúvida' }))).status).toBe('open');
    srv.env.SUPPORT_AI_DAILY_LIMIT = '2'; aiReply = 'ok';
    const t = await ticketOf(await send({ kind: 'question', message: 'Mais uma' }));
    expect(t.status).toBe('open'); expect(aiCalls).toHaveLength(2); // a 3ª nem chegou à IA
  });

  it('as conversas de cada cliente alternam entre Bianca e Davi, e cada uma mantém o seu', async () => {
    const kinds = [];
    for (let i = 0; i < 3; i++) kinds.push((await ticketOf(await send({ kind: 'suggestion', message: `ideia ${i}` }))).assistant);
    expect(kinds).toEqual(['bianca', 'davi', 'bianca']);
    const first = await ticketOf(await send({ kind: 'question', message: 'dúvida' }, admin)); // outro cliente começa pela Bianca
    expect(first.assistant).toBe('bianca');
    const list = await (await srv.request('GET', '/api/support', { session: ana })).json() as { tickets: Ticket[] };
    expect(list.tickets.map(t => t.assistant)).toEqual(['bianca', 'davi', 'bianca']); // mais recente primeiro
  });

  it('sugestão e reclamação não passam pela IA', async () => {
    expect((await ticketOf(await send({ kind: 'suggestion', message: 'Poderia ter modo escuro' }))).status).toBe('open');
    expect((await ticketOf(await send({ kind: 'complaint', message: 'O app ficou lento' }))).status).toBe('open');
    expect(aiCalls).toHaveLength(0);
  });

  it('continuar a conversa: a IA recebe o histórico; "ainda preciso de ajuda" encaminha à equipe', async () => {
    const t = await ticketOf(await send({ kind: 'question', message: 'Como faço backup?' }));
    aiReply = 'Clique em "Baixar backup".';
    const t2 = await ticketOf(await srv.request('POST', `/api/support/${t.id}/messages`, { session: ana, body: { message: 'E para restaurar?' } }));
    expect(t2.messages.map(m => m.author)).toEqual(['user', 'ai', 'user', 'ai']);
    expect(aiCalls[1].input.messages.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    const t3 = await ticketOf(await srv.request('POST', `/api/support/${t.id}/escalate`, { session: ana, body: {} }));
    expect(t3.status).toBe('open');
  });

  it('valida a mensagem, limita por dia e cada pessoa só vê as próprias conversas', async () => {
    expect((await send({ kind: 'question', message: '' })).status).toBe(400);
    expect((await send({ kind: 'outro', message: 'oi' })).status).toBe(400);
    expect((await send({ kind: 'question', message: 'x'.repeat(2001) })).status).toBe(400);
    const t = await ticketOf(await send({ kind: 'suggestion', message: 'ideia' }));
    const mine = await (await srv.request('GET', '/api/support', { session: admin })).json() as { tickets: Ticket[] };
    expect(mine.tickets).toHaveLength(0);
    expect((await srv.request('POST', `/api/support/${t.id}/messages`, { session: admin, body: { message: 'intrometido' } })).status).toBe(404);
    for (let i = 0; i < 17; i++) await send({ kind: 'suggestion', message: `ideia ${i}` });
    expect((await send({ kind: 'suggestion', message: 'mais uma' })).status).toBe(429);
    expect((await srv.request('GET', '/api/support')).status).toBe(401);
  });
});

describe('caixa de suporte no painel', () => {
  it('lista com o cliente, responde (o cliente vê como não lida) e encerra', async () => {
    const t = await ticketOf(await send({ kind: 'complaint', message: 'Não consigo entrar no celular' }));
    srv.db.raw.prepare("UPDATE licenses SET holder_name = 'Ana Lima' WHERE email = 'ana@exemplo.com'").run();
    const inbox = await (await srv.request('GET', '/api/admin/support?status=open', { session: admin })).json() as { openCount: number; tickets: (Ticket & { customer: { email: string; name: string } })[] };
    expect(inbox.openCount).toBe(1); expect(inbox.tickets[0].customer).toEqual({ email: 'ana@exemplo.com', name: 'Ana Lima' });
    expect((await srv.request('POST', `/api/admin/support/${t.id}/reply`, { session: admin, body: { message: 'Oi Ana, já verificamos.' } })).status).toBe(200);
    const mine = await (await srv.request('GET', '/api/support', { session: ana })).json() as { tickets: Ticket[] };
    expect(mine.tickets[0]).toMatchObject({ status: 'answered', unread: true }); expect(mine.tickets[0].messages.at(-1)).toMatchObject({ author: 'team', body: 'Oi Ana, já verificamos.' });
    await srv.request('POST', `/api/support/${t.id}/read`, { session: ana, body: {} });
    expect(((await (await srv.request('GET', '/api/support', { session: ana })).json()) as { tickets: Ticket[] }).tickets[0].unread).toBe(false);
    await srv.request('POST', `/api/admin/support/${t.id}/close`, { session: admin, body: {} });
    expect((await srv.request('POST', `/api/support/${t.id}/messages`, { session: ana, body: { message: 'e agora?' } })).status).toBe(409);
    expect((await srv.request('GET', '/api/admin/support', { session: ana })).status).toBe(403);
  });
});

describe('trocar a IA pelo Claude (só configuração)', () => {
  it('com SUPPORT_AI_PROVIDER=anthropic usa o Claude Haiku, com o manual em cache; sem chave, encaminha à equipe', async () => {
    srv.env.SUPPORT_AI_PROVIDER = 'anthropic';
    expect((await ticketOf(await send({ kind: 'question', message: 'Sem chave?' }))).status).toBe('open');
    srv.env.ANTHROPIC_API_KEY = 'chave-de-teste';
    const bodies: { model: string; system: { cache_control?: unknown }[]; output_config?: unknown }[] = [];
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith('https://api.anthropic.com/')) {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn', stop_sequence: null, content: [{ type: 'text', text: 'Clique em "Baixar backup".' }], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return realFetch(url as RequestInfo, init);
    }));
    try {
      const t = await ticketOf(await send({ kind: 'question', message: 'Como faço backup?' }));
      expect(t.status).toBe('answered'); expect(t.messages.at(-1)?.body).toBe('Olá! Vou te ajudar com sua dúvida.\n\nClique em "Baixar backup".');
      expect(bodies[0].model).toBe('claude-haiku-5-5');
      expect(bodies[0].system[0].cache_control).toEqual({ type: 'ephemeral' });
      expect(aiCalls).toHaveLength(0); // não usou o Workers AI
    } finally { vi.unstubAllGlobals(); }
  });
});

