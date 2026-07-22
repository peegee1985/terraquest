import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { bytesToBase64, decryptField, encryptField } from '../../src/data/local/crypto';

const randomBytes = (length: number) => new Uint8Array(nodeRandomBytes(length));
const masterKey = bytesToBase64(nodeRandomBytes(32));

describe('local field encryption', () => {
  it('round-trips a plaintext payload', async () => {
    const plaintext = JSON.stringify({ lat: 50.087, lon: 14.421 });
    const envelope = await encryptField(plaintext, masterKey, randomBytes);
    const decrypted = await decryptField(envelope, masterKey);
    expect(decrypted).toBe(plaintext);
  });

  it('uses a fresh IV every call, so identical plaintext yields different ciphertext', async () => {
    const plaintext = 'same payload';
    const first = await encryptField(plaintext, masterKey, randomBytes);
    const second = await encryptField(plaintext, masterKey, randomBytes);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.tag).not.toBe(second.tag);
  });

  it('rejects a tampered ciphertext instead of returning garbage plaintext', async () => {
    const envelope = await encryptField('sensitive', masterKey, randomBytes);
    const tampered = { ...envelope, ciphertext: envelope.ciphertext.slice(0, -4) + 'abcd' };
    await expect(decryptField(tampered, masterKey)).rejects.toThrow(/TAMPERED_OR_INVALID_KEY/);
  });

  it('rejects a tampered tag', async () => {
    const envelope = await encryptField('sensitive', masterKey, randomBytes);
    const tampered = { ...envelope, tag: envelope.tag.slice(0, -4) + 'abcd' };
    await expect(decryptField(tampered, masterKey)).rejects.toThrow(/TAMPERED_OR_INVALID_KEY/);
  });

  it('rejects decryption with the wrong key', async () => {
    const envelope = await encryptField('sensitive', masterKey, randomBytes);
    const otherKey = bytesToBase64(nodeRandomBytes(32));
    await expect(decryptField(envelope, otherKey)).rejects.toThrow(/TAMPERED_OR_INVALID_KEY/);
  });
});
