/**
 * Multi-Resolution Spatial Tile Caching & Vector QuadTree Acceleration Operations.
 *
 * Implements O(log N) spatial indexing, frustum culling, and multi-scale raster
 * pyramid tile caching for high-density whiteboard timelines:
 * 1. Axis-Aligned Bounding Box (AABB) geometric operations and padding.
 * 2. 2D Spatial QuadTree hierarchical tree subdivision (NW, NE, SW, SE).
 * 3. Logarithmic camera viewport frustum culling for 60fps rendering.
 * 4. Multi-resolution pyramid tile coordinate hashing and dirty rect invalidation.
 * 5. Deterministic validation and configuration management.
 */

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface QuadTreeNode {
  bounds: AABB;
  depth: number;
  items: Array<{ id: string; aabb: AABB }>;
  children?: [QuadTreeNode, QuadTreeNode, QuadTreeNode, QuadTreeNode]; // NW, NE, SW, SE
}

export interface QuadTreeTileConfig {
  enabled: boolean;
  maxDepth: number;           // 3 to 8 (default 6)
  maxItemsPerNode: number;    // 4 to 32 (default 8)
  tileSize: number;           // 128, 256, or 512 px (default 256)
  mipLevels: number;          // 1 to 4 (default 3)
  cullingMarginPx: number;    // 0 to 100 px (default 30)
}

export type QuadTreeTileSettings = Partial<QuadTreeTileConfig>;

export const DEFAULT_QUADTREE_TILE_CONFIG: QuadTreeTileConfig = {
  enabled: false,
  maxDepth: 6,
  maxItemsPerNode: 8,
  tileSize: 256,
  mipLevels: 3,
  cullingMarginPx: 30.0,
};

/**
 * Creates an AABB.
 */
export function createAABB(minX: number, minY: number, maxX: number, maxY: number): AABB {
  return { minX, minY, maxX, maxY };
}

/**
 * Computes an enclosing AABB for stroke vertices with outer safety padding.
 */
export function computeStrokeAABB(
  points: Array<{ x: number; y: number }>,
  padding: number = 8.0
): AABB {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}

/**
 * Tests whether two AABBs overlap.
 */
export function aabbIntersects(a: AABB, b: AABB): boolean {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  );
}

/**
 * Tests whether a point lies within an AABB.
 */
export function aabbContainsPoint(box: AABB, x: number, y: number): boolean {
  return box.minX <= x && x <= box.maxX && box.minY <= y && y <= box.maxY;
}

/**
 * Expands an AABB outward symmetrically by a given padding distance.
 */
export function aabbExpand(box: AABB, padding: number): AABB {
  return {
    minX: box.minX - padding,
    minY: box.minY - padding,
    maxX: box.maxX + padding,
    maxY: box.maxY + padding,
  };
}

/**
 * Computes the minimal union bounding box enclosing both AABBs.
 */
