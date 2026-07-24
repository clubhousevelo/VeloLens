import { useState, useRef, useEffect, useId } from 'react';
import type { VideoPlayerHandle, VideoTransform, ImageAdjust } from '../hooks/useVideoPlayer';
import { useRepeatWhilePressed } from '../hooks/useRepeatWhilePressed';
import type { MarkupHandle, GridSettings } from '../hooks/useMarkup';
import { getScrubberMarkers } from '../hooks/useMarkup';
import type { ToolStripPanel } from './ToolStrip';
import ScrubberWithTrim from './ScrubberWithTrim';

import TransformPanel from './TransformPanel';
import ImageAdjustPanel, { imageAdjustToFilter, GammaFilterSvg } from './ImageAdjustPanel';
import MarkupPopupByType from './MarkupPopupByType';
import MarkupOverlay from './MarkupOverlay';
import ToolStrip from './ToolStrip';
import ActionStrip from './ActionStrip';
import { DEFAULT_TRANSFORM, DEFAULT_IMAGE_ADJUST } from '../hooks/useVideoPlayer';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { isMediaFile } from '../lib/videoFile';
import type { CameraCaptureHandle } from '../hooks/useCameraCapture';
import CameraControls from './CameraControls';

interface VideoPlayerProps {
  label: string;
  handle: VideoPlayerHandle;
  camera: CameraCaptureHandle;
  markupHandle: MarkupHandle;
  /** Toolbar on 'left' (toolbar left of video) or 'right' (toolbar right of video) */
  side: 'left' | 'right';
  isActive?: boolean;
  onActivate?: () => void;
  onRemoveVideo?: () => void;
  /** Called when a video file is dropped onto this canvas. Replaces existing video if any. */
  onDropFile?: (file: File) => void;
  onTransformChange?: (t: Partial<VideoTransform>) => void;
  onTransformReset?: () => void;
  syncTransform?: boolean;
  onSyncToggle?: (enabled: boolean, current: VideoTransform) => void;
  onImageAdjustChange?: (a: Partial<ImageAdjust>) => void;
  onImageAdjustReset?: () => void;
  syncImageAdjust?: boolean;
  onSyncImageAdjustToggle?: (enabled: boolean, current: ImageAdjust) => void;
  syncGrid?: boolean;
  onSyncGridToggle?: (enabled: boolean, current: GridSettings) => void;
  updateGridOverride?: (g: Partial<GridSettings>) => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.0';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}

export default function VideoPlayer({ label, handle, camera, markupHandle, side, isActive, onActivate, onRemoveVideo, onDropFile, onTransformChange, onTransformReset, syncTransform, onSyncToggle, onImageAdjustChange, onImageAdjustReset, syncImageAdjust, onSyncImageAdjustToggle, syncGrid, onSyncGridToggle, updateGridOverride }: VideoPlayerProps) {
  const gammaFilterId = useId();
  const videoWidth = camera.state.active ? camera.state.width : handle.state.videoWidth;
  const videoHeight = camera.state.active ? camera.state.height : handle.state.videoHeight;
  const videoAR = videoWidth && videoHeight ? videoWidth / videoHeight : 0;
  const { state, videoRef, selectFile, clearVideo, togglePlay, scrub, setTrimStart, setTrimEnd, stepFrame, setVolume, setMuted, toggleMute, setTransform, resetTransform, setImageAdjust, resetImageAdjust } = handle;
  const { src: videoSrc, fileName, duration, currentTime, isPlaying, trimStart, trimEnd, transform, imageAdjust } = state;
  const hasMedia = camera.state.active || !!videoSrc;

  const [activePanel, setActivePanel] = useState<ToolStripPanel | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const repeatBack = useRepeatWhilePressed(() => stepFrame(-1));
  const repeatFwd = useRepeatWhilePressed(() => stepFrame(1));

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      setDragOver(true);
    }
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && isMediaFile(file) && onDropFile) onDropFile(file);
  };

  const effectiveSetTransform = onTransformChange ?? setTransform;
  const effectiveResetTransform = onTransformReset ?? resetTransform;
  const effectiveSetImageAdjust = onImageAdjustChange ?? setImageAdjust;
  const effectiveResetImageAdjust = onImageAdjustReset ?? resetImageAdjust;

  const transformActive = transform.scale !== DEFAULT_TRANSFORM.scale || transform.translateX !== DEFAULT_TRANSFORM.translateX || transform.translateY !== DEFAULT_TRANSFORM.translateY;
  const adjustActive = imageAdjust.brightness !== DEFAULT_IMAGE_ADJUST.brightness || imageAdjust.contrast !== DEFAULT_IMAGE_ADJUST.contrast || imageAdjust.saturation !== DEFAULT_IMAGE_ADJUST.saturation || imageAdjust.gamma !== DEFAULT_IMAGE_ADJUST.gamma;
  const gridActive = markupHandle.state.grid.show;
  const lineActive = markupHandle.state.lines.length > 0;
  const angleActive = markupHandle.state.angles.length > 0;
  const textActive = markupHandle.state.texts.length > 0;
  const hasMarkup = lineActive || angleActive || textActive;
  const canUndo = markupHandle.state.undoStack.length > 0;
  const canRedo = markupHandle.state.redoStack.length > 0;

  const isLeft = side === 'left';
  const isNarrow = useMediaQuery('(max-width: 1023px)');
  // In narrow (top/bottom) layout, put Video 2's tool strip on the left like Video 1
  const stripOnLeft = isLeft || (isNarrow && !isLeft);
  const stripOnRight = !isLeft && !isNarrow;
  const stripRef = useRef<HTMLDivElement>(null);
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

  // Explicit pixel size: always fill canvas height, auto-width by AR.
  // This exactly matches computeVideoBox(W, H, videoAR) in MarkupOverlay.
  const mediaH = canvasSize.h > 0 ? canvasSize.h : undefined;
  const mediaW = mediaH && videoAR > 0 ? mediaH * videoAR : undefined;
  const mediaStyle: React.CSSProperties = {
    height: mediaH ?? '100%',
    width: mediaW ?? 'auto',
    maxWidth: 'none',
    flexShrink: 0,
  };

  // Close popup when clicking outside the strip
  useEffect(() => {
    if (!activePanel) return;
    const onMouseDown = (e: MouseEvent) => {
      if (stripRef.current?.contains(e.target as Node)) return;
      setActivePanel(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [activePanel]);

  const handleRemove = () => {
    camera.stopCamera();
    clearVideo();
    onRemoveVideo?.();
  };

  const handleSelectFile = () => {
    camera.stopCamera();
    selectFile();
  };

  const popupContent = activePanel === 'transform' ? (
    <TransformPanel embedded transform={transform} onChange={effectiveSetTransform} onReset={effectiveResetTransform} synced={syncTransform} onSyncToggle={onSyncToggle} />
  ) : activePanel === 'adjust' ? (
    <ImageAdjustPanel embedded imageAdjust={imageAdjust} onChange={effectiveSetImageAdjust} onReset={effectiveResetImageAdjust} synced={syncImageAdjust} onSyncToggle={onSyncImageAdjustToggle} />
  ) : (activePanel === 'grid' || activePanel === 'line' || activePanel === 'angle' || activePanel === 'text') ? (
    <MarkupPopupByType
      markup={markupHandle}
      type={activePanel}
      updateGridOverride={activePanel === 'grid' ? updateGridOverride : undefined}
      syncedGrid={syncGrid}
      onSyncGridToggle={activePanel === 'grid' ? onSyncGridToggle : undefined}
    />
  ) : null;

  const activeRing = isActive ? 'ring-2 ring-blue-400/60 ring-offset-1 ring-offset-slate-950' : '';

  const stripColumn = (
    <div ref={stripRef} className="relative shrink-0 flex flex-col items-start gap-1">
      <div className={`shrink-0 flex flex-col gap-1 rounded-lg transition-shadow self-start ${activeRing}`} data-tooltip-side={stripOnLeft ? 'right' : 'left'}>
        <ToolStrip
          side={side}
          active={activePanel}
          onActiveChange={setActivePanel}
          transformActive={transformActive}
          adjustActive={adjustActive}
          gridActive={gridActive}
          lineActive={lineActive}
          angleActive={angleActive}
          textActive={textActive}
          markupHidden={markupHandle.state.hidden}
          onToggleHidden={() => markupHandle.setHidden(!markupHandle.state.hidden)}
          volumeMuted={state.muted}
          volumeLevel={state.volume}
          onVolumeChange={setVolume}
          onToggleMute={toggleMute}
          onSetMuted={setMuted}
        />
        <ActionStrip
          canUndo={canUndo}
          canRedo={canRedo}
          hasMarkup={hasMarkup}
          onUndo={markupHandle.undo}
          onRedo={markupHandle.redo}
          onClearAll={markupHandle.clearAll}
        />
      </div>
      {activePanel && activePanel !== 'volume' && (
        <div className={`absolute top-0 ${stripOnLeft ? 'left-full ml-1' : 'right-full mr-1'} z-50`} data-markup-editor>
          {popupContent}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="flex flex-col h-full min-h-0 overflow-visible"
      onClick={onActivate}
    >
      {hasMedia ? (
        <div className="flex flex-1 min-h-0 gap-2 items-stretch">
          {stripOnLeft && stripColumn}

          <div className="flex flex-col flex-1 min-w-0 min-h-0">
            <div
              ref={canvasRef}
              className={`relative flex-1 min-h-0 bg-black rounded-lg overflow-hidden flex items-center justify-center ${dragOver ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
            <GammaFilterSvg id={gammaFilterId} gamma={imageAdjust.gamma} />
            {camera.state.active ? (
              <video
                ref={camera.videoRef}
                style={{
                  ...mediaStyle,
                  transform: `translate(${transform.translateX}px, ${-transform.translateY}px) scale(${transform.scale})`,
                  transformOrigin: 'center center',
                  filter: imageAdjustToFilter(imageAdjust, gammaFilterId),
                }}
                autoPlay
                muted
                playsInline
              />
            ) : handle.state.mediaType === 'image' ? (
              <img
                src={videoSrc ?? undefined}
                alt=""
                style={{
                  ...mediaStyle,
                  transform: `translate(${transform.translateX}px, ${-transform.translateY}px) scale(${transform.scale})`,
                  transformOrigin: 'center center',
                  filter: imageAdjustToFilter(imageAdjust, gammaFilterId),
                }}
              />
            ) : (
              <video
                ref={videoRef}
                src={videoSrc ?? undefined}
                style={{
                  ...mediaStyle,
                  transform: `translate(${transform.translateX}px, ${-transform.translateY}px) scale(${transform.scale})`,
                  transformOrigin: 'center center',
                  filter: imageAdjustToFilter(imageAdjust, gammaFilterId),
                }}
                playsInline
                preload="auto"
              />
            )}
            <MarkupOverlay handle={markupHandle} transform={transform} videoAR={videoAR} currentTime={currentTime} onOpenToolPanel={(type) => setActivePanel(type)} onClosePanel={() => setActivePanel(null)} />
            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-xs font-semibold text-white px-2.5 py-1 rounded-md pointer-events-none">
              {label}
            </div>
            {camera.state.active ? (
              <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-red-950/75 backdrop-blur-sm text-xs text-red-200 px-2.5 py-1 rounded-md pointer-events-none">
                <span className={`w-2 h-2 rounded-full ${camera.state.recording ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'}`} />
                {camera.state.recording ? 'REC' : 'LIVE'}
              </div>
            ) : fileName && (
              <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-xs text-slate-300 px-2.5 py-1 rounded-md max-w-[50%] min-w-0 truncate pointer-events-none">
                {fileName}
              </div>
            )}
            </div>

            <div className="mt-1 space-y-0 px-1 shrink-0 flex flex-col items-stretch">
              {camera.state.active ? (
                <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full min-h-10">
                  <div className="flex items-center justify-start min-w-0">
                    <CameraControls camera={camera} />
                  </div>
                  <div className="text-xs text-slate-500 whitespace-nowrap">
                    {camera.state.qualityLabel || 'Live view'}
                  </div>
                  <div className="flex items-center justify-end gap-2 min-w-0">
                    <button onClick={(e) => { e.stopPropagation(); handleSelectFile(); }} className="text-xs text-slate-500 hover:text-slate-300 py-0.5 transition-colors whitespace-nowrap">
                      Change
                    </button>
                    <span className="text-slate-700">|</span>
                    <button onClick={(e) => { e.stopPropagation(); handleRemove(); }} className="text-xs text-slate-600 hover:text-red-400 py-0.5 transition-colors">
                      Remove
                    </button>
                  </div>
                </div>
              ) : handle.state.mediaType === 'video' ? (
                <>
                  <ScrubberWithTrim
                    duration={duration}
                    currentTime={currentTime}
                    trimStart={trimStart}
                    trimEnd={trimEnd}
                    onScrub={scrub}
                    onTrimStartChange={setTrimStart}
                    onTrimEndChange={setTrimEnd}
                    markers={getScrubberMarkers(markupHandle.state)}
                    trackHeight="h-3.5"
                  />
                  <div className="flex items-center justify-between text-xs text-slate-400 w-full">
                    <span>{formatTime(Math.max(0, currentTime - trimStart))}</span>
                    <span className="text-slate-500">/ {formatTime(Math.max(0, trimEnd - trimStart))}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full">
                    <div className="flex items-center justify-start min-w-0">
                      <CameraControls camera={camera} />
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onPointerDown={(e) => { e.stopPropagation(); repeatBack.onPointerDown(e); }}
                        className="p-2 text-slate-400 hover:text-white transition-colors rounded hover:bg-slate-800 select-none"
                        title="Previous frame (hold to scrub)"
                      >
                        <svg className="w-4.5 h-4.5 pointer-events-none" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="w-10 h-10 flex items-center justify-center shrink-0 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-colors shadow-lg shadow-blue-600/20">
                        {isPlaying ? (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        )}
                      </button>
                      <button
                        onPointerDown={(e) => { e.stopPropagation(); repeatFwd.onPointerDown(e); }}
                        className="p-2 text-slate-400 hover:text-white transition-colors rounded hover:bg-slate-800 select-none"
                        title="Next frame (hold to scrub)"
                      >
                        <svg className="w-4.5 h-4.5 pointer-events-none" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
                      </button>
                    </div>
                    <div className="flex items-center justify-end gap-2 min-w-0">
                      <button onClick={(e) => { e.stopPropagation(); handleSelectFile(); }} className="text-xs text-slate-500 hover:text-slate-300 py-0.5 transition-colors whitespace-nowrap">
                        {handle.state.mediaType === 'video' ? 'Change' : 'Change'}
                      </button>
                      <span className="text-slate-700">|</span>
                      <button onClick={(e) => { e.stopPropagation(); handleRemove(); }} className="text-xs text-slate-600 hover:text-red-400 py-0.5 transition-colors">
                        Remove
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <CameraControls camera={camera} />
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); handleSelectFile(); }} className="text-xs text-slate-500 hover:text-slate-300 py-0.5 transition-colors">
                      Change image
                    </button>
                    <span className="text-slate-700">|</span>
                    <button onClick={(e) => { e.stopPropagation(); handleRemove(); }} className="text-xs text-slate-600 hover:text-red-400 py-0.5 transition-colors">
                      Remove
                    </button>
                  </div>
                </div>
              )}
              {camera.state.error && (
                <div className="text-[11px] text-amber-400 text-left py-0.5">{camera.state.error}</div>
              )}
            </div>
          </div>

          {stripOnRight && stripColumn}
        </div>
      ) : (
        <div
          className={`relative flex-1 min-h-0 flex flex-col items-center justify-center border-2 border-dashed rounded-lg transition-colors bg-black cursor-pointer ${dragOver ? 'border-blue-400 ring-2 ring-blue-400/50' : 'border-slate-600 hover:border-blue-400'}`}
          onClick={(e) => { e.stopPropagation(); handleSelectFile(); }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <svg className="w-12 h-12 text-slate-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-2.625 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0 1 18 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0 1 18 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 0 1 6 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125-.504-1.125-1.125v-1.5c0-.621.504-1.125 1.125-1.125m1.5 3.75c-.621 0-1.125-.504-1.125-1.125v-1.5c0-.621.504-1.125 1.125-1.125" />
          </svg>
          <span className="text-slate-400 text-sm font-medium">{dragOver ? 'Drop video here' : 'Click or drag and drop a video / image'}</span>
          {!dragOver && (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs text-slate-600">or</span>
              <CameraControls camera={camera} />
            </div>
          )}
          {camera.state.error && (
            <span className="mt-3 max-w-sm px-4 text-center text-xs text-amber-400">{camera.state.error}</span>
          )}
        </div>
      )}
    </div>
  );
}
