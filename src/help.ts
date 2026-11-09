import { isLanguage, preferredLanguage, rememberLanguage } from './i18n';
import { updateSeo } from './seo';
import './style.css';
const select = document.getElementById('language') as HTMLSelectElement;
function apply() {
  const lang = select.value === 'pt' ? 'pt' : 'en';
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
  document.getElementById('help-en')!.hidden = lang !== 'en';
  document.getElementById('help-pt')!.hidden = lang !== 'pt';
  document.getElementById('back')!.textContent =
    lang === 'pt' ? 'Voltar ao mapa' : 'Back to map';
  updateSeo(lang, 'help');
  (document.getElementById('back') as HTMLAnchorElement).href =
    './index.html' + location.hash;
  history.replaceState(null, '', `?lang=${lang}` + location.hash);
}
const linked = new URLSearchParams(location.search).get('lang');
select.value = isLanguage(linked) ? linked : preferredLanguage();
select.onchange = () => {
  if (isLanguage(select.value)) rememberLanguage(select.value);
  apply();
};
apply();
