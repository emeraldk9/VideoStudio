import { useState } from 'react';
import type {
  WhiteboardSettings,
  DuetPartitionMode,
} from '@shared';
import { Card } from '../../../../shared/ui/Card';
import { SegmentedControl } from '../../../../shared/ui/SegmentedControl';
import { Switch } from '../../../../shared/ui/Switch';

export interface WhiteboardCollabStreamSettingsProps {
  activeSettings: WhiteboardSettings;
  updateSettings: (next: WhiteboardSettings) => void;
  isStreamingInk?: boolean;
  onStreamingInkChange?: (streaming: boolean) => void;
}

export function WhiteboardCollabStreamSettings({
  activeSettings,
  updateSettings,
  isStreamingInk: controlledStreaming,
  onStreamingInkChange,
}: WhiteboardCollabStreamSettingsProps) {
  const [internalStreaming, setInternalStreaming] = useState(false);
  const isStreamingInk = controlledStreaming ?? internalStreaming;
  const setIsStreamingInk = (val: boolean) => {
    if (onStreamingInkChange) {
      onStreamingInkChange(val);
    } else {
      setInternalStreaming(val);
    }
  };

  return (
    <>
      <Card className="flex flex-col gap-3 p-3">
        <span className="font-medium text-text-secondary text-[11px] uppercase tracking-wider">
          Collaboration & Streaming Protocols
        </span>

        {/* Milestone S114: Multi-Hand Simultaneous Duet Collaboration */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] text-text-secondary flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-accent-ai">group</span>
                Dual-Hand Duet Collaboration
              </span>
              <span className="text-[10px] text-text-disabled">
                Simultaneous dual presenters & collision avoidance
              </span>
            </div>
            <Switch
              checked={activeSettings.dualHandDuet?.enabled ?? false}
              onChange={() => {
                const current = activeSettings.dualHandDuet?.enabled ?? false;
                updateSettings({
                  ...activeSettings,
                  dualHandDuet: {
                    ...activeSettings.dualHandDuet,
                    enabled: !current,
                    partitionMode: activeSettings.dualHandDuet?.partitionMode ?? 'spatial',
                    minSeparationPx: activeSettings.dualHandDuet?.minSeparationPx ?? 160,
                    collisionLiftPx: activeSettings.dualHandDuet?.collisionLiftPx ?? 90,
                    stereoFoleyPanning: activeSettings.dualHandDuet?.stereoFoleyPanning ?? true,
                  },
                });
              }}
              label="Toggle dual-hand duet collaboration"
            />
          </div>

          {activeSettings.dualHandDuet?.enabled && (
            <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Partition Mode</span>
                <SegmentedControl
                  value={activeSettings.dualHandDuet?.partitionMode ?? 'spatial'}
                  onChange={(val) =>
                    updateSettings({
                      ...activeSettings,
                      dualHandDuet: {
                        ...activeSettings.dualHandDuet,
                        partitionMode: val as DuetPartitionMode,
                      },
                    })
                  }
                  options={[
                    { value: 'spatial', label: 'Left/Right' },
                    { value: 'interleaved', label: 'Alternate' },
                    { value: 'sync', label: 'Sync' },
                  ]}
                  ariaLabel="Dual-hand partition mode"
                />
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Collision Avoidance Lift</span>
                <span className="font-mono text-text-primary text-[10px]">
                  {Math.round(activeSettings.dualHandDuet?.collisionLiftPx ?? 90)}px
                </span>
              </div>
              <input
                type="range"
                min={40}
                max={150}
                step={10}
                value={activeSettings.dualHandDuet?.collisionLiftPx ?? 90}
                aria-label="Collision avoidance elevation lift"
                className="w-full accent-[var(--accent-ai)] cursor-pointer"
                onChange={(e) =>
                  updateSettings({
                    ...activeSettings,
                    dualHandDuet: {
                      ...activeSettings.dualHandDuet,
                      collisionLiftPx: Number(e.target.value),
                    },
                  })
                }
              />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-text-secondary">Stereo Foley Panning</span>
                <Switch
                  checked={activeSettings.dualHandDuet?.stereoFoleyPanning ?? true}
                  onChange={() =>
                    updateSettings({
                      ...activeSettings,
                      dualHandDuet: {
                        ...activeSettings.dualHandDuet,
                        stereoFoleyPanning: !(activeSettings.dualHandDuet?.stereoFoleyPanning ?? true),
                      },
                    })
                  }
                  label="Toggle dual hand stereo foley panning"
                />
              </div>
            </div>
          )}
        </div>

        {/* Milestone S143: Multi-Resolution Spatial Tile Caching & Vector QuadTree Acceleration */}
        <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-accent-ai">grid_view</span>
                <span>Spatial QuadTree & Tile Caching</span>
              </span>
              <span className="text-[10px] text-text-disabled">
                Hierarchical frustum culling & multi-scale raster pyramid caching
              </span>
            </div>
            <Switch
              checked={activeSettings.quadtreeTileCache?.enabled ?? false}
              onChange={() => {
                const current = activeSettings.quadtreeTileCache?.enabled ?? false;
                updateSettings({
                  ...activeSettings,
                  quadtreeTileCache: {
                    ...activeSettings.quadtreeTileCache,
                    enabled: !current,
                    maxDepth: activeSettings.quadtreeTileCache?.maxDepth ?? 6,
                    maxItemsPerNode: activeSettings.quadtreeTileCache?.maxItemsPerNode ?? 8,
                    tileSize: activeSettings.quadtreeTileCache?.tileSize ?? 256,
                    mipLevels: activeSettings.quadtreeTileCache?.mipLevels ?? 3,
                    cullingMarginPx: activeSettings.quadtreeTileCache?.cullingMarginPx ?? 30,
                  },
                });
              }}
              label="Toggle spatial quadtree indexing and multi-resolution tile caching"
            />
          </div>

          {activeSettings.quadtreeTileCache?.enabled && (
            <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Raster Tile Size</span>
                <span className="font-mono text-text-primary text-[10px]">
                  {activeSettings.quadtreeTileCache?.tileSize ?? 256} px
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[128, 256, 512].map((size) => {
                  const isSel = (activeSettings.quadtreeTileCache?.tileSize ?? 256) === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      className={`text-[10px] py-1 rounded border transition-colors ${
                        isSel
                          ? 'bg-accent-ai text-bg-app border-accent-ai font-medium'
                          : 'bg-bg-surface border-hairline text-text-secondary hover:text-text-primary'
                      }`}
                      onClick={() =>
                        updateSettings({
                          ...activeSettings,
                          quadtreeTileCache: {
                            ...activeSettings.quadtreeTileCache,
                            tileSize: size as 128 | 256 | 512,
                          },
                        })
                      }
                    >
                      {size}px
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Max QuadTree Tree Depth</span>
                <span className="font-mono text-text-primary text-[10px]">
                  Level {activeSettings.quadtreeTileCache?.maxDepth ?? 6}
                </span>
              </div>
              <input
                type="range"
                min={3}
                max={8}
                step={1}
                value={activeSettings.quadtreeTileCache?.maxDepth ?? 6}
                aria-label="Maximum spatial subdivision depth for quadtree indexing"
                className="w-full accent-[var(--accent-ai)] cursor-pointer"
                onChange={(e) =>
                  updateSettings({
                    ...activeSettings,
                    quadtreeTileCache: {
                      ...activeSettings.quadtreeTileCache,
                      maxDepth: Number(e.target.value),
                    },
                  })
                }
              />

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Multi-Resolution Pyramid Mip Levels</span>
                <span className="font-mono text-text-primary text-[10px]">
                  {activeSettings.quadtreeTileCache?.mipLevels ?? 3} Mips
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={4}
                step={1}
                value={activeSettings.quadtreeTileCache?.mipLevels ?? 3}
                aria-label="Number of downsampled raster tile cache levels"
                className="w-full accent-[var(--accent-ai)] cursor-pointer"
                onChange={(e) =>
                  updateSettings({
                    ...activeSettings,
                    quadtreeTileCache: {
                      ...activeSettings.quadtreeTileCache,
                      mipLevels: Number(e.target.value),
                    },
                  })
                }
              />

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Frustum Culling Safety Margin</span>
                <span className="font-mono text-text-primary text-[10px]">
                  {activeSettings.quadtreeTileCache?.cullingMarginPx ?? 30} px
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={activeSettings.quadtreeTileCache?.cullingMarginPx ?? 30}
                aria-label="Extra padding around camera viewport before strokes are culled"
                className="w-full accent-[var(--accent-ai)] cursor-pointer"
                onChange={(e) =>
                  updateSettings({
                    ...activeSettings,
                    quadtreeTileCache: {
                      ...activeSettings.quadtreeTileCache,
                      cullingMarginPx: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
          )}
        </div>

        {/* Milestone S150: Multi-Client Whiteboard Live Stream Sync Protocol & Jitter Buffer */}
        <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-accent-ai">wifi_tethering</span>
                <span>Live Stream Sync & Jitter Buffer</span>
              </span>
              <span className="text-[10px] text-text-disabled">
                Binary network protocol & adaptive jitter playout
              </span>
            </div>
            <Switch
              checked={activeSettings.liveStreamSync?.enabled ?? false}
              onChange={() => {
                const current = activeSettings.liveStreamSync?.enabled ?? false;
                updateSettings({
                  ...activeSettings,
                  liveStreamSync: {
                    ...activeSettings.liveStreamSync,
                    enabled: !current,
                    minDelayMs: activeSettings.liveStreamSync?.minDelayMs ?? 20.0,
                    maxDelayMs: activeSettings.liveStreamSync?.maxDelayMs ?? 300.0,
                    targetDelayMs: activeSettings.liveStreamSync?.targetDelayMs ?? 60.0,
                    smoothingAlpha: activeSettings.liveStreamSync?.smoothingAlpha ?? 0.1,
                    plcEnabled: activeSettings.liveStreamSync?.plcEnabled ?? true,
                    showCursorPresence: activeSettings.liveStreamSync?.showCursorPresence ?? true,
                  },
                });
              }}
              label="Toggle multi-client whiteboard live stream sync protocol and jitter buffer"
            />
          </div>

          {activeSettings.liveStreamSync?.enabled && (
            <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Target Playout Delay</span>
                <span className="font-mono text-text-primary text-[10px]">
                  {Math.round(activeSettings.liveStreamSync?.targetDelayMs ?? 60)}ms
                </span>
              </div>
              <input
                type="range"
                min={20}
                max={200}
                step={5}
                value={activeSettings.liveStreamSync?.targetDelayMs ?? 60}
                aria-label="Target monotonic jitter buffer playout delay"
                className="w-full accent-[var(--accent-ai)] cursor-pointer"
                onChange={(e) =>
                  updateSettings({
                    ...activeSettings,
                    liveStreamSync: {
                      ...activeSettings.liveStreamSync,
                      targetDelayMs: Number(e.target.value),
                    },
                  })
                }
              />

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Max Buffer Latency Ceiling</span>
                <span className="font-mono text-text-primary text-[10px]">
                  {Math.round(activeSettings.liveStreamSync?.maxDelayMs ?? 300)}ms
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={500}
                step={10}
                value={activeSettings.liveStreamSync?.maxDelayMs ?? 300}
                aria-label="Maximum allowable playout buffer latency ceiling"
                className="w-full accent-[var(--accent-ai)] cursor-pointer"
                onChange={(e) =>
                  updateSettings({
                    ...activeSettings,
                    liveStreamSync: {
                      ...activeSettings.liveStreamSync,
                      maxDelayMs: Number(e.target.value),
                    },
                  })
                }
              />

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Jitter Adaptation Rate (Alpha)</span>
                <span className="font-mono text-text-primary text-[10px]">
                  {(activeSettings.liveStreamSync?.smoothingAlpha ?? 0.1).toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.02}
                max={0.3}
                step={0.01}
                value={activeSettings.liveStreamSync?.smoothingAlpha ?? 0.1}
                aria-label="Exponential moving average filter factor for jitter estimation"
                className="w-full accent-[var(--accent-ai)] cursor-pointer"
                onChange={(e) =>
                  updateSettings({
                    ...activeSettings,
                    liveStreamSync: {
                      ...activeSettings.liveStreamSync,
                      smoothingAlpha: Number(e.target.value),
                    },
                  })
                }
              />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-text-secondary">Hermite Packet Loss Concealment (PLC)</span>
                <Switch
                  checked={activeSettings.liveStreamSync?.plcEnabled ?? true}
                  onChange={() => {
                    const current = activeSettings.liveStreamSync?.plcEnabled ?? true;
                    updateSettings({
                      ...activeSettings,
                      liveStreamSync: {
                        ...activeSettings.liveStreamSync,
                        plcEnabled: !current,
                      },
                    });
                  }}
                  label="Toggle Hermite cubic spline packet loss concealment"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-text-secondary">Remote Cursor Presence</span>
                <Switch
                  checked={activeSettings.liveStreamSync?.showCursorPresence ?? true}
                  onChange={() => {
                    const current = activeSettings.liveStreamSync?.showCursorPresence ?? true;
                    updateSettings({
                      ...activeSettings,
                      liveStreamSync: {
                        ...activeSettings.liveStreamSync,
                        showCursorPresence: !current,
                      },
                    });
                  }}
                  label="Toggle remote collaborator cursor presence avatars"
                />
              </div>
            </div>
          )}
        </div>

        {/* Milestone S154: Collaborative Spatial Locking & Optimistic CRDT Stroke Merging Engine */}
        <div className="flex flex-col gap-2 pt-2 border-t border-hairline">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-accent-ai">hub</span>
                <span>Collaborative CRDT & Spatial Locks</span>
              </span>
              <span className="text-[10px] text-text-disabled">
                Lamport order convergence & AABB conflict locks
              </span>
            </div>
            <Switch
              checked={activeSettings.collaborativeCRDT?.enabled ?? false}
              onChange={() => {
                const current = activeSettings.collaborativeCRDT?.enabled ?? false;
                updateSettings({
                  ...activeSettings,
                  collaborativeCRDT: {
                    ...activeSettings.collaborativeCRDT,
                    enabled: !current,
                    clientId: activeSettings.collaborativeCRDT?.clientId ?? 'local_user',
                    spatialLeaseTtlMs: activeSettings.collaborativeCRDT?.spatialLeaseTtlMs ?? 2000,
                    lockPaddingPx: activeSettings.collaborativeCRDT?.lockPaddingPx ?? 10,
                    optimisticBufferLimit: activeSettings.collaborativeCRDT?.optimisticBufferLimit ?? 100,
                    enableSelectiveUndo: activeSettings.collaborativeCRDT?.enableSelectiveUndo ?? true,
                  },
                });
              }}
              label="Toggle collaborative CRDT and spatial locking engine"
            />
          </div>

          {activeSettings.collaborativeCRDT?.enabled && (
            <div className="flex flex-col gap-2 pl-2 border-l-2 border-accent-ai/40 mt-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Spatial Lease Lock TTL</span>
                <span className="font-mono text-text-primary text-[10px]">
                  {activeSettings.collaborativeCRDT?.spatialLeaseTtlMs ?? 2000}ms
                </span>
              </div>
              <input
                type="range"
                min={500}
                max={5000}
                step={250}
                value={activeSettings.collaborativeCRDT?.spatialLeaseTtlMs ?? 2000}
                aria-label="Spatial lease reservation time-to-live in milliseconds"
                className="w-full accent-[var(--accent-ai)] cursor-pointer"
                onChange={(e) =>
                  updateSettings({
                    ...activeSettings,
                    collaborativeCRDT: {
                      ...activeSettings.collaborativeCRDT,
                      spatialLeaseTtlMs: Number(e.target.value),
                    },
                  })
                }
              />

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Lock Boundary Padding</span>
                <span className="font-mono text-text-primary text-[10px]">
                  {activeSettings.collaborativeCRDT?.lockPaddingPx ?? 10}px
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                step={5}
                value={activeSettings.collaborativeCRDT?.lockPaddingPx ?? 10}
                aria-label="Spatial bounding-box mutual exclusion padding margin"
                className="w-full accent-[var(--accent-ai)] cursor-pointer"
                onChange={(e) =>
                  updateSettings({
                    ...activeSettings,
                    collaborativeCRDT: {
                      ...activeSettings.collaborativeCRDT,
                      lockPaddingPx: Number(e.target.value),
                    },
                  })
                }
              />

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary">Optimistic Action Buffer Limit</span>
                <span className="font-mono text-text-primary text-[10px]">
                  {activeSettings.collaborativeCRDT?.optimisticBufferLimit ?? 100} ops
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={300}
                step={10}
                value={activeSettings.collaborativeCRDT?.optimisticBufferLimit ?? 100}
                aria-label="Local pending unconfirmed stroke operations limit"
                className="w-full accent-[var(--accent-ai)] cursor-pointer"
                onChange={(e) =>
                  updateSettings({
                    ...activeSettings,
                    collaborativeCRDT: {
                      ...activeSettings.collaborativeCRDT,
                      optimisticBufferLimit: Number(e.target.value),
                    },
                  })
                }
              />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-text-secondary">Selective Causal Peer Undo</span>
                <Switch
                  checked={activeSettings.collaborativeCRDT?.enableSelectiveUndo ?? true}
                  onChange={() => {
                    const current = activeSettings.collaborativeCRDT?.enableSelectiveUndo ?? true;
                    updateSettings({
                      ...activeSettings,
                      collaborativeCRDT: {
                        ...activeSettings.collaborativeCRDT,
                        enableSelectiveUndo: !current,
                      },
                    });
                  }}
                  label="Toggle selective causal tombstone undo without affecting concurrent peers"
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Milestone S102: Live Ink Stream Broadcast Bridge */}
      <div className="rounded-card border border-hairline bg-bg-app/40 p-2.5 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-text-secondary uppercase tracking-wider text-[10px] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-accent-ai">rss_feed</span>
            <span>Live Ink Stream Bridge</span>
          </span>
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-mono font-medium text-emerald-400 border border-emerald-500/30">
            ws://127.0.0.1:8765
          </span>
        </div>
        <p className="text-[11px] text-text-disabled leading-relaxed">
          Broadcasts low-latency drawing touchdown/lift packets to Python headless renderers or remote teleprompter displays.
        </p>
        <div className="flex items-center justify-between pt-1 border-t border-hairline">
          <span className="text-[11px] text-text-secondary">Stream Vector Ink</span>
          <Switch
            checked={isStreamingInk}
            onChange={() => setIsStreamingInk(!isStreamingInk)}
            label="Toggle live ink streaming"
          />
        </div>
      </div>
    </>
  );
}