export function aabbUnion(a: AABB, b: AABB): AABB {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Creates an empty QuadTree node.
 */
export function createQuadTreeNode(bounds: AABB, depth: number = 0): QuadTreeNode {
  return {
    bounds,
    depth,
    items: [],
  };
}

/**
 * Subdivides a node into 4 quadrant children.
 */
function subdivideQuadTreeNode(node: QuadTreeNode): void {
  const b = node.bounds;
  const midX = (b.minX + b.maxX) * 0.5;
  const midY = (b.minY + b.maxY) * 0.5;
  const nextDepth = node.depth + 1;

  node.children = [
    createQuadTreeNode({ minX: b.minX, minY: b.minY, maxX: midX, maxY: midY }, nextDepth), // NW
    createQuadTreeNode({ minX: midX, minY: b.minY, maxX: b.maxX, maxY: midY }, nextDepth), // NE
    createQuadTreeNode({ minX: b.minX, minY: midY, maxX: midX, maxY: b.maxY }, nextDepth), // SW
    createQuadTreeNode({ minX: midX, minY: midY, maxX: b.maxX, maxY: b.maxY }, nextDepth), // SE
  ];
}

/**
 * Recursively inserts a stroke into the QuadTree.
 */
export function insertIntoQuadTree(
  node: QuadTreeNode,
  item: { id: string; aabb: AABB },
  maxDepth: number = 6,
  maxItems: number = 8
): void {
  if (!aabbIntersects(node.bounds, item.aabb)) return;

  if (node.children) {
    for (let i = 0; i < 4; i++) {
      if (aabbIntersects(node.children[i].bounds, item.aabb)) {
        insertIntoQuadTree(node.children[i], item, maxDepth, maxItems);
      }
    }
    return;
  }

  node.items.push(item);

  if (node.items.length > maxItems && node.depth < maxDepth) {
    subdivideQuadTreeNode(node);
    const existing = node.items;
    node.items = [];
    for (const it of existing) {
      for (let i = 0; i < 4; i++) {
        if (aabbIntersects(node.children![i].bounds, it.aabb)) {
          insertIntoQuadTree(node.children![i], it, maxDepth, maxItems);
        }
      }
    }
  }
}

/**
 * Traverses the QuadTree and returns all unique item IDs intersecting the query bounding box.
 */
export function queryQuadTree(
  node: QuadTreeNode,
  queryBox: AABB,
  results: Set<string> = new Set<string>()
): string[] {
  if (!aabbIntersects(node.bounds, queryBox)) {
    return Array.from(results);
  }

  for (const it of node.items) {
    if (aabbIntersects(it.aabb, queryBox)) {
      results.add(it.id);
    }
  }

  if (node.children) {
    for (let i = 0; i < 4; i++) {
      queryQuadTree(node.children[i], queryBox, results);
    }
  }

  return Array.from(results);
}

/**
 * Builds a complete spatial QuadTree index from an array of strokes.
 */
export function buildSpatialQuadTree(
  strokes: Array<{ id: string; points: Array<{ x: number; y: number }>; width?: number }>,
  canvasWidth: number = 1920,
  canvasHeight: number = 1080,
  config?: Partial<QuadTreeTileConfig>
): QuadTreeNode {
  const fullConfig: QuadTreeTileConfig = {
    ...DEFAULT_QUADTREE_TILE_CONFIG,
    ...config,
  };

  const root = createQuadTreeNode({
    minX: 0,
    minY: 0,
    maxX: canvasWidth,
    maxY: canvasHeight,
  });

  for (const stroke of strokes) {
    const pad = (stroke.width ?? 6.0) * 1.5;
    const aabb = computeStrokeAABB(stroke.points, pad);
    insertIntoQuadTree(root, { id: stroke.id, aabb }, fullConfig.maxDepth, fullConfig.maxItemsPerNode);
  }

  return root;
}

/**
 * Queries the QuadTree for strokes intersecting the viewport frustum plus safety margin.
 */
export function queryFrustumCulledStrokes(
  root: QuadTreeNode,
  viewportAABB: AABB,
  config?: Partial<QuadTreeTileConfig>
): string[] {
  const fullConfig: QuadTreeTileConfig = {
    ...DEFAULT_QUADTREE_TILE_CONFIG,
    ...config,
  };

  const padded = aabbExpand(viewportAABB, fullConfig.cullingMarginPx);
  const results = new Set<string>();
  queryQuadTree(root, padded, results);
  return Array.from(results).sort();
}

/**
 * Computes all raster pyramid tile coordinate keys touched by a dirty bounding box.
 */
export function computeDirtyTileKeys(
  dirtyAABB: AABB,
  tileSize: number = 256,
  mipLevel: number = 0
): string[] {
  const scale = 1.0 / Math.pow(2, mipLevel);
  const scaledTileSize = Number(tileSize);

  const minX = dirtyAABB.minX * scale;
  const maxX = dirtyAABB.maxX * scale;
  const minY = dirtyAABB.minY * scale;
  const maxY = dirtyAABB.maxY * scale;

  const txStart = Math.max(0, Math.floor(minX / scaledTileSize));
  const txEnd = Math.max(0, Math.floor(maxX / scaledTileSize));
  const tyStart = Math.max(0, Math.floor(minY / scaledTileSize));
  const tyEnd = Math.max(0, Math.floor(maxY / scaledTileSize));

  const keys: string[] = [];
  for (let ty = tyStart; ty <= tyEnd; ty++) {
    for (let tx = txStart; tx <= txEnd; tx++) {
      keys.push(`tile_${mipLevel}_${tx}_${ty}`);
    }
  }

  return keys.sort();
}

/**
 * Validates QuadTree and tile cache configuration.
 */
export function validateQuadTreeTileConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be an object'] };
  }

  const c = config as Partial<QuadTreeTileConfig>;

  if (c.maxDepth !== undefined && (typeof c.maxDepth !== 'number' || c.maxDepth < 2 || c.maxDepth > 10)) {
    errors.push('maxDepth must be between 2 and 10');
  }
  if (c.maxItemsPerNode !== undefined && (typeof c.maxItemsPerNode !== 'number' || c.maxItemsPerNode < 2 || c.maxItemsPerNode > 64)) {
    errors.push('maxItemsPerNode must be between 2 and 64');
  }
  if (c.tileSize !== undefined && ![128, 256, 512].includes(c.tileSize)) {
    errors.push('tileSize must be 128, 256, or 512');
  }
  if (c.mipLevels !== undefined && (typeof c.mipLevels !== 'number' || c.mipLevels < 1 || c.mipLevels > 5)) {
    errors.push('mipLevels must be between 1 and 5');
  }
  if (c.cullingMarginPx !== undefined && (typeof c.cullingMarginPx !== 'number' || c.cullingMarginPx < 0 || c.cullingMarginPx > 200)) {
    errors.push('cullingMarginPx must be between 0 and 200');
  }

  return { valid: errors.length === 0, errors };
}
