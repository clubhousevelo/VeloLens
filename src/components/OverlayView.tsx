import { useState, useRef, useEffect, useId } from 'react';
import type { VideoPlayerHandle, VideoTransform, ImageAdjust } from '../hooks/useVideoPlayer';
import { useRepeatWhilePressed } from '../hooks/useRepeatWhilePressed';
import { DEFAULT_TRANSFORM, DEFAULT_IMAGE_ADJUST } from '../hooks/useVideoPlayer';
import type { MarkupHandle, GridSettings } from '../hooks/useMarkup';
import { getScrubberMarkers } from '../hooks/useMarkup';
import ScrubberWithTrim from './ScrubberWithTrim';

import TransformPanel from './TransformPanel';
import ImageAdjustPanel, { imageAdjustToFilter, GammaFilterSvg } from './ImageAdjustPanel';
import MarkupPopupByType from './MarkupPopupByType';
import MarkupOverlay from './MarkupOverlay';
import ToolStrip from './ToolStrip';
import ActionStrip from './ActionStrip';
import type { ToolStripPanel } from './ToolStrip';
import { isMediaFile } from '../lib/videoFile';
import type { CameraCaptureHandle } from '../hooks/useCameraCapture';
import CameraControls from './CameraControls';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.0';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}

function VideoControls({
  label,
  handle,
  camera,
  markupHandle,
  onRemove,
}: {
  label: string;
  handle: VideoPlayerHandle;
  camera: CameraCaptureHandle;
  markupHandle?: MarkupHandle;
  onRemove?: () => void;
}) {
  const { state, selectFile, clearVideo, togglePlay, scrub, setTrimStart, setTrimEnd, stepFrame } = handle;
  const handleRemove = () => { camera.stopCamera(); clearVideo(); onRemove?.(); };
  const handleSelectFile = () => { camera.stopCamera(); selectFile(); };
  const repeatBack = useRepeatWhilePressed(() => stepFrame(-1));
  const repeatFwd = useRepeatWhilePressed(() => stepFrame(1));

  if (!state.src && !camera.state.active) {
    return (
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleSelectFile}
            className="py-3 border border-dashed border-slate-600 rounded-lg text-slate-400 text-sm hover:border-blue-400 hover:text-blue-400 transition-colors"
          >
            Select video or image
          </button>
          <div className="flex items-center justify-center py-3 border border-dashed border-slate-600 rounded-lg hover:border-blue-400 transition-colors">
            <CameraControls camera={camera} compact />
          </div>
        </div>
        {camera.state.error && <div className="text-[11px] text-amber-400">{camera.state.error}</div>}
      </div>
    );
  }

  const isImage = !camera.state.active && state.mediaType === 'image';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</div>
        <div className="text-xs text-slate-500 truncate max-w-[75%] min-w-0">
          {camera.state.active ? (camera.state.recording ? 'Recording live camera' : 'Live camera') : state.fileName}
        </div>
      </div>
      {camera.state.active && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 min-h-10">
          <CameraControls camera={camera} compact />
          <div className="relative z-10 flex items-center gap-1 min-w-0 justify-end pt-1">
            <button onClick={handleSelectFile} className="text-[11px] text-slate-500 hover:text-slate-300 py-0.5 transition-colors">
              Change
            </button>
            <span className="text-[11px] text-slate-700">|</span>
            <button onClick={handleRemove} className="text-[11px] text-slate-600 hover:text-red-400 py-0.5 transition-colors">
              Remove
            </button>
          </div>
        </div>
      )}
      {!camera.state.active && !isImage && (
        <>
          <ScrubberWithTrim
            duration={state.duration}
            currentTime={state.currentTime}
            trimStart={state.trimStart}
            trimEnd={state.trimEnd}
            onScrub={scrub}
            onTrimStartChange={setTrimStart}
            onTrimEndChange={setTrimEnd}
            markers={markupHandle ? getScrubberMarkers(markupHandle.state) : []}
            trackHeight="h-4"
          />
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{formatTime(Math.max(0, state.currentTime - state.trimStart))}</span>
            <span className="text-slate-500">/ {formatTime(Math.max(0, state.trimEnd - state.trimStart))}</span>
          </div>
          <div className="flex items-center justify-between w-full gap-1 sm:grid sm:grid-cols-[1fr_auto_1fr]">
            <div className="flex items-center min-w-0">
              <CameraControls camera={camera} compact />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onPointerDown={(e) => repeatBack.onPointerDown(e)} className="p-1.5 text-slate-400 hover:text-white transition-colors rounded hover:bg-slate-800 select-none" title="Previous frame (hold to scrub)">
                <svg className="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
              </button>
              <button onClick={togglePlay} className="w-9 h-9 flex items-center justify-center shrink-0 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-colors">
                {state.isPlaying ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
              <button onPointerDown={(e) => repeatFwd.onPointerDown(e)} className="p-1.5 text-slate-400 hover:text-white transition-colors rounded hover:bg-slate-800 select-none" title="Next frame (hold to scrub)">
                <svg className="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
              </button>
            </div>
            <div className="flex items-center gap-1 min-w-0 shrink-0 sm:justify-end">
              <button onClick={handleSelectFile} className="text-[11px] text-slate-500 hover:text-slate-300 py-0.5 transition-colors">
                Change
              </button>
              <span className="text-[11px] text-slate-700">|</span>
              <button onClick={handleRemove} className="text-[11px] text-slate-600 hover:text-red-400 py-0.5 transition-colors">
                Remove
              </button>
            </div>
          </div>
        </>
      )}
      {!camera.state.active && isImage && (
        <div className="flex items-center justify-between w-full">
          <CameraControls camera={camera} compact />
          <div className="flex items-center gap-2">
            <button onClick={handleSelectFile} className="text-xs text-slate-500 hover:text-slate-300 py-0.5 transition-colors">
              Change
            </button>
            <span className="text-slate-700">|</span>
            <button onClick={handleRemove} className="text-xs text-slate-600 hover:text-red-400 py-0.5 transition-colors">
              Remove
            </button>
          </div>
        </div>
      )}
      {camera.state.error && <div className="text-[11px] text-amber-400">{camera.state.error}</div>}
    </div>
  );
}

