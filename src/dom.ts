/** Typed `getElementById` for elements that the page markup always provides. */
export const byId = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
