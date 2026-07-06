/**
 * Builds the glowing three.js object rendered for every concept node in the
 * 3D scene: a small unlit core sphere plus a larger additive-blended sprite
 * halo behind it, faking a bloom-style glow without a postprocessing
 * pipeline (none is installed this round -- see worker-graph3d report for the
 * "no new dependencies" constraint). Geometry, material, and the halo texture
 * are built once and shared across every node instance; only the returned
 * Group is unique per node, as ForceGraph3D's `nodeThreeObject` accessor is
 * called once per node.
 */
import * as THREE from "three";
import { ION } from "./sceneColors";

const CORE_RADIUS = 4;
const HALO_SCALE = 22;

let glowTexture: THREE.Texture | null = null;
let coreGeometry: THREE.SphereGeometry | null = null;
let coreMaterial: THREE.MeshBasicMaterial | null = null;
let haloMaterial: THREE.SpriteMaterial | null = null;

/**
 * Lazily builds (once) the radial-gradient canvas texture used for the node
 * halo sprite: opaque white at the center fading to fully transparent at the
 * edge, so additive blending reads as a soft glow rather than a hard disc.
 */
function getGlowTexture(): THREE.Texture {
  if (glowTexture) return glowTexture;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,0.85)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.3)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

/**
 * Returns a fresh ion-colored glowing node object (core sphere + halo
 * sprite) for use as a single concept node's `nodeThreeObject`. Shared
 * geometry/material/texture instances are created on first call and reused
 * on every subsequent call.
 */
export function buildNodeGlowObject(): THREE.Group {
  coreGeometry ??= new THREE.SphereGeometry(CORE_RADIUS, 16, 16);
  coreMaterial ??= new THREE.MeshBasicMaterial({ color: ION });
  haloMaterial ??= new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color: ION,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  const halo = new THREE.Sprite(haloMaterial);
  halo.scale.set(HALO_SCALE, HALO_SCALE, 1);

  const group = new THREE.Group();
  group.add(core);
  group.add(halo);
  return group;
}
