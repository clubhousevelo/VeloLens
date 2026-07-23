import { useState, useCallback, useEffect, useRef } from 'react';
import VideoPlayer from './components/VideoPlayer';
import OverlayView from './components/OverlayView';
import { useVideoPlayer } from './hooks/useVideoPlayer';
import type { VideoTransform, ImageAdjust } from './hooks/useVideoPlayer';
import { useCameraCapture } from './hooks/useCameraCapture';
import { useMarkup, type GridSettings } from './hooks/useMarkup';
import { getPersistedVideos, setPersistedVideo, removePersistedVideo } from './lib/persistence';
import { isMediaFile } from './lib/videoFile';

type ViewMode = 'side-by-side' | 'overlay';

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];
const SAVE_DEBOUNCE_MS = 1500;
const SKIP_SAVE_AFTER_MOUNT_MS = 2500;
const STEP_REPEAT_DELAY_MS = 200;
const STEP_REPEAT_INTERVAL_MS = 50;

export default function App() {
  const mountTimeRef = useRef(Date.now());
  const saveTimeout1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimeout2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepRepeatRef = useRef<{ timeout: ReturnType<typeof setTimeout>; interval: ReturnType<typeof setInterval> | null } | null>(null);
  const zHeldRef = useRef(false);
  const xHeldRef = useRef(false);

  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [globalRate, setGlobalRate] = useState(1);
  const [hydrated, setHydrated] = useState(false);
  const [syncTransform, setSyncTransform] = useState(false);
  const [syncImageAdjust, setSyncImageAdjust] = useState(false);
  const [syncGrid, setSyncGrid] = useState(false);
  const [activeVideo, setActiveVideo] = useState<1 | 2>(1);

  const handle1 = useVideoPlayer();
  const handle2 = useVideoPlayer();
  const camera1 = useCameraCapture('Video 1', (file) => handle1.loadFromPersisted(file, file.name));
  const camera2 = useCameraCapture('Video 2', (file) => handle2.loadFromPersisted(file, file.name));
  const markup1 = useMarkup();
  const markup2 = useMarkup();

  // When sync is toggled on, immediately copy the initiating video's transform to the other.
  const handleSyncToggle = useCallback((enabled: boolean, source: VideoTransform) => {
    setSyncTransform(enabled);
    if (enabled) {
      handle1.setTransform(source);
      handle2.setTransform(source);
    }
  }, [handle1, handle2]);

  // Synced transform setters: when sync is on, changes to one propagate to the other
  const setTransform1 = useCallback((t: Partial<VideoTransform>) => {
    handle1.setTransform(t);
    if (syncTransform) handle2.setTransform(t);
  }, [syncTransform, handle1, handle2]);

  const setTransform2 = useCallback((t: Partial<VideoTransform>) => {
    handle2.setTransform(t);
    if (syncTransform) handle1.setTransform(t);
  }, [syncTransform, handle1, handle2]);

  const resetTransform1 = useCallback(() => {
    handle1.resetTransform();
    if (syncTransform) handle2.resetTransform();
  }, [syncTransform, handle1, handle2]);

  const resetTransform2 = useCallback(() => {
    handle2.resetTransform();
    if (syncTransform) handle1.resetTransform();
  }, [syncTransform, handle1, handle2]);

  const handleSyncImageAdjustToggle = useCallback((enabled: boolean, source: ImageAdjust) => {
    setSyncImageAdjust(enabled);
    if (enabled) {
      handle1.setImageAdjust(source);
      handle2.setImageAdjust(source);
    }
  }, [handle1, handle2]);

  const setImageAdjust1 = useCallback((a: Partial<ImageAdjust>) => {
    handle1.setImageAdjust(a);
    if (syncImageAdjust) handle2.setImageAdjust(a);
  }, [syncImageAdjust, handle1, handle2]);

  const setImageAdjust2 = useCallback((a: Partial<ImageAdjust>) => {
    handle2.setImageAdjust(a);
    if (syncImageAdjust) handle1.setImageAdjust(a);
  }, [syncImageAdjust, handle1, handle2]);

  const resetImageAdjust1 = useCallback(() => {
    handle1.resetImageAdjust();
    if (syncImageAdjust) handle2.resetImageAdjust();
  }, [syncImageAdjust, handle1, handle2]);

  const resetImageAdjust2 = useCallback(() => {
    handle2.resetImageAdjust();
    if (syncImageAdjust) handle1.resetImageAdjust();
  }, [syncImageAdjust, handle1, handle2]);

  // Sync Grid: when enabled, copy initiating video's grid to the other; changes propagate both ways
  const handleSyncGridToggle = useCallback((enabled: boolean, source: GridSettings) => {
    setSyncGrid(enabled);
    if (enabled) {
      markup1.updateGrid(source);
      markup2.updateGrid(source);
    }
  }, [markup1, markup2]);

  const updateGrid1 = useCallback((g: Partial<GridSettings>) => {
    markup1.updateGrid(g);
    if (syncGrid) markup2.updateGrid(g);
  }, [syncGrid, markup1, markup2]);

  const updateGrid2 = useCallback((g: Partial<GridSettings>) => {
    markup2.updateGrid(g);
    if (syncGrid) markup1.updateGrid(g);
  }, [syncGrid, markup1, markup2]);

  const anyPlaying = handle1.state.isPlaying || handle2.state.isPlaying;
  const hasAnyVideo = handle1.state.src || handle2.state.src;

  // Remove video helpers — clear state + remove from IndexedDB
  const removeVideo1 = useCallback(() => {
    removePersistedVideo('video1').catch(() => {});
    markup1.loadSnap({ lines: [], angles: [], texts: [], grid: markup1.state.grid, hidden: markup1.state.hidden });
  }, [markup1]);

  const removeVideo2 = useCallback(() => {
    removePersistedVideo('video2').catch(() => {});
    markup2.loadSnap({ lines: [], angles: [], texts: [], grid: markup2.state.grid, hidden: markup2.state.hidden });
  }, [markup2]);

  // Overlay mode: left-half drop → V1, right-half drop → V2
  const handleOverlayDropFile = useCallback((file: File, target: 1 | 2) => {
    if (!isMediaFile(file)) return;
    if (target === 1) {
      camera1.stopCamera();
      handle1.loadFromPersisted(file, file.name);
      markup1.loadSnap({ lines: [], angles: [], texts: [], grid: markup1.state.grid, hidden: markup1.state.hidden });
    } else {
      camera2.stopCamera();
      handle2.loadFromPersisted(file, file.name);
      markup2.loadSnap({ lines: [], angles: [], texts: [], grid: markup2.state.grid, hidden: markup2.state.hidden });
    }
  }, [handle1, handle2, camera1, camera2, markup1, markup2]);

  // Load persisted videos and markup on mount
  useEffect(() => {
    getPersistedVideos()
      .then(({ video1, video2 }) => {
        if (video1) {
          handle1.loadFromPersisted(video1.blob, video1.fileName, video1);
          if (video1.markup) markup1.loadSnap(video1.markup);
        }
        if (video2) {
          handle2.loadFromPersisted(video2.blob, video2.fileName, video2);
          if (video2.markup) markup2.loadSnap(video2.markup);
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist video 1 state (debounced); skip right after mount/hydration
  useEffect(() => {
    if (!hydrated || !handle1.state.src) return;
    if (Date.now() - mountTimeRef.current < SKIP_SAVE_AFTER_MOUNT_MS) return;
    if (saveTimeout1Ref.current) clearTimeout(saveTimeout1Ref.current);
    saveTimeout1Ref.current = setTimeout(() => {
      saveTimeout1Ref.current = null;
      fetch(handle1.state.src!)
        .then((r) => r.blob())
        .then((blob) =>
          setPersistedVideo('video1', {
            blob,
            fileName: handle1.state.fileName,
            trimStart: handle1.state.trimStart,
            trimEnd: handle1.state.trimEnd,
            currentTime: handle1.state.currentTime,
            playbackRate: handle1.state.playbackRate,
            transform: handle1.state.transform,
            imageAdjust: handle1.state.imageAdjust,
            markup: {
              lines: markup1.state.lines,
              angles: markup1.state.angles,
              texts: markup1.state.texts,
              grid: markup1.state.grid,
              hidden: markup1.state.hidden,
            },
          })
        )
        .catch(() => {});
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimeout1Ref.current) clearTimeout(saveTimeout1Ref.current);
    };
  }, [
    hydrated,
    handle1.state.src,
    handle1.state.fileName,
    handle1.state.trimStart,
    handle1.state.trimEnd,
    handle1.state.currentTime,
    handle1.state.playbackRate,
    handle1.state.transform.scale,
    handle1.state.transform.translateX,
    handle1.state.transform.translateY,
    handle1.state.imageAdjust,
    markup1.state.lines,
    markup1.state.angles,
    markup1.state.texts,
    markup1.state.grid,
    markup1.state.hidden,
  ]);

  // Persist video 2 state (debounced)
  useEffect(() => {
    if (!hydrated || !handle2.state.src) return;
    if (Date.now() - mountTimeRef.current < SKIP_SAVE_AFTER_MOUNT_MS) return;
    if (saveTimeout2Ref.current) clearTimeout(saveTimeout2Ref.current);
    saveTimeout2Ref.current = setTimeout(() => {
      saveTimeout2Ref.current = null;
      fetch(handle2.state.src!)
        .then((r) => r.blob())
        .then((blob) =>
          setPersistedVideo('video2', {
            blob,
            fileName: handle2.state.fileName,
            trimStart: handle2.state.trimStart,
            trimEnd: handle2.state.trimEnd,
            currentTime: handle2.state.currentTime,
            playbackRate: handle2.state.playbackRate,
            transform: handle2.state.transform,
            imageAdjust: handle2.state.imageAdjust,
            markup: {
              lines: markup2.state.lines,
              angles: markup2.state.angles,
              texts: markup2.state.texts,
              grid: markup2.state.grid,
              hidden: markup2.state.hidden,
            },
          })
        )
        .catch(() => {});
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimeout2Ref.current) clearTimeout(saveTimeout2Ref.current);
    };
  }, [
    hydrated,
    handle2.state.src,
    handle2.state.fileName,
    handle2.state.trimStart,
    handle2.state.trimEnd,
    handle2.state.currentTime,
    handle2.state.playbackRate,
    handle2.state.transform.scale,
    handle2.state.transform.translateX,
    handle2.state.transform.translateY,
    handle2.state.imageAdjust,
    markup2.state.lines,
    markup2.state.angles,
    markup2.state.texts,
    markup2.state.grid,
    markup2.state.hidden,
  ]);

  // Sync global speed to both videos whenever it changes.
  useEffect(() => {
    handle1.setPlaybackRate(globalRate);
    handle2.setPlaybackRate(globalRate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalRate]);

  const globalTogglePlay = useCallback(() => {
    if (anyPlaying) {
      if (handle1.state.src) handle1.pause();
      if (handle2.state.src) handle2.pause();
    } else {
      if (handle1.state.src) handle1.play();
      if (handle2.state.src) handle2.play();
    }
  }, [anyPlaying, handle1, handle2]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      const isMeta = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+Z → Undo active video markup
      if (isMeta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const m = activeVideo === 1 ? markup1 : markup2;
        m.undo();
        return;
      }
      // Cmd/Ctrl+Y or Cmd/Ctrl+Shift+Z → Redo active video markup
      if (isMeta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const m = activeVideo === 1 ? markup1 : markup2;
        m.redo();
        return;
      }

      // Don't intercept other keys while typing (except Space on range/select for play/pause)
      if (inInput || isMeta) {
        const isRange = target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'range';
        const isSelect = target.tagName === 'SELECT';
        if ((isRange || isSelect) && e.code === 'Space') {
          e.preventDefault();
          globalTogglePlay();
        }
        return;
      }

      // Active video select
      if (e.key === '1') { setActiveVideo(1); return; }
      if (e.key === '2') { setActiveVideo(2); return; }

      // View mode: S = Side by Side, O = Overlay
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setViewMode('side-by-side');
        return;
      }
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        setViewMode('overlay');
        return;
      }

      // Track Z and X for transform hotkeys
      if (e.key === 'z' || e.key === 'Z') zHeldRef.current = true;
      if (e.key === 'x' || e.key === 'X') xHeldRef.current = true;

      if (!hasAnyVideo) return;

      // Transform: Z+Arrow = scale, X+Arrow = translate (active video only)
      const scaleStep = 0.1;
      const translateStep = 20;
      const setActiveTransform = activeVideo === 1 ? setTransform1 : setTransform2;
      const activeTransform = activeVideo === 1 ? handle1.state.transform : handle2.state.transform;

      if (zHeldRef.current && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
        e.preventDefault();
        const delta = e.code === 'ArrowUp' ? scaleStep : -scaleStep;
        const next = Math.max(0.25, Math.min(4, activeTransform.scale + delta));
        setActiveTransform({ scale: next });
        return;
      }
      if (xHeldRef.current && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
        e.preventDefault();
        let dx = 0;
        let dy = 0;
        if (e.code === 'ArrowLeft') dx = -translateStep;
        if (e.code === 'ArrowRight') dx = translateStep;
        if (e.code === 'ArrowUp') dy = translateStep;
        if (e.code === 'ArrowDown') dy = -translateStep;
        const nextX = Math.max(-500, Math.min(500, activeTransform.translateX + dx));
        const nextY = Math.max(-500, Math.min(500, activeTransform.translateY + dy));
        setActiveTransform({ translateX: nextX, translateY: nextY });
        return;
      }

      // Playback
      if (e.code === 'Space') {
        e.preventDefault();
        globalTogglePlay();
        return;
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (e.repeat) return;
        if (stepRepeatRef.current) {
          clearTimeout(stepRepeatRef.current.timeout);
          if (stepRepeatRef.current.interval) clearInterval(stepRepeatRef.current.interval);
          stepRepeatRef.current = null;
        }
        const stepBack = () => {
          if (handle1.state.src) handle1.stepFrame(-1);
          if (handle2.state.src) handle2.stepFrame(-1);
        };
        stepBack();
        const timeout = setTimeout(() => {
          const interval = setInterval(stepBack, STEP_REPEAT_INTERVAL_MS);
          if (stepRepeatRef.current) stepRepeatRef.current.interval = interval;
        }, STEP_REPEAT_DELAY_MS);
        stepRepeatRef.current = { timeout, interval: null };
        return;
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (e.repeat) return;
        if (stepRepeatRef.current) {
          clearTimeout(stepRepeatRef.current.timeout);
          if (stepRepeatRef.current.interval) clearInterval(stepRepeatRef.current.interval);
          stepRepeatRef.current = null;
        }
        const stepFwd = () => {
          if (handle1.state.src) handle1.stepFrame(1);
          if (handle2.state.src) handle2.stepFrame(1);
        };
        stepFwd();
        const timeout = setTimeout(() => {
          const interval = setInterval(stepFwd, STEP_REPEAT_INTERVAL_MS);
          if (stepRepeatRef.current) stepRepeatRef.current.interval = interval;
        }, STEP_REPEAT_DELAY_MS);
        stepRepeatRef.current = { timeout, interval: null };
        return;
      }

      // Markup tool shortcuts — operate on active video's markup
      const activeMarkup = activeVideo === 1 ? markup1 : markup2;
      const key = e.key.toLowerCase();

      if (key === 'g') {
        e.preventDefault();
        activeMarkup.updateGrid({ show: !activeMarkup.state.grid.show });
        return;
      }
      if (key === 'l') {
        e.preventDefault();
        if (activeMarkup.state.hidden) return;
        activeMarkup.setTool(activeMarkup.state.tool === 'line' ? 'none' : 'line');
        return;
      }
      if (key === 'a') {
        e.preventDefault();
        if (activeMarkup.state.hidden) return;
        activeMarkup.setTool(activeMarkup.state.tool === 'angle' ? 'none' : 'angle');
        return;
      }
      if (key === 't') {
        e.preventDefault();
        if (activeMarkup.state.hidden) return;
        activeMarkup.setTool(activeMarkup.state.tool === 'text' ? 'none' : 'text');
        return;
      }
      if (key === 'h') {
        e.preventDefault();
        activeMarkup.setHidden(!activeMarkup.state.hidden);
        return;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'z' || e.key === 'Z') zHeldRef.current = false;
      if (e.key === 'x' || e.key === 'X') xHeldRef.current = false;
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        if (stepRepeatRef.current) {
          clearTimeout(stepRepeatRef.current.timeout);
          if (stepRepeatRef.current.interval) clearInterval(stepRepeatRef.current.interval);
          stepRepeatRef.current = null;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [hasAnyVideo, globalTogglePlay, handle1, handle2, activeVideo, markup1, markup2, setTransform1, setTransform2]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-3 sm:px-6 py-2.5 sm:py-4 flex items-center justify-between gap-2 min-w-0">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Velo<span className="text-blue-400">Lens</span>
            </h1>
          </div>

          {/* Global controls */}
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">

            {/* Global speed */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 hidden sm:inline">Speed</span>
              <select
                value={globalRate}
                onChange={(e) => {
                  setGlobalRate(parseFloat(e.target.value));
                  (e.target as HTMLSelectElement).blur();
                }}
                className="bg-slate-800 border border-slate-700 text-white text-xs rounded-md px-1.5 sm:px-2 py-1.5 cursor-pointer outline-none hover:border-slate-500 focus:border-blue-500 transition-colors"
              >
                {SPEEDS.map((rate) => (
                  <option key={rate} value={rate}>{rate}x</option>
                ))}
              </select>
            </div>

            {/* Separator */}
            <div className="w-px h-5 bg-slate-700 hidden xs:block" />

            {/* Global play/pause */}
            {hasAnyVideo && (
              <button
                onClick={globalTogglePlay}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors shadow-lg shadow-emerald-600/20 shrink-0"
              >
                {anyPlaying ? (
                  <>
                    <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                    <span className="hidden sm:inline">Pause All</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span className="hidden sm:inline">Play All</span>
                  </>
                )}
              </button>
            )}

            {/* Separator */}
            <div className="w-px h-5 bg-slate-700 hidden xs:block" />

            {/* View mode toggle */}
            <div className="flex items-center bg-slate-800/60 rounded-lg p-0.5 sm:p-1 shrink-0">
              <div data-tooltip-side="bottom">
                <button
                  onClick={() => setViewMode('side-by-side')}
                  data-tooltip="Hotkey: S"
                  className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-sm font-medium transition-all ${
                    viewMode === 'side-by-side'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15A2.25 2.25 0 0 0 2.25 6.75v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
                  </svg>
                  <span className="hidden md:inline">Side by Side</span>
                </button>
              </div>
              <div data-tooltip-side="bottom">
                <button
                  onClick={() => setViewMode('overlay')}
                  data-tooltip="Hotkey: O"
                  className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-sm font-medium transition-all ${
                    viewMode === 'overlay'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75l-5.571-3m11.142 0 4.179 2.25L12 17.25l-9.75-5.25 4.179-2.25m11.142 0 4.179 2.25L12 21.75l-9.75-5.25 4.179-2.25" />
                  </svg>
                  <span className="hidden md:inline">Overlay</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 w-full max-w-[1800px] mx-auto px-2 sm:px-6 py-2 sm:py-4 flex flex-col">
          {viewMode === 'side-by-side' ? (
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-visible" style={{ gridAutoRows: '1fr' }}>
              <VideoPlayer
                label="Video 1"
                handle={handle1}
                camera={camera1}
                markupHandle={markup1}
                side="left"
                isActive={activeVideo === 1}
                onActivate={() => setActiveVideo(1)}
                onRemoveVideo={removeVideo1}
                onDropFile={(file) => { camera1.stopCamera(); handle1.loadFromPersisted(file, file.name); }}
                onTransformChange={setTransform1}
                onTransformReset={resetTransform1}
                syncTransform={syncTransform}
                onSyncToggle={handleSyncToggle}
                onImageAdjustChange={setImageAdjust1}
                onImageAdjustReset={resetImageAdjust1}
                syncImageAdjust={syncImageAdjust}
                onSyncImageAdjustToggle={handleSyncImageAdjustToggle}
                syncGrid={syncGrid}
                onSyncGridToggle={handleSyncGridToggle}
                updateGridOverride={updateGrid1}
              />
              <VideoPlayer
                label="Video 2"
                handle={handle2}
                camera={camera2}
                markupHandle={markup2}
                side="right"
                isActive={activeVideo === 2}
                onActivate={() => setActiveVideo(2)}
                onRemoveVideo={removeVideo2}
                onDropFile={(file) => { camera2.stopCamera(); handle2.loadFromPersisted(file, file.name); }}
                onTransformChange={setTransform2}
                onTransformReset={resetTransform2}
                syncTransform={syncTransform}
                onSyncToggle={handleSyncToggle}
                onImageAdjustChange={setImageAdjust2}
                onImageAdjustReset={resetImageAdjust2}
                syncImageAdjust={syncImageAdjust}
                onSyncImageAdjustToggle={handleSyncImageAdjustToggle}
                syncGrid={syncGrid}
                onSyncGridToggle={handleSyncGridToggle}
                updateGridOverride={updateGrid2}
              />
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col">
              <OverlayView
                handle1={handle1}
                handle2={handle2}
                camera1={camera1}
                camera2={camera2}
                markupHandle1={markup1}
                markupHandle2={markup2}
                activeVideo={activeVideo}
                onActivate1={() => setActiveVideo(1)}
                onActivate2={() => setActiveVideo(2)}
                onRemoveVideo1={removeVideo1}
                onRemoveVideo2={removeVideo2}
                onDropFile={handleOverlayDropFile}
                onTransformChange1={setTransform1}
                onTransformReset1={resetTransform1}
                onTransformChange2={setTransform2}
                onTransformReset2={resetTransform2}
                syncTransform={syncTransform}
                onSyncToggle={handleSyncToggle}
                onImageAdjustChange1={setImageAdjust1}
                onImageAdjustReset1={resetImageAdjust1}
                onImageAdjustChange2={setImageAdjust2}
                onImageAdjustReset2={resetImageAdjust2}
                syncImageAdjust={syncImageAdjust}
                onSyncImageAdjustToggle={handleSyncImageAdjustToggle}
                syncGrid={syncGrid}
                onSyncGridToggle={handleSyncGridToggle}
                updateGrid1={updateGrid1}
                updateGrid2={updateGrid2}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
