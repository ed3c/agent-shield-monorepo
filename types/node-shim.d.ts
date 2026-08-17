declare const process: {
  argv: string[];
  cwd(): string;
  exit(code?: number): never;
};

declare const Buffer: any;

declare module "bun:test" {
  export const describe: (...args: any[]) => any;
  export const expect: (...args: any[]) => any;
  export const test: (...args: any[]) => any;
}

declare module "node:child_process" {
  export const spawnSync: (...args: any[]) => any;
}
declare module "node:fs" {
  export const mkdtempSync: (...args: any[]) => any;
  export const rmSync: (...args: any[]) => any;
  export const writeFileSync: (...args: any[]) => any;
  export const mkdirSync: (...args: any[]) => any;
  export const existsSync: (...args: any[]) => any;
  export const lstatSync: (...args: any[]) => any;
  export const readFileSync: (...args: any[]) => any;
  export const readdirSync: (...args: any[]) => any;
  export const statSync: (...args: any[]) => any;
}
declare module "node:path" {
  export const join: (...args: any[]) => string;
  export const resolve: (...args: any[]) => string;
}
declare module "node:os" {
  export const tmpdir: () => string;
}
declare module "node:crypto" {
  export const createHash: (...args: any[]) => any;
}
declare module "node:zlib" {
  export const inflateSync: (...args: any[]) => any;
  export const deflateSync: (...args: any[]) => any;
}
