import { useCallback, useEffect, useRef, useState } from 'react';
import fixWebmDuration from 'fix-webm-duration';

export interface CameraDeviceOption {
  deviceId: string;
  label: string;
}

export type RecordingContainer = 'auto' | 'mp4' | 'webm';

export interface CameraCaptureState {
  active: boolean;
  recording: boolean;
  recordingPaused: boolean;
  recordingElapsedMs: number;
  frameRate: number | null;
  width: number;
  height: number;
  error: string | null;
  devices: CameraDeviceOption[];
  selectedDeviceId: string;
  qualityLabel: string;
  qualityWarning: string | null;
  recordingContainer: RecordingContainer;
  supportedContainers: Exclude<RecordingContainer, 'auto'>[];
  activeRecordingContainer: Exclude<RecordingContainer, 'auto'> | null;
}

export interface CameraCaptureHandle {
  state: CameraCaptureState;
  videoRef: React.RefCallback<HTMLVideoElement | null>;
  startCamera: (deviceId?: string) => Promise<void>;
  selectCamera: (deviceId: string) => Promise<void>;
  setRecordingContainer: (container: RecordingContainer) => void;
  stopCamera: () => void;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
}

const INITIAL_STATE: CameraCaptureState = {
  active: false,
  recording: false,
  recordingPaused: false,
  recordingElapsedMs: 0,
  frameRate: null,
  width: 0,
  height: 0,
  error: null,
  devices: [],
  selectedDeviceId: '',
  qualityLabel: '',
  qualityWarning: null,
  recordingContainer: 'auto',
  supportedContainers: [],
  activeRecordingContainer: null,
};

interface CaptureProfile {
  label: string;
  constraints: MediaTrackConstraints;
}

const CAPTURE_PROFILES: CaptureProfile[] = [
  {
    label: '1080p60',
    constraints: {
      width: { exact: 1920 },
      height: { exact: 1080 },
      frameRate: { min: 59, ideal: 60, max: 60 },
    },
  },
  {
    label: '720p60',
    constraints: {
      width: { exact: 1280 },
      height: { exact: 720 },
      frameRate: { min: 59, ideal: 60, max: 60 },
    },
  },
  {
    label: '1080p30',
    constraints: {
      width: { exact: 1920 },
      height: { exact: 1080 },
      frameRate: { min: 29, ideal: 30, max: 30 },
    },
  },
  {
    label: 'Best available',
    constraints: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 60, max: 60 },
    },
  },
];

