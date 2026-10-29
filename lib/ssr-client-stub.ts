/**
 * Stub module substituted for heavy client-only dependencies (Monaco, the
 * sandbox worker) in SSR builds. Those modules are only ever loaded in the
 * browser; this stub keeps them out of the deployed Worker bundle.
 */
const stub = {};
export default stub;
