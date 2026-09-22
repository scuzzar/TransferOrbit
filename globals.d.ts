// three.js comes from the CDN at runtime (js/start.ts); the types are those of @types/three,
// pinned to the same version.
declare module 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js' {
  export * from 'three';
}

// The single outside edge for tests and the console, set up in js/start.ts
interface Window { TO: unknown }