async function getCameraDevices(): Promise<CameraDeviceOption[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter((device) => device.kind === 'videoinput');
  const identifiedInputs = videoInputs.filter((device) => device.deviceId);
  if (identifiedInputs.length === 0 && videoInputs.length > 0) {
    return [{ deviceId: '', label: 'Default camera' }];
  }
  return identifiedInputs
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Camera ${index + 1}`,
    }));
}

function supportedRecordingContainers(): Exclude<RecordingContainer, 'auto'>[] {
  if (typeof MediaRecorder === 'undefined') return [];
  const containers: Exclude<RecordingContainer, 'auto'>[] = [];
  if ([
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1',
    'video/mp4;codecs=h264',
    'video/mp4',
  ].some((mimeType) => MediaRecorder.isTypeSupported(mimeType))) {
    containers.push('mp4');
  }
  if ([
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ].some((mimeType) => MediaRecorder.isTypeSupported(mimeType))) {
    containers.push('webm');
  }
  return containers;
}

function recordingType(preference: RecordingContainer): { mimeType: string; extension: 'mp4' | 'webm' } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: '', extension: 'webm' };
  }
  const mp4Candidates = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4' as const },
    { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4' as const },
    { mimeType: 'video/mp4;codecs=h264', extension: 'mp4' as const },
    { mimeType: 'video/mp4', extension: 'mp4' as const },
  ];
  const webmCandidates = [
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm' as const },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm' as const },
    { mimeType: 'video/webm', extension: 'webm' as const },
  ];
  const candidates = preference === 'webm'
    ? [...webmCandidates, ...mp4Candidates]
    : [...mp4Candidates, ...webmCandidates];
  return candidates.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType))
    ?? { mimeType: '', extension: 'webm' };
}

async function openBestCameraStream(deviceId: string): Promise<{ stream: MediaStream; profile: CaptureProfile }> {
  let lastError: unknown;
  for (const profile of CAPTURE_PROFILES) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...profile.constraints,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      return { stream, profile };
    } catch (error) {
      lastError = error;
      if (!(error instanceof DOMException) || error.name !== 'OverconstrainedError') throw error;
    }
  }
  throw lastError;
}

function actualQualityLabel(settings: MediaTrackSettings): string {
  const resolution = settings.width && settings.height
    ? `${settings.width}×${settings.height}`
    : 'Camera';
  return settings.frameRate
    ? `${resolution} @ ${Math.round(settings.frameRate)} fps`
    : resolution;
}

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Camera access was denied. Allow camera access and try again.';
    if (error.name === 'NotFoundError') return 'No camera was found.';
    if (error.name === 'NotReadableError') return 'The camera is already in use by another app or panel.';
    if (error.name === 'OverconstrainedError') return 'The camera could not provide a supported video format.';
  }
  return 'Unable to start the camera.';
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export function useCameraCapture(
  panelName: string,
  onRecordingComplete: (file: File) => void,
): CameraCaptureHandle {
  const [state, setState] = useState<CameraCaptureState>(() => ({
    ...INITIAL_STATE,
    supportedContainers: supportedRecordingContainers(),
  }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const streamRef = useRef<MediaStream | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingFormatRef = useRef(recordingType('auto'));
  const recordingTimerRef = useRef<number | null>(null);
  const recordingSegmentStartedAtRef = useRef(0);
  const recordingElapsedRef = useRef(0);
  const recordingPausedRef = useRef(false);
  const onRecordingCompleteRef = useRef(onRecordingComplete);
  onRecordingCompleteRef.current = onRecordingComplete;

  const attachStream = useCallback((element: HTMLVideoElement | null) => {
    videoElRef.current = element;
    if (!element) return;
    element.srcObject = streamRef.current;
    element.muted = true;
    if (streamRef.current) element.play().catch(() => {});
  }, []);

  const clearRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const currentRecordingElapsed = useCallback(() => {
    if (recordingPausedRef.current) return recordingElapsedRef.current;
    return recordingElapsedRef.current
      + Math.max(0, performance.now() - recordingSegmentStartedAtRef.current);
  }, []);

  const startRecordingTimer = useCallback(() => {
    clearRecordingTimer();
    recordingTimerRef.current = window.setInterval(() => {
      setState((previous) => ({
        ...previous,
        recordingElapsedMs: currentRecordingElapsed(),
      }));
    }, 100);
  }, [clearRecordingTimer, currentRecordingElapsed]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recordingElapsedRef.current = currentRecordingElapsed();
      recordingPausedRef.current = true;
      clearRecordingTimer();
      recorder.stop();
    }
  }, [clearRecordingTimer, currentRecordingElapsed]);

  const pauseRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recordingElapsedRef.current = currentRecordingElapsed();
    recordingPausedRef.current = true;
    clearRecordingTimer();
    recorder.pause();
    setState((previous) => ({
      ...previous,
      recordingPaused: true,
      recordingElapsedMs: recordingElapsedRef.current,
    }));
  }, [clearRecordingTimer, currentRecordingElapsed]);

  const resumeRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    recorder.resume();
    recordingSegmentStartedAtRef.current = performance.now();
    recordingPausedRef.current = false;
    startRecordingTimer();
    setState((previous) => ({ ...previous, recordingPaused: false }));
  }, [startRecordingTimer]);

  const stopCamera = useCallback(() => {
    stopRecording();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoElRef.current) videoElRef.current.srcObject = null;
    setState((previous) => ({
      ...INITIAL_STATE,
      devices: previous.devices,
      selectedDeviceId: previous.selectedDeviceId,
      recordingContainer: previous.recordingContainer,
      supportedContainers: previous.supportedContainers,
    }));
  }, [stopRecording]);

  const refreshCameras = useCallback(async () => {
    try {
      const devices = await getCameraDevices();
      setState((previous) => {
        const selectionStillExists = devices.some(
          (device) => device.deviceId === previous.selectedDeviceId,
        );
        return {
          ...previous,
          devices,
          selectedDeviceId: selectionStillExists
            ? previous.selectedDeviceId
            : (devices[0]?.deviceId ?? ''),
        };
      });
      return devices;
    } catch {
      return [];
    }
  }, []);

  const startCamera = useCallback(async (deviceId?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState((previous) => ({
        ...previous,
        error: 'Live camera requires a secure HTTPS connection and a supported browser.',
      }));
      return;
    }

    const requestedDeviceId = deviceId ?? stateRef.current.selectedDeviceId;
    stopCamera();
    try {
      const { stream, profile } = await openBestCameraStream(requestedDeviceId);
      streamRef.current = stream;
      const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};
      const devices = await getCameraDevices().catch(() => stateRef.current.devices);
      const selectedDeviceId = settings?.deviceId
        ?? requestedDeviceId
        ?? devices[0]?.deviceId
        ?? '';
      setState({
        active: true,
        recording: false,
        recordingPaused: false,
        recordingElapsedMs: 0,
        frameRate: settings?.frameRate ?? null,
        width: settings?.width ?? 0,
        height: settings?.height ?? 0,
        error: null,
        devices,
        selectedDeviceId,
        qualityLabel: actualQualityLabel(settings),
        qualityWarning: settings.frameRate != null && settings.frameRate < 59
          ? `${profile.label} fallback: this camera is providing ${Math.round(settings.frameRate)} fps.`
          : null,
        recordingContainer: stateRef.current.recordingContainer,
        supportedContainers: stateRef.current.supportedContainers,
        activeRecordingContainer: null,
      });
      if (videoElRef.current) {
        videoElRef.current.srcObject = stream;
        videoElRef.current.muted = true;
        await videoElRef.current.play().catch(() => {});
      }
    } catch (error) {
      setState((previous) => ({ ...previous, error: cameraErrorMessage(error) }));
    }
  }, [stopCamera]);

  const selectCamera = useCallback(async (deviceId: string) => {
    if (!deviceId || deviceId === stateRef.current.selectedDeviceId) return;
    const wasActive = stateRef.current.active;
    setState((previous) => ({ ...previous, selectedDeviceId: deviceId, error: null }));
    if (wasActive) await startCamera(deviceId);
  }, [startCamera]);

  const setRecordingContainer = useCallback((container: RecordingContainer) => {
    if (stateRef.current.recording) return;
    setState((previous) => ({ ...previous, recordingContainer: container }));
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') {
      setState((previous) => ({
        ...previous,
        error: 'Video recording is not supported in this browser.',
      }));
      return;
    }

    try {
      const format = recordingType(stateRef.current.recordingContainer);
      recordingFormatRef.current = format;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, {
        ...(format.mimeType ? { mimeType: format.mimeType } : {}),
        videoBitsPerSecond: 20_000_000,
      });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        clearRecordingTimer();
        recordingPausedRef.current = false;
        setState((previous) => ({
          ...previous,
          recording: false,
          recordingPaused: false,
          error: 'The recording stopped because of a camera error.',
        }));
      };
      recorder.onstop = async () => {
        const { mimeType } = recordingFormatRef.current;
        const type = recorder.mimeType || mimeType || 'video/webm';
        const rawBlob = new Blob(chunksRef.current, { type });
        const durationMs = Math.max(1, currentRecordingElapsed());
        recordingElapsedRef.current = durationMs;
        recordingPausedRef.current = true;
        clearRecordingTimer();
        chunksRef.current = [];
        recorderRef.current = null;
        setState((previous) => ({
          ...previous,
          recording: false,
          recordingPaused: false,
          recordingElapsedMs: 0,
          activeRecordingContainer: null,
        }));
        if (rawBlob.size === 0) return;

        let blob = rawBlob;
        const actualContainer: 'mp4' | 'webm' = type.toLowerCase().includes('mp4') ? 'mp4' : 'webm';
        if (actualContainer === 'webm') {
          try {
            blob = await fixWebmDuration(rawBlob, durationMs, { logger: false });
          } catch {
            setState((previous) => ({
              ...previous,
              error: 'The clip was saved, but its WebM duration metadata could not be repaired.',
            }));
          }
        }

        const fileName = `VeloLens-${panelName.replace(/\s+/g, '-')}-${timestamp()}.${actualContainer}`;
        const file = new File([blob], fileName, { type, lastModified: Date.now() });
        onRecordingCompleteRef.current(file);

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      recorder.start(1000);
      recordingElapsedRef.current = 0;
      recordingSegmentStartedAtRef.current = performance.now();
      recordingPausedRef.current = false;
      startRecordingTimer();
      setState((previous) => ({
        ...previous,
        recording: true,
        recordingPaused: false,
        recordingElapsedMs: 0,
        error: null,
        activeRecordingContainer: format.extension,
      }));
    } catch {
      clearRecordingTimer();
      recordingPausedRef.current = false;
      setState((previous) => ({
        ...previous,
        recording: false,
        recordingPaused: false,
        recordingElapsedMs: 0,
        error: 'Unable to start recording with this camera.',
      }));
    }
  }, [clearRecordingTimer, currentRecordingElapsed, panelName, startRecordingTimer]);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    void refreshCameras();
    const handleDeviceChange = () => { void refreshCameras(); };
    mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    return () => {
      mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
      stopCamera();
    };
  }, [refreshCameras, stopCamera]);

  return {
    state,
    videoRef: attachStream,
    startCamera,
    selectCamera,
    setRecordingContainer,
    stopCamera,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  };
}
