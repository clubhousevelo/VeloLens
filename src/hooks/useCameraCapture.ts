import { useCallback, useEffect, useRef, useState } from 'react';

export interface CameraCaptureState {
  active: boolean;
  recording: boolean;
  frameRate: number | null;
  width: number;
  height: number;
  error: string | null;
}

export interface CameraCaptureHandle {
  state: CameraCaptureState;
  videoRef: React.RefCallback<HTMLVideoElement | null>;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  startRecording: () => void;
  stopRecording: () => void;
}

const INITIAL_STATE: CameraCaptureState = {
  active: false,
  recording: false,
  frameRate: null,
  width: 0,
  height: 0,
  error: null,
};

function recordingType(): { mimeType: string; extension: string } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: '', extension: 'webm' };
  }
  const candidates = [
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
    { mimeType: 'video/mp4;codecs=h264', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm', extension: 'webm' },
  ];
  return candidates.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType))
    ?? { mimeType: '', extension: 'webm' };
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
  const [state, setState] = useState(INITIAL_STATE);
  const streamRef = useRef<MediaStream | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingFormatRef = useRef(recordingType());
  const onRecordingCompleteRef = useRef(onRecordingComplete);
  onRecordingCompleteRef.current = onRecordingComplete;

  const attachStream = useCallback((element: HTMLVideoElement | null) => {
    videoElRef.current = element;
    if (!element) return;
    element.srcObject = streamRef.current;
    element.muted = true;
    if (streamRef.current) element.play().catch(() => {});
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  const stopCamera = useCallback(() => {
    stopRecording();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoElRef.current) videoElRef.current.srcObject = null;
    setState(INITIAL_STATE);
  }, [stopRecording]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState((previous) => ({
        ...previous,
        error: 'Live camera requires a secure HTTPS connection and a supported browser.',
      }));
      return;
    }

    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60, max: 60 },
        },
      });
      streamRef.current = stream;
      const settings = stream.getVideoTracks()[0]?.getSettings();
      setState({
        active: true,
        recording: false,
        frameRate: settings?.frameRate ?? null,
        width: settings?.width ?? 0,
        height: settings?.height ?? 0,
        error: null,
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
      const format = recordingType();
      recordingFormatRef.current = format;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, {
        ...(format.mimeType ? { mimeType: format.mimeType } : {}),
        videoBitsPerSecond: 12_000_000,
      });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setState((previous) => ({
          ...previous,
          recording: false,
          error: 'The recording stopped because of a camera error.',
        }));
      };
      recorder.onstop = () => {
        const { mimeType, extension } = recordingFormatRef.current;
        const type = recorder.mimeType || mimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        recorderRef.current = null;
        setState((previous) => ({ ...previous, recording: false }));
        if (blob.size === 0) return;

        const fileName = `VeloLens-${panelName.replace(/\s+/g, '-')}-${timestamp()}.${extension}`;
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
      setState((previous) => ({ ...previous, recording: true, error: null }));
    } catch {
      setState((previous) => ({
        ...previous,
        recording: false,
        error: 'Unable to start recording with this camera.',
      }));
    }
  }, [panelName]);

  useEffect(() => stopCamera, [stopCamera]);

  return {
    state,
    videoRef: attachStream,
    startCamera,
    stopCamera,
    startRecording,
    stopRecording,
  };
}
