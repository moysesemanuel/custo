import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import App from './App';
import './styles.css';
import './auth.css';
import './sidebar.css';

// /admin abre o painel do proprietário (código separado: clientes comuns não baixam nada dele). A permissão é decidida pelo servidor, não por esta rota.
const Admin = lazy(() => import('./admin/AdminApp'));
const isAdmin = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
// /privacidade e /termos: páginas públicas, sem login e sem tocar nos dados locais.
const Legal = lazy(() => import('./legal/LegalPage').then(m => ({ default: m.LegalPage })));
const legalPath = (['/privacidade', '/termos'] as const).find(p => location.pathname.replace(/\/+$/, '') === p);
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{isAdmin ? <Suspense fallback={null}><Admin /></Suspense> : legalPath ? <Suspense fallback={null}><Legal path={legalPath} /></Suspense> : <App />}</React.StrictMode>);
