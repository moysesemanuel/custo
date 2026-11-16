import { MeasurementConverter } from '../features/measurement/components/MeasurementConverter';
import { measureLines } from '../features/measurement/components/MeasuresSummary';
import { cupSizeOf, withSettings, type PageProps } from '../utils';

export function ConverterPage({ data, update }: PageProps) {
  const cup = cupSizeOf(data);
  // Equivalências dos ingredientes cadastrados (as mesmas usadas no cálculo das receitas), para consulta rápida.
  const withMeasures = [...data.ingredients].map(i => ({ i, lines: measureLines(i, cup) })).filter(x => x.lines.length).sort((a, b) => a.i.name.localeCompare(b.i.name, 'pt-BR'));
  return <>
    <div className="head"><div><div className="eyebrow">Ferramenta</div><h1>Conversor de medidas</h1><p className="muted">Converta entre gramas, mililitros, xícaras, colheres e unidades. Para passar de peso para volume, escolha um ingrediente: o app usa medidas de referência e funciona sem internet.</p></div></div>
    <div className="two">
      <section className="card">
        <MeasurementConverter ingredients={data.ingredients} cupSizeMl={cup} onCupSizeChange={n => update(d => withSettings(d, { cupSizeMl: n }))} />
      </section>
      <section className="card" aria-labelledby="quick-ref"><h2 className="section-title" id="quick-ref">Medidas de referência</h2>
        <ul className="ref-list">
          <li><span>1 xícara</span><strong>{cup} mL</strong></li>
          <li><span>1 colher de sopa</span><strong>15 mL</strong></li>
          <li><span>1 colher de chá</span><strong>5 mL</strong></li>
        </ul>
        <h3 className="ref-subtitle">Seus ingredientes</h3>
        {withMeasures.length ? <ul className="ref-list">{withMeasures.map(({ i, lines }) => <li key={i.id}><span>{i.name}</span><strong>{lines.join(' · ')}</strong></li>)}</ul>
          : <p className="muted">Quando seus ingredientes tiverem medidas (xícara ou unidade), elas aparecem aqui.</p>}
      </section>
    </div>
    <p className="footnote">Xícara e colheres são convenções culinárias, não medidas físicas exatas. O tamanho da xícara escolhido vale para todo o app, incluindo o cálculo das receitas. Pesos de referência: USDA FoodData Central (domínio público).</p>
  </>;
}
