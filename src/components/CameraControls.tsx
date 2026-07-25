import type { CameraCaptureHandle } from '../hooks/useCameraCapture';

function formatRecordingTime(elapsedMs: number): string {
  const totalTenths = Math.floor(elapsedMs / 100);
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const clock = hours > 0
    ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  return `${clock}.${tenths}`;
}

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
  const mp4Supported = camera.state.supportedContainers.includes('mp4');
  const webmSupported = camera.state.supportedContainers.includes('webm');

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

  const formatSelector = (
    <select
      value={camera.state.recordingContainer}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        event.stopPropagation();
        camera.setRecordingContainer(event.target.value as 'auto' | 'mp4' | 'webm');
      }}
      disabled={camera.state.recording}
      className={`${textSize} max-w-28 min-w-0 bg-slate-800 border border-slate-700 text-slate-300 rounded px-1.5 py-1 outline-none hover:border-slate-500 focus:border-blue-500 disabled:opacity-50`}
      title="Recording format"
      aria-label="Recording format"
    >
      <option value="auto">Auto ({mp4Supported ? 'MP4' : 'WebM'})</option>
      <option value="mp4" disabled={!mp4Supported}>MP4</option>
      <option value="webm" disabled={!webmSupported}>WebM</option>
    </select>
  );

  if (!camera.state.active) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2 min-w-0">
        {deviceSelector}
        {formatSelector}
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
    <div className={`flex flex-col items-start gap-0.5 min-w-0 w-full ${textSize}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 w-full">
        {deviceSelector}
        {formatSelector}
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
          className={`relative z-10 flex items-center gap-1 py-0.5 font-medium transition-colors whitespace-nowrap ${
            camera.state.recording ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'
          }`}
        >
          <span className={`inline-block w-2 h-2 ${camera.state.recording ? 'rounded-sm bg-red-400' : 'rounded-full bg-red-500'}`} />
          {camera.state.recording
            ? `Stop & save ${camera.state.activeRecordingContainer?.toUpperCase() ?? ''}`
            : 'Record'}
        </button>
        {camera.state.recording && (
          <>
            <button
              onClick={(event) => {
                event.stopPropagation();
                if (camera.state.recordingPaused) camera.resumeRecording();
                else camera.pauseRecording();
              }}
              className="relative z-10 text-blue-400 hover:text-blue-300 py-0.5 font-medium transition-colors whitespace-nowrap"
              aria-label={camera.state.recordingPaused ? 'Resume recording' : 'Pause recording'}
            >
              {camera.state.recordingPaused ? 'Resume' : 'Pause'}
            </button>
            <span
              className={`font-mono tabular-nums whitespace-nowrap ${
                camera.state.recordingPaused ? 'text-amber-400' : 'text-red-400'
              }`}
              title={camera.state.recordingPaused ? 'Recording paused' : 'Active recording time'}
              aria-label={`Active recording time ${formatRecordingTime(camera.state.recordingElapsedMs)}`}
            >
              {formatRecordingTime(camera.state.recordingElapsedMs)}
            </span>
          </>
        )}
        {fps && (
          <span
            className={`${fps >= 59 ? 'text-slate-600' : 'text-amber-400'} whitespace-nowrap`}
            title={fps >= 59 ? 'Camera is providing approximately 60 fps' : 'Camera or browser frame-rate limit'}
          >
            {fps} fps
          </span>
        )}
      </div>
      {camera.state.qualityWarning && (
        <span className="text-amber-400 whitespace-normal leading-tight pointer-events-none">{camera.state.qualityWarning}</span>
      )}
    </div>
  );
}
