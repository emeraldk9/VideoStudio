/**
 * Beta S313 — memoizes "may this app read this file".
 *
 * `bootstrap.ts`'s `isAttachedOrImported` answers that question with two
 * synchronous SQLite queries (an eight-parameter `UNION ALL` across `jobs`,
 * `character_references`, `character_reference_images`, `job_character_refs`
 * and `preset_templates`, then `sequence_media`) plus a `Set` rebuilt from
 * `storyStore.listRecent()`. Every `media://` request for a path outside the
 * managed outputs directory pays all of it.
 *
 * A storyboard board paints a few hundred reference tiles at once, so that is
 * several hundred blocking round-trips on the main thread — the same thread
 * running the automation queue, which is why a board loading could stall a
 * render. The queries are individually fast; the problem is their number and
 * where they run.
 *
 * ## Why only positive answers are cached
 *
 * The allowlist is a security boundary, and its documented property is that "a
 * reference that is removed stops being servable". Caching a denial would break
 * a *different* property that matters more day to day: a path that becomes
 * attached must start working immediately, and a stale `false` would leave a
 * tile broken with no event to clear it.
 *
 * So denials are never cached — an unattached path costs exactly what it costs
 * today, every time — and grants are cached briefly. The window this opens is
 * narrow and bounded: a file that was legitimately attached moments ago stays
 * servable for at most `ttlMs` after being detached. Page content cannot widen
 * it, because it can only ever refresh an entry for a path that is *still*
 * granted.
 *
 * That asymmetry is the whole design: the hot path (hundreds of tiles that are
 * all allowed) collapses to one query, and the strict path (anything not
 * allowed) is untouched.
 */

/** How long a granted path stays granted without being re-checked. */
const DEFAULT_TTL_MS = 5_000;

/**
 * Bounds memory. A board can reference a few hundred distinct files; a few
 * thousand entries covers heavy use while staying far too small to matter
 * against the bitmaps this step exists to stop allocating.
 */
const DEFAULT_MAX_ENTRIES = 4_096;

export interface AllowlistCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  /** Injectable clock; `Date.now` in production, a counter in tests. */
  now?: () => number;
}

/**
 * Wraps an allowlist predicate in a short-lived, positive-only cache.
 *
 * The returned function is a drop-in replacement for the one passed in — same
 * signature, same answers, fewer queries.
 */
export function cacheAllowlist(
  isAllowed: (absolutePath: string) => boolean,
  options: AllowlistCacheOptions = {},
): (absolutePath: string) => boolean {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const now = options.now ?? Date.now;

  /** path -> the time its grant stops being trusted. */
  const granted = new Map<string, number>();

  return (absolutePath: string): boolean => {
    const expiresAt = granted.get(absolutePath);
    if (expiresAt !== undefined) {
      if (expiresAt > now()) {
        return true;
      }
      // Expired. Dropped before re-asking so a path that has since been
      // detached cannot linger in the map as a stale key.
      granted.delete(absolutePath);
    }

    if (!isAllowed(absolutePath)) {
      return false;
    }

    // Insertion-ordered eviction rather than true LRU: `Map` iterates in
    // insertion order, so the oldest key is the first one. True LRU would mean
    // re-inserting on every hit, and the win over "oldest first" is not worth a
    // write per served tile — entries expire on a timer anyway, so the eviction
    // policy only decides which *unexpired* entry is sacrificed under pressure.
    if (granted.size >= maxEntries) {
      const oldest = granted.keys().next();
      if (!oldest.done) {
        granted.delete(oldest.value);
      }
    }
    granted.set(absolutePath, now() + ttlMs);
    return true;
  };
}
