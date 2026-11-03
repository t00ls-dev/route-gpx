import { afterEach, expect, it, vi } from 'vitest';
import { addressAutocomplete } from '../src/autocomplete';
import { photonSearch } from '../src/services';
vi.mock('../src/services', () => ({ photonSearch: vi.fn() }));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  document.body.replaceChildren();
});
it('debounces, aborts the previous request and rejects a late response after new input', async () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<input id="input"><div id="list"></div>';
  const input = document.querySelector('input')!,
    list = document.getElementById('list')!;
  let finish!: (value: never[]) => void;
  vi.mocked(photonSearch)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue([]);
  const choose = vi.fn(),
    failed = vi.fn();
  addressAutocomplete(input, list, {
    base: () => 'https://example.org',
    center: () => [1, 2],
    valid: () => true,
    choose,
    failed,
  });
  input.focus();
  input.value = 'Li';
  input.dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(400);
  expect(photonSearch).not.toHaveBeenCalled();
  input.value = 'Lis';
  input.dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(299);
  expect(photonSearch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(photonSearch).toHaveBeenCalledTimes(1);
  const signal = vi.mocked(photonSearch).mock.calls[0][3];
  input.value = 'Lisboa';
  input.dispatchEvent(new Event('input'));
  expect(signal.aborted).toBe(true);
  finish([]);
  await vi.advanceTimersByTimeAsync(300);
  expect(list.children).toHaveLength(0);
  expect(failed).not.toHaveBeenCalled();
});
