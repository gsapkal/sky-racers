import * as THREE from 'three';

const _sphere = new THREE.Sphere();
const _box = new THREE.Box3();

export function sphereIntersectsBox(sphere, box) {
  const closestPoint = new THREE.Vector3();
  box.clampPoint(sphere.center, closestPoint);
  return closestPoint.distanceToSquared(sphere.center) <= sphere.radius * sphere.radius;
}

export function sphereIntersectsSphere(a, b) {
  const dist = a.center.distanceTo(b.center);
  return dist < a.radius + b.radius;
}

export function distanceToBox(point, box) {
  const closestPoint = new THREE.Vector3();
  box.clampPoint(point, closestPoint);
  return closestPoint.distanceTo(point);
}
