import { forwardRef } from "react";

const CameraCapture = forwardRef<HTMLVideoElement>((_props, ref) => {
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className="hidden"
    />
  );
});

CameraCapture.displayName = "CameraCapture";

export default CameraCapture;
