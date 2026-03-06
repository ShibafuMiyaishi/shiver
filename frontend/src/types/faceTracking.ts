export interface FaceTrackingState {
  isTracking: boolean;
  faceDetected: boolean;
  lastError: string | null;
}
