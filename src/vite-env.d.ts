/// <reference types="vite/client" />

declare namespace NodeJS {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Timeout = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Timer = any;
}

// Fix clearTimeout/clearInterval accepting Timeout type
declare function clearTimeout(id?: number | ReturnType<typeof setTimeout>): void;
declare function clearInterval(id?: number | ReturnType<typeof setInterval>): void;
