import crypto from 'node:crypto';
// Crockford-like alphabet: ambiguous characters O/0/I/1 are removed so codes
// stay readable when communicated by humans.
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class TokenCodec {
  constructor(private readonly secret: string) {}

  hash(value: string) {
    return crypto.createHash('sha256').update(`${this.secret}:${value}`).digest('hex');
  }

  sessionToken() {
    return crypto.randomBytes(32).toString('base64url');
  }

  otp() {
    return String(crypto.randomInt(100000, 1_000_000));
  }

  orderNo() {
    return `PL${Date.now()}${crypto.randomInt(100, 999)}`;
  }

  inviteCode() {
    const bytes = crypto.randomBytes(8);
    let out = '';
    for (let i = 0; i < 8; i++) out += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
    return out;
  }
}
