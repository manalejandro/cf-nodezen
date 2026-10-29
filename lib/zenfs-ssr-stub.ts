/**
 * Stub substituting @zenfs/core and @zenfs/dom in SSR builds.
 *
 * ZenFS initializes a default in-memory file system at module scope, which
 * workerd forbids in global scope (it generates random values). The server
 * never touches the file system — it only renders the shell — so the SSR
 * bundle gets this inert stub instead. Export names must cover everything
 * `lib/workspace/fs.ts` imports.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const notAvailable = (name: string) => () => {
	throw new Error(`ZenFS (${name}) is not available during server rendering`);
};

export const configureSingle: any = notAvailable("configureSingle");
export const configureSingleSync: any = notAvailable("configureSingleSync");
export const configure: any = notAvailable("configure");
export const configureSync: any = notAvailable("configureSync");
export const sync: any = async () => {};
export const mount: any = notAvailable("mount");
export const umount: any = notAvailable("umount");
export const InMemory: any = {};
export const IndexedDB: any = {};
export const WebStorage: any = {};
export const fs: any = new Proxy(
	{},
	{
		get() {
			throw new Error("ZenFS is not available during server rendering");
		},
	},
);

export default fs;
