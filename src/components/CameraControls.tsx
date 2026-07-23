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
  const showDeviceSelector = camera.state.devices.length > 1;

  const deviceSelector = showDeviceSelector ? (
    <select
      value={camera.state.selectedDeviceId}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        event.stopPropagation();
        void camera.selectCamera(event.target.value);
      }}
      disabled={camera.state.recording}
      className={`${textSize} max-w-36 min-w-0 bg-slate-800 border border-slate-700 text-slate-300 rounded px-1.5 py-1 outline-none hover:border-slate-500 focus:border-blue-500 disabled:opacity-50`}
      title={camera.state.recording ? 'Stop recording before switching cameras' : 'Choose camera'}
      aria-label="Choose camera"
    >
      {camera.state.devices.map((device) => (
        <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
      ))}
    </select>
  ) : null;

  if (!camera.state.active) {
    return (
      <div className="flex items-center justify-center gap-2 min-w-0">
        {deviceSelector}
        <button
          onClick={(event) => {
            event.stopPropagation();
            void camera.startCamera();
          }}
          className={`${textSize} text-blue-400 hover:text-blue-300 py-0.5 transition-colors whitespace-nowrap`}
          title="Show a live view from the selected camera"
        >
          Live camera
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 min-w-0 ${textSize}`}>
      {deviceSelector}
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
