import { validateState, validCoord, type Route, type State } from './core';
export interface SavedRoute {
  id: string;
  name: string;
  state: State;
  route: Route;
  createdAt: string;
  updatedAt: string;
}
let connection: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!connection)
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('route-gpx', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('routes'))
          request.result.createObjectStore('routes', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          connection = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error('Local route storage is blocked by another tab.'));
    }).catch((e) => {
      connection = undefined;
      throw e;
    });
  return connection;
}
async function operation<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('routes', mode);
    const request = run(tx.objectStore('routes'));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? request.error);
    tx.onerror = () => reject(tx.error ?? request.error);
  });
}
export function savedRouteKey(name: string): string {
  return name.trim().normalize('NFKC').toLocaleLowerCase('en');
}
export async function listSavedRoutes(): Promise<SavedRoute[]> {
  const rows = await operation<SavedRoute[]>('readonly', (s) => s.getAll());
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveNamedRoute(
  state: State,
  route: Route,
): Promise<SavedRoute> {
  const name = state.name.trim();
  if (!name || name.length > 160)
    throw new Error('Name your route before saving.');
  const id = savedRouteKey(name);
  const old = await operation<SavedRoute | undefined>('readonly', (s) =>
    s.get(id),
  );
  const now = new Date().toISOString();
  const record: SavedRoute = {
    id,
    name,
    state: structuredClone({ ...state, name }),
    route: structuredClone(route),
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
  };
  await operation('readwrite', (s) => s.put(record));
  return record;
}
export async function deleteSavedRoute(id: string): Promise<void> {
  await operation('readwrite', (s) => s.delete(id));
}
export function exportRouteBackup(records: SavedRoute[]): string {
  return JSON.stringify(
    {
      format: 'route-gpx-library',
      version: 1,
      exportedAt: new Date().toISOString(),
      routes: records,
    },
    null,
    2,
  );
}
function validNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
export function parseRouteBackup(text: string): SavedRoute[] {
  if (text.length > 50_000_000)
    throw new Error('Choose a backup smaller than 50 MB.');
  const backup = JSON.parse(text) as {
    format?: string;
    version?: number;
    routes?: unknown[];
  };
  if (
    backup?.format !== 'route-gpx-library' ||
    backup.version !== 1 ||
    !Array.isArray(backup.routes)
  )
    throw new Error('Invalid route backup.');
  return backup.routes.map((item) => {
    if (!item || typeof item !== 'object')
      throw new Error('Invalid route backup.');
    const row = item as SavedRoute;
    if (
      typeof row.name !== 'string' ||
      !row.name.trim() ||
      row.name.length > 160
    )
      throw new Error('Invalid saved route name.');
    const state = validateState(row.state, true);
    if (state.points.some((p) => !p.coord))
      throw new Error('Invalid saved route points.');
    const route = row.route;
    if (
      !route ||
      !Array.isArray(route.segments) ||
      !route.segments.length ||
      !route.segments.every(
        (s) => Array.isArray(s) && s.length >= 2 && s.every(validCoord),
      ) ||
      !validNumber(route.distance) ||
      (route.duration !== null && !validNumber(route.duration)) ||
      typeof route.provider !== 'string' ||
      !Array.isArray(route.steps) ||
      !route.steps.every(
        (s) =>
          s &&
          typeof s.name === 'string' &&
          typeof s.ref === 'string' &&
          validNumber(s.distance) &&
          validNumber(s.duration),
      ) ||
      (route.snapped !== undefined &&
        (!Array.isArray(route.snapped) || !route.snapped.every(validCoord)))
    )
      throw new Error('Invalid saved route geometry.');
    const now = new Date().toISOString();
    const date = (value: unknown) =>
      typeof value === 'string' && Number.isFinite(Date.parse(value))
        ? value
        : now;
    const name = row.name.trim();
    state.name = name;
    return {
      id: savedRouteKey(name),
      name,
      state,
      route,
      createdAt: date(row.createdAt),
      updatedAt: date(row.updatedAt),
    };
  });
}
export async function importRouteBackup(
  records: SavedRoute[],
): Promise<number> {
  const existing = new Set((await listSavedRoutes()).map((r) => r.id));
  const added: SavedRoute[] = [];
  for (const record of records) {
    if (existing.has(record.id)) continue;
    existing.add(record.id);
    added.push(record);
  }
  if (!added.length) return 0;
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('routes', 'readwrite');
    for (const record of added) tx.objectStore('routes').put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return added.length;
}
