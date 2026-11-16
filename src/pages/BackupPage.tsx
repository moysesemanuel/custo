import { Download, Upload } from 'lucide-react';
import type { DataSet } from '../domain/types';
import { validateBackup } from '../storage/db';
import { downloadBackup, type PageProps } from '../utils';

export function BackupPage({ data, inform, replaceData }: PageProps & { replaceData: (d: DataSet) => Promise<void> }) {
  function exportBackup() {
    downloadBackup(data);
    inform('Backup exportado. Guarde o arquivo em local seguro.');
  }
  async function importBackup(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('Arquivo acima do limite de 5 MB.');
      const incoming = validateBackup(JSON.parse(await file.text()));
      if (!confirm('Restaurar este backup substituirá os dados atuais. Deseja continuar?')) return;
      await replaceData(incoming); inform('Backup restaurado com sucesso.');
    } catch (e) { inform(e instanceof Error ? e.message : 'Falha ao importar backup.'); }
  }
  return <>
    <div className="head"><div><div className="eyebrow">Proteção dos dados</div><h1>Backup e restauração</h1><p className="muted">Salve uma cópia dos seus dados antes de trocar de dispositivo ou limpar o navegador.</p></div></div>
    <div className="two">
      <section className="card stack"><span className="icon-box"><Download size={21} /></span><h2 className="section-title">Exportar meus dados</h2><p className="muted">Cria um arquivo JSON contendo ingredientes, receitas e encomendas. O arquivo fica sob seu controle.</p><button className="primary" onClick={exportBackup}><Download size={17} /> Baixar backup</button></section>
      <section className="card stack"><span className="icon-box"><Upload size={21} /></span><h2 className="section-title">Restaurar backup</h2><p className="muted">Importe um backup do Custô. Essa ação substitui todos os dados atuais.</p><label className="secondary file-button"><Upload size={17} aria-hidden="true" /> Escolher arquivo de backup (.json)<input className="sr-only" type="file" accept=".json,application/json" onChange={e => { void importBackup(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label></section>
    </div>
    <div className="notice warn" style={{ marginTop: 18 }}>Sem conta conectada, os dados ficam só neste navegador e podem ser perdidos ao limpar o armazenamento. Com a conta conectada, eles também são sincronizados com a nuvem. Em qualquer caso, faça backups com frequência: o arquivo fica com você.</div>
  </>;
}
