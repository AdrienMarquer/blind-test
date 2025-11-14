declare module 'bun' {
  export interface ServerWebSocket<DataType = unknown> {
    data: DataType;
    send(chunk: string | ArrayBufferLike | Uint8Array): number;
    close(code?: number, reason?: string): void;
  }
}

declare const Bun: {
  file(path: string): Response;
};
