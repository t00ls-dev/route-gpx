import {
  isLanguage,
  preferredLanguage,
  rememberLanguage,
  translate,
} from './i18n';
import { updateSeo } from './seo';
import './style.css';
const select = document.getElementById('language') as HTMLSelectElement;
function apply() {
  const lang = select.value === 'pt' ? 'pt' : 'en';
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
  document.getElementById('help-en')!.hidden = lang !== 'en';
  document.getElementById('help-pt')!.hidden = lang !== 'pt';
  document.getElementById('back')!.textContent = translate('Back to map', lang);
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
// `?section=elevation` opens the help at that section in the chosen language;
// the hash is reserved for the route state used by Back to map.
const section = new URLSearchParams(location.search).get('section');
apply();
if (section && /^[a-z-]{1,40}$/.test(section))
  document
    .getElementById(`${section}-${select.value === 'pt' ? 'pt' : 'en'}`)
    ?.scrollIntoView();
