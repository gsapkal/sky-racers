import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
const modelCache = {};

export async function loadModel(path) {
  if (modelCache[path]) {
    return modelCache[path].clone();
  }

  return new Promise((resolve, reject) => {
    loader.load(
      path,
      (gltf) => {
        const model = gltf.scene;
        modelCache[path] = model;
        resolve(model.clone());
      },
      undefined,
      (error) => {
        console.warn(`Failed to load model ${path}:`, error);
        reject(error);
      }
    );
  });
}

// Preload all models at startup
export async function preloadModels() {
  const models = [
    '/models/ferrari.glb',
    '/models/toycar.glb',
  ];

  const results = {};
  for (const path of models) {
    try {
      results[path] = await loadModel(path);
    } catch (e) {
      console.warn(`Skipping model ${path}`);
    }
  }
  return results;
}

// Get a cached model clone, scaled and centered
export function getModelClone(path, scale = 1) {
  if (!modelCache[path]) return null;

  const clone = modelCache[path].clone();

  // Auto-center and scale
  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Normalize to desired scale
  const maxDim = Math.max(size.x, size.y, size.z);
  const scaleFactor = scale / maxDim;
  clone.scale.setScalar(scaleFactor);

  // Center at origin
  clone.position.set(-center.x * scaleFactor, -center.y * scaleFactor + (size.y * scaleFactor) / 2, -center.z * scaleFactor);

  // Wrap in a group so position/rotation is clean
  const group = new THREE.Group();
  group.add(clone);
  return group;
}