interface OverlayViewProps {
  handle1: VideoPlayerHandle;
  handle2: VideoPlayerHandle;
  camera1: CameraCaptureHandle;
  camera2: CameraCaptureHandle;
  markupHandle1: MarkupHandle;
  markupHandle2: MarkupHandle;
  activeVideo?: 1 | 2;
  onActivate1?: () => void;
  onActivate2?: () => void;
  onRemoveVideo1?: () => void;
  onRemoveVideo2?: () => void;
  /** Drop on left half → V1, drop on right half → V2 */
  onDropFile?: (file: File, target: 1 | 2) => void;
  onTransformChange1?: (t: Partial<VideoTransform>) => void;
  onTransformReset1?: () => void;
  onTransformChange2?: (t: Partial<VideoTransform>) => void;
  onTransformReset2?: () => void;
  syncTransform?: boolean;
  onSyncToggle?: (enabled: boolean, current: VideoTransform) => void;
  onImageAdjustChange1?: (a: Partial<ImageAdjust>) => void;
  onImageAdjustReset1?: () => void;
  onImageAdjustChange2?: (a: Partial<ImageAdjust>) => void;
  onImageAdjustReset2?: () => void;
  syncImageAdjust?: boolean;
  onSyncImageAdjustToggle?: (enabled: boolean, current: ImageAdjust) => void;
  syncGrid?: boolean;
  onSyncGridToggle?: (enabled: boolean, current: GridSettings) => void;
  updateGrid1?: (g: Partial<GridSettings>) => void;
  updateGrid2?: (g: Partial<GridSettings>) => void;
}

