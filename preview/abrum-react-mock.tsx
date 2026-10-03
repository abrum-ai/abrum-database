// In-memory stand-in for @abrum/react so the UI can be previewed without a
// Station (`npm run preview:ui`). Never part of the shipped bundle.
import React from "react";

type Rec = Record<string, unknown> & { $: { cid: string; lineageCid: string } };
const store = new Map<string, Rec[]>();
const listeners = new Set<() => void>();
let seq = 0;
const emit = () => listeners.forEach((listener) => listener());
const typeOf = (app: { entities: Record<string, unknown> }, name: string) => name;

function useStore() {
  const [, force] = React.useReducer((count: number) => count + 1, 0);
  React.useEffect(() => {
    listeners.add(force);
    return () => void listeners.delete(force);
  }, []);
}

function matches(record: Rec, where: Record<string, unknown> = {}) {
  return Object.entries(where).every(([key, value]) => (Array.isArray(value) ? value.includes(record[key]) : record[key] === value));
}

export function useAbrumCollection(app: any, name: string, options: any = {}) {
  useStore();
  const type = typeOf(app, name);
  const all = store.get(type) ?? [];
  let data = all.filter((record) => matches(record, options.where));
  if (options.order) {
    const [field, direction] = options.order;
    data = [...data].sort((a, b) => ((a[field] as number) - (b[field] as number)) * (direction === "desc" ? -1 : 1));
  }
  const mutations = useAbrumMutations(app)[name];
  return { data, isLoading: false, error: null, queryError: null, mutationError: null, isMutating: false, refresh: async () => {}, roomErrors: [], create: mutations.create, update: mutations.update, remove: mutations.delete };
}

export function useAbrumMutations(app: any) {
  return React.useMemo(() => {
    const db: Record<string, any> = {};
    for (const name of Object.keys(app.entities)) {
      db[name] = {
        async create(input: Record<string, unknown>) {
          seq += 1;
          const record = { ...structuredClone(input), $: { cid: `c${seq}`, lineageCid: `l${seq}` } } as Rec;
          store.set(name, [...(store.get(name) ?? []), record]);
          emit();
          return { cid: record.$.cid, push: { inserted: [record.$.cid] } };
        },
        async update(record: Rec, patch: Record<string, unknown>) {
          seq += 1;
          store.set(name, (store.get(name) ?? []).map((item) => (item.$.lineageCid === record.$.lineageCid ? { ...item, ...structuredClone(patch), $: { cid: `c${seq}`, lineageCid: item.$.lineageCid } } : item)));
          emit();
          return { cid: `c${seq}` };
        },
        async delete(record: Rec) {
          store.set(name, (store.get(name) ?? []).filter((item) => item.$.lineageCid !== record.$.lineageCid));
          emit();
          return {};
        },
      };
    }
    return db;
  }, [app]);
}

const blobs = new Map<string, string>();
export function useAbrum() {
  return {
    blobUrl: (hash: string) => blobs.get(hash) ?? "",
    async uploadBlob(blob: Blob) {
      const hash = Math.random().toString(16).slice(2);
      blobs.set(hash, URL.createObjectURL(blob));
      return { hash, url: blobs.get(hash)! };
    },
  };
}

export const useAbrumCanWrite = () => true;
export const processAffordance = () => ({});
export const AbrumAppReady = () => null;
export function AbrumAppShell({ children }: { children: React.ReactNode }) {
  return <div style={{ height: "100vh" }}>{children}</div>;
}
