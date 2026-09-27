import { describe, it, expect } from 'vitest';
import {
  createAABB,
  computeStrokeAABB,
  aabbIntersects,
  aabbContainsPoint,
  aabbExpand,
  aabbUnion,
  createQuadTreeNode,
  insertIntoQuadTree,
  queryQuadTree,
  buildSpatialQuadTree,
  queryFrustumCulledStrokes,
  computeDirtyTileKeys,
  validateQuadTreeTileConfig,
  DEFAULT_QUADTREE_TILE_CONFIG,
} from '../spatial-quadtree-tile-ops';

describe('spatial-quadtree-tile-ops', () => {
  describe('AABB Operations', () => {
    it('computes stroke bounding box with padding', () => {
      const pts = [
        { x: 10, y: 20 },
        { x: 50, y: 80 },
        { x: 30, y: 10 },
      ];
      const box = computeStrokeAABB(pts, 5.0);
      expect(box.minX).toBe(5.0);
      expect(box.maxX).toBe(55.0);
      expect(box.minY).toBe(5.0);
      expect(box.maxY).toBe(85.0);
    });

    it('handles empty points array gracefully', () => {
      const box = computeStrokeAABB([]);
      expect(box).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    });

    it('correctly tests AABB intersections', () => {
      const a = createAABB(10, 10, 40, 40);
      const b = createAABB(30, 30, 60, 60);
      const c = createAABB(50, 50, 80, 80);

      expect(aabbIntersects(a, b)).toBe(true);
      expect(aabbIntersects(a, c)).toBe(false);
    });

    it('tests point containment and expansions', () => {
      const box = createAABB(10, 10, 50, 50);
      expect(aabbContainsPoint(box, 30, 30)).toBe(true);
      expect(aabbContainsPoint(box, 5, 30)).toBe(false);

      const expanded = aabbExpand(box, 10);
      expect(expanded.minX).toBe(0);
      expect(expanded.maxX).toBe(60);
      expect(aabbContainsPoint(expanded, 5, 30)).toBe(true);
    });

    it('computes union bounding box', () => {
      const a = createAABB(10, 20, 30, 40);
      const b = createAABB(5, 25, 35, 50);
      const u = aabbUnion(a, b);

      expect(u.minX).toBe(5);
      expect(u.minY).toBe(20);
      expect(u.maxX).toBe(35);
      expect(u.maxY).toBe(50);
    });
  });

  describe('QuadTree Hierarchy & Queries', () => {
    it('subdivides node when item limit is exceeded', () => {
      const root = createQuadTreeNode(createAABB(0, 0, 100, 100));
      // Max items = 2, max depth = 4
      insertIntoQuadTree(root, { id: 's1', aabb: createAABB(10, 10, 20, 20) }, 4, 2);
      insertIntoQuadTree(root, { id: 's2', aabb: createAABB(60, 60, 70, 70) }, 4, 2);
      expect(root.children).toBeUndefined();

      // Third item triggers subdivision
      insertIntoQuadTree(root, { id: 's3', aabb: createAABB(10, 60, 20, 70) }, 4, 2);
      expect(root.children).toBeDefined();
      expect(root.children).toHaveLength(4);
    });

    it('queries strokes intersecting a bounding box', () => {
      const root = createQuadTreeNode(createAABB(0, 0, 1000, 1000));
      insertIntoQuadTree(root, { id: 'top_left', aabb: createAABB(50, 50, 100, 100) });
      insertIntoQuadTree(root, { id: 'bottom_right', aabb: createAABB(800, 800, 900, 900) });

      const res = queryQuadTree(root, createAABB(0, 0, 200, 200));
      expect(res).toContain('top_left');
      expect(res).not.toContain('bottom_right');
    });

    it('builds spatial tree from multiple strokes and performs frustum culling', () => {
      const strokes = [
        { id: 's_nw', points: [{ x: 50, y: 50 }, { x: 80, y: 80 }] },
        { id: 's_se', points: [{ x: 1800, y: 900 }, { x: 1850, y: 950 }] },
        { id: 's_mid', points: [{ x: 960, y: 540 }, { x: 1000, y: 560 }] },
      ];

      const tree = buildSpatialQuadTree(strokes, 1920, 1080);
      const viewportNW = createAABB(0, 0, 400, 400);

      const visible = queryFrustumCulledStrokes(tree, viewportNW, { cullingMarginPx: 20 });
      expect(visible).toEqual(['s_nw']);
    });
  });

  describe('Multi-Resolution Tile Cache Invalidation', () => {
    it('computes dirty tile keys for MIP 0', () => {
      // Bounding box within single 256x256 tile (0, 0)
      const box1 = createAABB(50, 50, 150, 150);
      expect(computeDirtyTileKeys(box1, 256, 0)).toEqual(['tile_0_0_0']);

      // Bounding box crossing tile boundary (tx: 0, 1; ty: 0, 1)
      const boxCross = createAABB(200, 200, 300, 300);
      const keys = computeDirtyTileKeys(boxCross, 256, 0);
      expect(keys).toEqual(['tile_0_0_0', 'tile_0_0_1', 'tile_0_1_0', 'tile_0_1_1']);
    });

    it('scales coordinates appropriately for MIP 1 (half resolution)', () => {
      // In MIP 1 (scale 0.5), coordinates (400, 400) map to (200, 200) -> tile_1_0_0
      const box = createAABB(350, 350, 450, 450);
      const keys = computeDirtyTileKeys(box, 256, 1);
      expect(keys).toEqual(['tile_1_0_0']);
    });
  });

  describe('validateQuadTreeTileConfig', () => {
    it('validates default config successfully', () => {
      const res = validateQuadTreeTileConfig(DEFAULT_QUADTREE_TILE_CONFIG);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects invalid parameters with error messages', () => {
      const res = validateQuadTreeTileConfig({
        maxDepth: 1,
        tileSize: 64, // must be 128, 256, or 512
        mipLevels: 8,
        cullingMarginPx: -10,
      });
      expect(res.valid).toBe(false);
      expect(res.errors.length).toBeGreaterThanOrEqual(4);
    });
  });
});
