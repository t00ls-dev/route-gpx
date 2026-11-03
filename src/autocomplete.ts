import { photonSearch, type SearchResult } from './services';
import { parseCoordinates, type Coord } from './core';
export function addressAutocomplete(
  input: HTMLInputElement,
  list: HTMLElement,
  config: {
    base: () => string;
    center: () => Coord;
    valid: () => boolean;
    choose: (result: SearchResult) => void;
    failed: () => void;
  },
): () => void {
  let timer: ReturnType<typeof setTimeout>;
  let controller: AbortController | undefined;
  let version = 0,
    active = -1;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');
  list.setAttribute('role', 'listbox');
  input.autocapitalize = 'off';
  input.spellcheck = false;
  input.setAttribute('autocorrect', 'off');
  input.inputMode = 'search';
  const close = () => {
    version++;
    clearTimeout(timer);
    controller?.abort();
    list.replaceChildren();
    active = -1;
    input.removeAttribute('aria-activedescendant');
    input.setAttribute('aria-expanded', 'false');
  };
  input.addEventListener('input', () => {
    close();
    const query = input.value.trim();
    if (
      query.length < 3 ||
      parseCoordinates(query) ||
      /^[\s()+\d.,;-]+$/.test(query) ||
      (/^[\s(+-]*\d/.test(query) && /[,;]/.test(query))
    )
      return;
    const requestVersion = version;
    timer = setTimeout(() => {
      controller = new AbortController();
      void photonSearch(
        query,
        config.base(),
        config.center(),
        controller.signal,
      )
        .then((results) => {
          if (
            requestVersion !== version ||
            !config.valid() ||
            !input.isConnected ||
            input.value.trim() !== query ||
            document.activeElement !== input
          )
            return;
          results.forEach((result, i) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.id = `${list.id}-${i}`;
            button.textContent = result.display_name;
            button.setAttribute('role', 'option');
            button.setAttribute('aria-selected', 'false');
            button.tabIndex = -1;
            button.onpointerdown = (event) => event.preventDefault();
            button.onclick = () => {
              close();
              config.choose(result);
            };
            list.append(button);
          });
          input.setAttribute('aria-expanded', String(results.length > 0));
        })
        .catch((error) => {
          if (
            requestVersion === version &&
            error?.name !== 'AbortError' &&
            config.valid()
          )
            config.failed();
        });
    }, 300);
  });
  input.addEventListener('keydown', (event) => {
    const options = [
      ...list.querySelectorAll<HTMLButtonElement>('[role=option]'),
    ];
    if (
      (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
      options.length
    ) {
      event.preventDefault();
      active =
        active < 0
          ? event.key === 'ArrowDown'
            ? 0
            : options.length - 1
          : (active + (event.key === 'ArrowDown' ? 1 : options.length - 1)) %
            options.length;
      options.forEach((option, i) =>
        option.setAttribute('aria-selected', String(i === active)),
      );
      input.setAttribute('aria-activedescendant', options[active].id);
      options[active].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && active >= 0 && options[active]) {
      event.preventDefault();
      options[active].click();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
  input.addEventListener('blur', close);
  return close;
}
