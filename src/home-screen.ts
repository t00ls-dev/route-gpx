import { byId as $ } from './dom';
import { iconControl } from './icons';
import { getLanguage } from './i18n';

export type HomeScreenPlatform = 'ios' | 'android' | 'other';

/**
 * Which steps to show for adding the site to the home screen. iPadOS reports
 * itself as a Mac, so a Mac with a touch screen counts as iOS.
 */
export function homeScreenPlatform(
  userAgent: string,
  maxTouchPoints: number,
): HomeScreenPlatform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'other';
}

/**
 * Add to home screen in More actions (phones): a dialog with the browser's
 * own steps. There is no install prompt; the manifest keeps `display: browser`.
 */
export function setupHomeScreen(): void {
  const dialog = $<HTMLDialogElement>('home-dialog'),
    button = $('add-home');
  iconControl(button, 'homescreen', 'Add to home screen');
  button.onclick = () => {
    const platform = homeScreenPlatform(
      navigator.userAgent,
      navigator.maxTouchPoints,
    );
    dialog
      .querySelectorAll<HTMLElement>('[data-platform]')
      .forEach((section) => {
        section.hidden =
          platform !== 'other' && section.dataset.platform !== platform;
      });
    $<HTMLAnchorElement>('home-help').href =
      `./help.html?lang=${getLanguage()}&section=home-screen${location.hash}`;
    dialog.showModal();
  };
  $('close-home').onclick = () => dialog.close();
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => button.focus());
}
