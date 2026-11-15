import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import './styles.css';
import './auth.css';
import './sidebar.css';

// /admin abre o painel do proprietário (código separado: clientes comuns não baixam nada dele). A permissão é decidida pelo servidor, não por esta rota.
const Admin = lazy(() => import('./admin/AdminApp'));
const isAdmin = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
// /privacidade e /termos: páginas públicas, sem login e sem tocar nos dados locais.
const Legal = lazy(() => import('./legal/LegalPage').then(m => ({ default: m.LegalPage })));
const legalPath = (['/privacidade', '/termos'] as const).find(p => location.pathname.replace(/\/+$/, '') === p);
// Página de vendas: em "/" para quem nunca entrou neste navegador (sem a marca de último acesso). Quem já usa vai direto ao app;
// "/entrar" sempre abre o app (tela de acesso). O app é carregado sob demanda: visitantes da página de vendas não baixam o app.
const App = lazy(() => import('./App'));
const Landing = lazy(() => import('./landing/Landing').then(m => ({ default: m.Landing })));
const hasUsedApp = (() => { try { return Boolean(localStorage.getItem('pedidocerto.lastAccess')); } catch { return false; } })();
const showLanding = location.pathname === '/' && !hasUsedApp;
const page = isAdmin ? <Admin /> : legalPath ? <Legal path={legalPath} /> : showLanding ? <Landing /> : <App />;
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Suspense fallback={null}>{page}</Suspense></React.StrictMode>);
