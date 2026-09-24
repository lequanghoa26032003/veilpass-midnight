import { Buffer } from 'buffer';

// Midnight's browser SDK still uses Node's Buffer in a few serialization paths.
// Expose the browser implementation before the contract client is evaluated.
if (!('Buffer' in globalThis)) {
  Object.defineProperty(globalThis, 'Buffer', {
    value: Buffer,
    writable: true,
    configurable: true,
  });
}
