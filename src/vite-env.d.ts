/// <reference types="vite/client" />

// Fix timer type compatibility between DOM and NodeJS
type TimerHandle = ReturnType<typeof setTimeout>;

declare namespace NodeJS {
  type Timeout = TimerHandle;
  type Timer = TimerHandle;
}

// Override clearTimeout/clearInterval to accept any timer handle
declare function clearTimeout(id: TimerHandle | number | undefined): void;
declare function clearInterval(id: TimerHandle | number | undefined): void;
