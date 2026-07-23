import type { CameraCaptureHandle } from '../hooks/useCameraCapture';

export default function CameraControls({
  camera,
  compact = false,
}: {
  camera: CameraCaptureHandle;
  compact?: boolean;
}) {
  const textSize = compact ? 'text-[11px]' : 'text-xs';
  const fps = camera.state.frameRate ? Math.round(camera.state.frameRate) : null;

  if (!camera.state.active) {
    return (
      <button
        onClick={(event) => {
          event.stopPropagation();
          void camera.startCamera();
        }}
        className={`${textSize} text-blue-400 hover:text-blue-300 py-0.5 transition-colors whitespace-nowrap`}
        title="Show a live view from an attached camera"
      >
        Live camera
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-2 min-w-0 ${textSize}`}>
      <button
        onClick={(event) => {
          event.stopPropagation();
          camera.stopCamera();
        }}
        className="text-slate-500 hover:text-slate-300 py-0.5 transition-colors whitespace-nowrap"
      >
        Stop camera
      </button>
      <span className="text-slate-700">|</span>
      <button
        onClick={(event) => {
          event.stopPropagation();
          if (camera.state.recording) camera.stopRecording();
          else camera.startRecording();
        }}
        className={`flex items-center gap-1 py-0.5 font-medium transition-colors whitespace-nowrap ${
          camera.state.recording ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'
        }`}
      >
        <span className={`inline-block w-2 h-2 ${camera.state.recording ? 'rounded-sm bg-red-400' : 'rounded-full bg-red-500'}`} />
        {camera.state.recording ? 'Stop & save' : 'Record'}
      </button>
      {fps && (
        <span
          className="text-slate-600 whitespace-nowrap"
          title={fps >= 59 ? 'Camera is providing approximately 60 fps' : 'Camera or browser frame-rate limit'}
        >
          {fps} fps
        </span>
      )}
    </div>
  );
}
