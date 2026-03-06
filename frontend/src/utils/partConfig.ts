import { AvatarPartId } from "../types/avatar";

export const PART_CONFIG: Record<AvatarPartId, {
  zIndex: number;
  parallax: number;
  hasPhysics: boolean;
  physicsConfig?: { stiffness: number; damping: number; gravity: number; maxAngle: number; }
}> = {
  hair_back:       { zIndex: 100,  parallax: 0.25, hasPhysics: true,
                     physicsConfig: { stiffness: 0.15, damping: 0.7, gravity: 0.3, maxAngle: 18 } },
  face:            { zIndex: 300,  parallax: 0.5,  hasPhysics: false },
  left_white:      { zIndex: 500,  parallax: 0.7,  hasPhysics: false },
  right_white:     { zIndex: 500,  parallax: 0.7,  hasPhysics: false },
  left_pupil:      { zIndex: 600,  parallax: 0.72, hasPhysics: false },
  right_pupil:     { zIndex: 600,  parallax: 0.72, hasPhysics: false },
  left_upper_lid:  { zIndex: 700,  parallax: 0.71, hasPhysics: false },
  right_upper_lid: { zIndex: 700,  parallax: 0.71, hasPhysics: false },
  left_brow:       { zIndex: 400,  parallax: 0.75, hasPhysics: false },
  right_brow:      { zIndex: 400,  parallax: 0.75, hasPhysics: false },
  nose:            { zIndex: 800,  parallax: 0.6,  hasPhysics: false },
  mouth:           { zIndex: 900,  parallax: 0.65, hasPhysics: false },
  blush_left:      { zIndex: 1000, parallax: 0.55, hasPhysics: false },
  blush_right:     { zIndex: 1000, parallax: 0.55, hasPhysics: false },
  hair_front:      { zIndex: 1100, parallax: 0.9,  hasPhysics: true,
                     physicsConfig: { stiffness: 0.2, damping: 0.65, gravity: 0.25, maxAngle: 12 } },
  hair_side_left:  { zIndex: 1050, parallax: 0.85, hasPhysics: true,
                     physicsConfig: { stiffness: 0.18, damping: 0.68, gravity: 0.28, maxAngle: 15 } },
  hair_side_right: { zIndex: 1050, parallax: 0.85, hasPhysics: true,
                     physicsConfig: { stiffness: 0.18, damping: 0.68, gravity: 0.28, maxAngle: 15 } },
};
