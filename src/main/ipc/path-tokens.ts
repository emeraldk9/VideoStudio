import { randomUUID } from 'node:crypto';
import path from 'node:path';

/**
 * Paths the user chose in a native dialog **in this session**, keyed by an
 * opaque token.
 *
 * Same guarantee `ExternalClipRegistry` makes for the timeline, with one extra
 * turn of the screw: the renderer is handed a token rather than the path, so a
 * compromised renderer cannot name a file it was never given — it can only
 * replay a token, which resolves to a file the user already picked.
 *
 * Deliberately not persisted. A token that outlived the session would be an
 * authorization the user granted once and could not see or revoke; re-picking
 * costs one dialog and keeps the grant narrow.
 *
 * Beta S273 — lifted out of `watermark-ipc.ts`, where it was written for the
 * batch cleaner, because the bulk shot import needs exactly the same thing and
 * for exactly the same reason: it shows the user a table of *file names* and
 * takes back a table of *decisions*, and the round trip must not be an
 * opportunity to name a path. Two private copies of a security primitive is
 * how one of them quietly stops matching the other.
 */
export class ExternalPathTokens {
  private readonly byToken = new Map<string, string>();

  mint(absolutePath: string): string {
    const token = `ext_${randomUUID()}`;
    this.byToken.set(token, path.resolve(absolutePath));
    return token;
  }

  resolve(token: string): string | null {
    return this.byToken.get(token) ?? null;
  }
}