export default function OverlayView({ handle1, handle2, camera1, camera2, markupHandle1, markupHandle2, activeVideo, onActivate1, onActivate2, onRemoveVideo1, onRemoveVideo2, onDropFile, onTransformChange1, onTransformReset1, onTransformChange2, onTransformReset2, syncTransform, onSyncToggle, onImageAdjustChange1, onImageAdjustReset1, onImageAdjustChange2, onImageAdjustReset2, syncImageAdjust, onSyncImageAdjustToggle, syncGrid, onSyncGridToggle, updateGrid1, updateGrid2 }: OverlayViewProps) {
  const gammaFilterId1 = useId();
  const gammaFilterId2 = useId();
  const [blendPosition, setBlendPosition] = useState(50);
  const [activePanel1, setActivePanel1] = useState<ToolStripPanel | null>(null);
  const [activePanel2, setActivePanel2] = useState<ToolStripPanel | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dropSide, setDropSide] = useState<1 | 2 | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setCanvasSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasSrc1 = camera1.state.active || !!handle1.state.src;
  const hasSrc2 = camera2.state.active || !!handle2.state.src;
  const bothLoaded = hasSrc1 && hasSrc2;

  const opacity2 = blendPosition / 100;
  const effectiveOpacity1 = !hasSrc2 ? 1 : (blendPosition === 100 ? 0 : 1);
  const effectiveOpacity2 = !hasSrc1 ? 1 : (blendPosition === 0 ? 0 : blendPosition === 100 ? 0.9999 : opacity2);

  const t1 = handle1.state.transform;
  const t2 = handle2.state.transform;
  const adj1 = handle1.state.imageAdjust;
  const adj2 = handle2.state.imageAdjust;
  const transform1Active = t1.scale !== DEFAULT_TRANSFORM.scale || t1.translateX !== DEFAULT_TRANSFORM.translateX || t1.translateY !== DEFAULT_TRANSFORM.translateY;
  const transform2Active = t2.scale !== DEFAULT_TRANSFORM.scale || t2.translateX !== DEFAULT_TRANSFORM.translateX || t2.translateY !== DEFAULT_TRANSFORM.translateY;
  const adjust1Active = adj1.brightness !== DEFAULT_IMAGE_ADJUST.brightness || adj1.contrast !== DEFAULT_IMAGE_ADJUST.contrast || adj1.saturation !== DEFAULT_IMAGE_ADJUST.saturation || adj1.gamma !== DEFAULT_IMAGE_ADJUST.gamma;
  const adjust2Active = adj2.brightness !== DEFAULT_IMAGE_ADJUST.brightness || adj2.contrast !== DEFAULT_IMAGE_ADJUST.contrast || adj2.saturation !== DEFAULT_IMAGE_ADJUST.saturation || adj2.gamma !== DEFAULT_IMAGE_ADJUST.gamma;
  const grid1Active = markupHandle1.state.grid.show;
  const line1Active = markupHandle1.state.lines.length > 0;
  const angle1Active = markupHandle1.state.angles.length > 0;
  const text1Active = markupHandle1.state.texts.length > 0;
  const grid2Active = markupHandle2.state.grid.show;
  const line2Active = markupHandle2.state.lines.length > 0;
  const angle2Active = markupHandle2.state.angles.length > 0;
  const text2Active = markupHandle2.state.texts.length > 0;
  const hasMarkup1 = line1Active || angle1Active || text1Active;
  const hasMarkup2 = line2Active || angle2Active || text2Active;

  const setTransform1 = onTransformChange1 ?? handle1.setTransform;
  const setTransform2 = onTransformChange2 ?? handle2.setTransform;
  const resetTransform1 = onTransformReset1 ?? handle1.resetTransform;
  const resetTransform2 = onTransformReset2 ?? handle2.resetTransform;
  const setImageAdjust1 = onImageAdjustChange1 ?? handle1.setImageAdjust;
  const setImageAdjust2 = onImageAdjustChange2 ?? handle2.setImageAdjust;
  const resetImageAdjust1 = onImageAdjustReset1 ?? handle1.resetImageAdjust;
  const resetImageAdjust2 = onImageAdjustReset2 ?? handle2.resetImageAdjust;
  const activeRing1 = hasSrc1 && activeVideo === 1 ? 'ring-2 ring-blue-400/60 ring-offset-1 ring-offset-slate-950' : '';
  const activeRing2 = hasSrc2 && activeVideo === 2 ? 'ring-2 ring-blue-400/60 ring-offset-1 ring-offset-slate-950' : '';

  const stripRef1 = useRef<HTMLDivElement>(null);
  const stripRef2 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activePanel1 && !activePanel2) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (stripRef1.current?.contains(target) || stripRef2.current?.contains(target)) return;
      setActivePanel1(null);
      setActivePanel2(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [activePanel1, activePanel2]);

  useEffect(() => {
    if (!hasSrc1) setActivePanel1(null);
    if (!hasSrc2) setActivePanel2(null);
  }, [hasSrc1, hasSrc2]);


  const effectiveTransform1 = t1;
  const effectiveTransform2 = t2;

  // Explicit pixel size: always fill canvas height, auto-width by AR.
  // Matches computeVideoBox(W, H, AR) fill-height formula in MarkupOverlay.
  function mediaSize(vw: number, vh: number): React.CSSProperties {
    const ar = vw > 0 && vh > 0 ? vw / vh : 0;
    const mediaH = canvasSize.h > 0 ? canvasSize.h : undefined;
    const mediaW = mediaH && ar > 0 ? mediaH * ar : undefined;
    return { height: mediaH ?? '100%', width: mediaW ?? 'auto', maxWidth: 'none', flexShrink: 0 };
  }

  const popup1 = activePanel1 === 'transform' ? (
    <TransformPanel embedded transform={handle1.state.transform} onChange={setTransform1} onReset={resetTransform1} synced={syncTransform} onSyncToggle={onSyncToggle} />
  ) : activePanel1 === 'adjust' ? (
    <ImageAdjustPanel embedded imageAdjust={adj1} onChange={setImageAdjust1} onReset={resetImageAdjust1} synced={syncImageAdjust} onSyncToggle={onSyncImageAdjustToggle} />
  ) : (activePanel1 === 'grid' || activePanel1 === 'line' || activePanel1 === 'angle' || activePanel1 === 'text') ? (
    <MarkupPopupByType
      markup={markupHandle1}
      type={activePanel1}
      updateGridOverride={activePanel1 === 'grid' ? updateGrid1 : undefined}
      syncedGrid={syncGrid}
      onSyncGridToggle={activePanel1 === 'grid' ? onSyncGridToggle : undefined}
    />
  ) : null;

  const popup2 = activePanel2 === 'transform' ? (
    <TransformPanel embedded transform={handle2.state.transform} onChange={setTransform2} onReset={resetTransform2} synced={syncTransform} onSyncToggle={onSyncToggle} />
  ) : activePanel2 === 'adjust' ? (
    <ImageAdjustPanel embedded imageAdjust={adj2} onChange={setImageAdjust2} onReset={resetImageAdjust2} synced={syncImageAdjust} onSyncToggle={onSyncImageAdjustToggle} />
  ) : (activePanel2 === 'grid' || activePanel2 === 'line' || activePanel2 === 'angle' || activePanel2 === 'text') ? (
    <MarkupPopupByType
      markup={markupHandle2}
      type={activePanel2}
      updateGridOverride={activePanel2 === 'grid' ? updateGrid2 : undefined}
      syncedGrid={syncGrid}
      onSyncGridToggle={activePanel2 === 'grid' ? onSyncGridToggle : undefined}
    />
  ) : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0 gap-2 items-stretch">
        {/* Left strip: V1 tools */}
        <div ref={stripRef1} className={`relative shrink-0 flex flex-col items-start gap-1 transition-opacity ${hasSrc1 ? '' : 'opacity-40 pointer-events-none'}`} onClick={hasSrc1 ? onActivate1 : undefined}>
          <div className={`shrink-0 flex flex-col gap-1 rounded-lg transition-shadow self-start ${activeRing1}`} data-tooltip-side="right">
            <ToolStrip
              side="left"
              active={activePanel1}
              onActiveChange={setActivePanel1}
              transformActive={transform1Active}
              adjustActive={adjust1Active}
              gridActive={grid1Active}
              lineActive={line1Active}
              angleActive={angle1Active}
              textActive={text1Active}
              markupHidden={markupHandle1.state.hidden}
              onToggleHidden={() => markupHandle1.setHidden(!markupHandle1.state.hidden)}
              volumeMuted={handle1.state.muted}
              volumeLevel={handle1.state.volume}
              onVolumeChange={handle1.setVolume}
              onToggleMute={handle1.toggleMute}
              onSetMuted={handle1.setMuted}
            />
            <ActionStrip
            canUndo={markupHandle1.state.undoStack.length > 0}
            canRedo={markupHandle1.state.redoStack.length > 0}
            hasMarkup={hasMarkup1}
            onUndo={markupHandle1.undo}
            onRedo={markupHandle1.redo}
            onClearAll={markupHandle1.clearAll}
          />
          </div>
          {activePanel1 && activePanel1 !== 'volume' && <div className="absolute top-0 left-full ml-1 z-50" data-markup-editor>{popup1}</div>}
        </div>

        {/* Main canvas */}
        <div
          ref={canvasRef}
          className="relative flex-1 min-h-0 rounded-lg overflow-hidden"
          style={{ backgroundColor: handle1.state.src || handle2.state.src ? undefined : '#000000' }}
          onDragOver={(e) => {
            e.preventDefault();
            if (e.dataTransfer.types.includes('Files')) {
              e.dataTransfer.dropEffect = 'copy';
              setDragOver(true);
              const rect = e.currentTarget.getBoundingClientRect();
              setDropSide(e.clientX - rect.left < rect.width / 2 ? 1 : 2);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDragOver(false);
              setDropSide(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            const side = dropSide ?? 1;
            setDragOver(false);
            setDropSide(null);
            const file = e.dataTransfer.files?.[0];
            if (file && isMediaFile(file) && onDropFile) onDropFile(file, side);
          }}
        >
          <div className="absolute inset-0">
            <GammaFilterSvg id={gammaFilterId1} gamma={adj1.gamma} />
            <GammaFilterSvg id={gammaFilterId2} gamma={adj2.gamma} />
            {hasSrc1 && (
              <div
                className="absolute inset-0 flex items-center justify-center overflow-hidden"
                style={{
                  opacity: effectiveOpacity1,
                  zIndex: blendPosition >= 1 && blendPosition <= 99 ? 0 : activeVideo === 1 ? 10 : 0,
                  pointerEvents: blendPosition === 100 ? 'none' : undefined,
                }}
              >
                {camera1.state.active ? (
                  <video
                    ref={camera1.videoRef}
                    style={{
                      ...mediaSize(camera1.state.width, camera1.state.height),
                      transform: `translate(${effectiveTransform1.translateX}px, ${-effectiveTransform1.translateY}px) scale(${effectiveTransform1.scale})`,
                      transformOrigin: 'center center',
                      filter: imageAdjustToFilter(adj1, gammaFilterId1),
                    }}
                    autoPlay
                    muted
                    playsInline
                  />
                ) : handle1.state.mediaType === 'image' ? (
                  <img
                    src={handle1.state.src ?? undefined}
                    alt=""
                    style={{
                      ...mediaSize(handle1.state.videoWidth, handle1.state.videoHeight),
                      transform: `translate(${effectiveTransform1.translateX}px, ${-effectiveTransform1.translateY}px) scale(${effectiveTransform1.scale})`,
                      transformOrigin: 'center center',
                      filter: imageAdjustToFilter(adj1, gammaFilterId1),
                    }}
                  />
                ) : (
                  <video
                    ref={handle1.videoRef}
                    src={handle1.state.src ?? undefined}
                    style={{
                      ...mediaSize(handle1.state.videoWidth, handle1.state.videoHeight),
                      transform: `translate(${effectiveTransform1.translateX}px, ${-effectiveTransform1.translateY}px) scale(${effectiveTransform1.scale})`,
                      transformOrigin: 'center center',
                      filter: imageAdjustToFilter(adj1, gammaFilterId1),
                    }}
                    playsInline
                    preload="auto"
                  />
                )}
                <MarkupOverlay
                  handle={markupHandle1}
                  transform={t1}
                  videoAR={camera1.state.active
                    ? (camera1.state.width && camera1.state.height ? camera1.state.width / camera1.state.height : 0)
                    : (handle1.state.videoWidth && handle1.state.videoHeight ? handle1.state.videoWidth / handle1.state.videoHeight : 0)}
                  currentTime={handle1.state.currentTime}
                  onOpenToolPanel={(type) => { onActivate1?.(); setActivePanel1(type); }}
                  onClosePanel={() => setActivePanel1(null)}
                />
              </div>
            )}

            {hasSrc2 && (
              <div
                className="absolute inset-0 flex items-center justify-center overflow-hidden"
                style={{
                  opacity: effectiveOpacity2,
                  zIndex: blendPosition >= 1 ? 10 : 0,
                  pointerEvents: blendPosition === 0 ? 'none' : (blendPosition >= 1 && blendPosition <= 99 && activeVideo === 1 ? 'none' : undefined),
                }}
              >
                {camera2.state.active ? (
                  <video
                    ref={camera2.videoRef}
                    style={{
                      ...mediaSize(camera2.state.width, camera2.state.height),
                      transform: `translate(${effectiveTransform2.translateX}px, ${-effectiveTransform2.translateY}px) scale(${effectiveTransform2.scale})`,
                      transformOrigin: 'center center',
                      filter: imageAdjustToFilter(adj2, gammaFilterId2),
                    }}
                    autoPlay
                    muted
                    playsInline
                  />
                ) : handle2.state.mediaType === 'image' ? (
                  <img
                    src={handle2.state.src ?? undefined}
                    alt=""
                    style={{
                      ...mediaSize(handle2.state.videoWidth, handle2.state.videoHeight),
                      transform: `translate(${effectiveTransform2.translateX}px, ${-effectiveTransform2.translateY}px) scale(${effectiveTransform2.scale})`,
                      transformOrigin: 'center center',
                      filter: imageAdjustToFilter(adj2, gammaFilterId2),
                    }}
                  />
                ) : (
                  <video
                    ref={handle2.videoRef}
                    src={handle2.state.src ?? undefined}
                    style={{
                      ...mediaSize(handle2.state.videoWidth, handle2.state.videoHeight),
                      transform: `translate(${effectiveTransform2.translateX}px, ${-effectiveTransform2.translateY}px) scale(${effectiveTransform2.scale})`,
                      transformOrigin: 'center center',
                      filter: imageAdjustToFilter(adj2, gammaFilterId2),
                    }}
                    playsInline
                    preload="auto"
                  />
                )}
                <MarkupOverlay
                  handle={markupHandle2}
                  transform={t2}
                  videoAR={camera2.state.active
                    ? (camera2.state.width && camera2.state.height ? camera2.state.width / camera2.state.height : 0)
                    : (handle2.state.videoWidth && handle2.state.videoHeight ? handle2.state.videoWidth / handle2.state.videoHeight : 0)}
                  currentTime={handle2.state.currentTime}
                  onOpenToolPanel={(type) => { onActivate2?.(); setActivePanel2(type); }}
                  onClosePanel={() => setActivePanel2(null)}
                />
              </div>
            )}

            {!hasSrc1 && !hasSrc2 && !dragOver && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-500 text-sm pointer-events-none text-center px-4">
                <span>Drag and drop videos / images here</span>
                <span className="text-slate-600 text-xs">or select below</span>
              </div>
            )}
          </div>

          {/* Drag-and-drop zone indicators */}
          {dragOver && (
            <div className="absolute inset-0 pointer-events-none z-20">
              {/* Left half — V1 target */}
              <div
                className={`absolute inset-y-0 left-0 w-1/2 flex items-center justify-center transition-colors duration-100 ${
                  dropSide === 1
                    ? 'bg-blue-500/30'
                    : dropSide === 2
                    ? 'bg-black/40'
                    : 'bg-blue-500/10'
                }`}
              >
                <div
                  className={`flex flex-col items-center gap-2 transition-all duration-100 ${
                    dropSide === 1 ? 'scale-100 opacity-100' : 'scale-90 opacity-50'
                  }`}
                >
                  <svg className="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                  <div
                    className={`text-xs font-bold px-3 py-1 rounded-md whitespace-nowrap ${
                      dropSide === 1 ? 'bg-blue-600 text-white shadow-lg' : 'bg-black/60 text-blue-300'
                    }`}
                  >
                    {handle1.state.src ? 'Replace V1' : 'Set as V1'}
                  </div>
                </div>
              </div>

              {/* Center divider */}
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/25" />

              {/* Right half — V2 target */}
              <div
                className={`absolute inset-y-0 right-0 w-1/2 flex items-center justify-center transition-colors duration-100 ${
                  dropSide === 2
                    ? 'bg-purple-500/30'
                    : dropSide === 1
                    ? 'bg-black/40'
                    : 'bg-purple-500/10'
                }`}
              >
                <div
                  className={`flex flex-col items-center gap-2 transition-all duration-100 ${
                    dropSide === 2 ? 'scale-100 opacity-100' : 'scale-90 opacity-50'
                  }`}
                >
                  <svg className="w-6 h-6 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                  <div
                    className={`text-xs font-bold px-3 py-1 rounded-md whitespace-nowrap ${
                      dropSide === 2 ? 'bg-purple-600 text-white shadow-lg' : 'bg-black/60 text-purple-300'
                    }`}
                  >
                    {handle2.state.src ? 'Replace V2' : 'Set as V2'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right strip: V2 tools */}
        <div ref={stripRef2} className={`relative shrink-0 flex flex-col items-start gap-1 transition-opacity ${hasSrc2 ? '' : 'opacity-40 pointer-events-none'}`} onClick={hasSrc2 ? onActivate2 : undefined}>
          <div className={`shrink-0 flex flex-col gap-1 rounded-lg transition-shadow self-start ${activeRing2}`} data-tooltip-side="left">
            <ToolStrip
              side="right"
              active={activePanel2}
              onActiveChange={setActivePanel2}
              transformActive={transform2Active}
              adjustActive={adjust2Active}
              gridActive={grid2Active}
              lineActive={line2Active}
              angleActive={angle2Active}
              textActive={text2Active}
              markupHidden={markupHandle2.state.hidden}
              onToggleHidden={() => markupHandle2.setHidden(!markupHandle2.state.hidden)}
              volumeMuted={handle2.state.muted}
              volumeLevel={handle2.state.volume}
              onVolumeChange={handle2.setVolume}
              onToggleMute={handle2.toggleMute}
              onSetMuted={handle2.setMuted}
            />
            <ActionStrip
              canUndo={markupHandle2.state.undoStack.length > 0}
              canRedo={markupHandle2.state.redoStack.length > 0}
              hasMarkup={hasMarkup2}
              onUndo={markupHandle2.undo}
              onRedo={markupHandle2.redo}
              onClearAll={markupHandle2.clearAll}
            />
          </div>
          {activePanel2 && activePanel2 !== 'volume' && <div className="absolute top-0 right-full mr-1 z-50" data-markup-editor>{popup2}</div>}
        </div>
      </div>

      {/* Opacity blend slider: percentages left of V1, right of V2 */}
      <div className={`mt-2 flex justify-center shrink-0 transition-opacity ${bothLoaded ? '' : 'opacity-50 pointer-events-none'}`}>
        <div className="flex items-center gap-3 w-72">
          <span className="text-xs text-slate-400 tabular-nums w-8 text-right shrink-0">{100 - Math.round(opacity2 * 100)}%</span>
          <span className="text-xs text-blue-400 font-medium shrink-0">V1</span>
          <input
            type="range"
            min={0}
            max={100}
            value={blendPosition}
            onChange={(e) => setBlendPosition(parseInt(e.target.value))}
            disabled={!bothLoaded}
            className="blend-slider flex-1 disabled:cursor-not-allowed"
          />
          <span className="text-xs text-purple-400 font-medium shrink-0">V2</span>
          <span className="text-xs text-slate-400 tabular-nums w-8 shrink-0">{Math.round(opacity2 * 100)}%</span>
        </div>
      </div>

      <div className="mt-2 shrink-0 grid grid-cols-2 gap-4">
        <VideoControls
          label="Video 1"
          handle={handle1}
          camera={camera1}
          markupHandle={markupHandle1}
          onRemove={onRemoveVideo1}
        />
        <VideoControls
          label="Video 2"
          handle={handle2}
          camera={camera2}
          markupHandle={markupHandle2}
          onRemove={onRemoveVideo2}
        />
      </div>
    </div>
  );
}
