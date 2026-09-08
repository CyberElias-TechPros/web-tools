import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** State persisted to localStorage, degrading gracefully when storage is blocked. */
export function useLocalStorage<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* quota exceeded or storage disabled — keep working in memory */
        }
        return resolved;
      });
    },
    [key],
  );

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setValue(initial);
    // `initial` is intentionally not a dependency: callers pass object literals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, set, reset];
}

/** Debounce a rapidly-changing value (typing) before running expensive work. */
export function useDebounced<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/** `copy(text)` plus a transient "Copied" flag for button feedback. */
export function useCopy(resetMs = 1600): {
  copied: string | null;
  copy: (text: string, id?: string) => Promise<boolean>;
} {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = useCallback(
    async (text: string, id = 'default') => {
      const { copyToClipboard } = await import('@/lib/files');
      const ok = await copyToClipboard(text);
      if (ok) {
        setCopied(id);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(null), resetMs);
      }
      return ok;
    },
    [resetMs],
  );

  return { copied, copy };
}

/** Track whether a drag is hovering the target, with correct enter/leave counting. */
export function useDropZone(onFiles: (files: File[]) => void | Promise<void>): {
  dragging: boolean;
  handlers: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
} {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    depth.current++;
    if (e.dataTransfer?.types?.includes('Files')) setDragging(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      depth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) void onFiles(files);
    },
    [onFiles],
  );

  return { dragging, handlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}

/** Run a keyboard shortcut, ignoring keystrokes aimed at inputs. */
export function useHotkey(
  combo: { key: string; meta?: boolean; shift?: boolean },
  handler: () => void,
  options: { allowInInputs?: boolean } = {},
): void {
  // The listener is registered once per combo; the ref keeps it pointed at the
  // latest closure without tearing down and re-adding the event listener.
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const listener = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;
      if (inInput && !options.allowInInputs) return;
      if (e.key.toLowerCase() !== combo.key.toLowerCase()) return;
      const meta = e.metaKey || e.ctrlKey;
      if (Boolean(combo.meta) !== meta) return;
      if (Boolean(combo.shift) !== e.shiftKey) return;
      e.preventDefault();
      handlerRef.current();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [combo.key, combo.meta, combo.shift, options.allowInInputs]);
}

/**
 * Media query as reactive state. `useSyncExternalStore` is the correct
 * primitive here: matchMedia is an external store, so this stays consistent
 * during concurrent renders and needs no setState-inside-an-effect dance.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);
  // Server/prerender snapshot: assume the small layout, which degrades safely.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
