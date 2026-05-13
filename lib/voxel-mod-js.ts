export const VOXEL_MOD_JS = String.raw`(function () {
  if (window.__cmgVoxel3dInstalled) return;
  window.__cmgVoxel3dInstalled = true;

  console.info('[cmg-voxel] loader running');

  const STORAGE_KEY = 'cmg_mod_voxel_3d';
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
  const GRID_W = 64;
  const GRID_H = 48;
  const CUBE_SIZE = 0.9;
  const MAX_HEIGHT = 6;

  let teardown = null;

  function loadThree() {
    return new Promise((resolve, reject) => {
      if (window.THREE) { resolve(window.THREE); return; }
      const s = document.createElement('script');
      s.src = THREE_URL;
      s.async = true;
      s.onload = () => resolve(window.THREE);
      s.onerror = () => reject(new Error('Failed to load three.js'));
      document.head.appendChild(s);
    });
  }

  function findGameCanvas() {
    const candidates = Array.from(document.querySelectorAll('canvas'))
      .filter((c) => c.id !== 'cmg-voxel-overlay');
    const visible = candidates.filter((c) => c.offsetWidth > 0 && c.offsetHeight > 0);
    const pool = visible.length ? visible : candidates;
    return pool.sort((a, b) => (a.width * a.height) - (b.width * b.height)).pop() || null;
  }

  function waitForCanvas() {
    return new Promise((resolve) => {
      const found = findGameCanvas();
      if (found) { resolve(found); return; }
      const observer = new MutationObserver(() => {
        const c = findGameCanvas();
        if (c) {
          observer.disconnect();
          resolve(c);
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        resolve(findGameCanvas());
      }, 15000);
    });
  }

  async function install() {
    let THREE;
    try {
      THREE = await loadThree();
      console.info('[cmg-voxel] three.js loaded', THREE && THREE.REVISION);
    } catch (err) {
      console.warn('[cmg-voxel] three.js failed to load', err);
      return;
    }

    const sourceCanvas = await waitForCanvas();
    if (!sourceCanvas) {
      console.warn('[cmg-voxel] No source canvas found in this game');
      return;
    }
    console.info('[cmg-voxel] source canvas', sourceCanvas.width, 'x', sourceCanvas.height);

    const prevSourceOpacity = sourceCanvas.style.opacity;
    sourceCanvas.style.opacity = '0';

    const overlay = document.createElement('canvas');
    overlay.id = 'cmg-voxel-overlay';
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.zIndex = '2147483646';
    overlay.style.pointerEvents = 'none';
    overlay.style.background = '#05060d';
    document.body.appendChild(overlay);

    const scratch = document.createElement('canvas');
    scratch.width = GRID_W;
    scratch.height = GRID_H;
    const sctx = scratch.getContext('2d', { willReadFrequently: true });

    const renderer = new THREE.WebGLRenderer({ canvas: overlay, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060d);
    scene.fog = new THREE.Fog(0x05060d, 60, 140);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    camera.position.set(0, 38, 56);
    camera.lookAt(0, 0, 0);

    const setRendererSize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
      camera.updateProjectionMatrix();
    };

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(20, 40, 30);
    scene.add(keyLight);
    const rim = new THREE.DirectionalLight(0x8899ff, 0.4);
    rim.position.set(-30, 20, -20);
    scene.add(rim);

    const geom = new THREE.BoxGeometry(CUBE_SIZE, 1, CUBE_SIZE);
    const mat = new THREE.MeshLambertMaterial();
    const count = GRID_W * GRID_H;
    const mesh = new THREE.InstancedMesh(geom, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);

    const tmpObj = new THREE.Object3D();
    const tmpColor = new THREE.Color();
    const offsetX = -((GRID_W - 1) * CUBE_SIZE) / 2;
    const offsetZ = -((GRID_H - 1) * CUBE_SIZE) / 2;

    // Initialize all instances so they exist even before the first pixel readback.
    for (let i = 0; i < count; i++) {
      tmpObj.position.set(0, 0.5, 0);
      tmpObj.scale.set(1, 1, 1);
      tmpObj.updateMatrix();
      mesh.setMatrixAt(i, tmpObj.matrix);
      tmpColor.setRGB(0.5, 0.5, 0.5);
      mesh.setColorAt(i, tmpColor);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    setRendererSize();

    let rafId = 0;
    let stopped = false;
    let frameCount = 0;

    function frame() {
      if (stopped) return;
      try {
        sctx.drawImage(sourceCanvas, 0, 0, GRID_W, GRID_H);
        const data = sctx.getImageData(0, 0, GRID_W, GRID_H).data;
        for (let y = 0; y < GRID_H; y++) {
          for (let x = 0; x < GRID_W; x++) {
            const i = (y * GRID_W + x) * 4;
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;
            const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
            const height = 0.2 + brightness * MAX_HEIGHT;

            const idx = y * GRID_W + x;
            tmpObj.position.set(
              offsetX + x * CUBE_SIZE,
              height / 2,
              offsetZ + y * CUBE_SIZE,
            );
            tmpObj.scale.set(1, height, 1);
            tmpObj.updateMatrix();
            mesh.setMatrixAt(idx, tmpObj.matrix);
            tmpColor.setRGB(r, g, b);
            mesh.setColorAt(idx, tmpColor);
          }
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        renderer.render(scene, camera);
        if (frameCount === 0) console.info('[cmg-voxel] first frame rendered');
        frameCount++;
      } catch (err) {
        if (frameCount < 3) console.warn('[cmg-voxel] frame error', err);
      }
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    const onResize = () => setRendererSize();
    window.addEventListener('resize', onResize);

    teardown = () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      try { renderer.dispose(); } catch (_) { /* ignore */ }
      try { geom.dispose(); } catch (_) { /* ignore */ }
      try { mat.dispose(); } catch (_) { /* ignore */ }
      try { overlay.remove(); } catch (_) { /* ignore */ }
      try { sourceCanvas.style.opacity = prevSourceOpacity; } catch (_) { /* ignore */ }
      teardown = null;
      window.__cmgVoxel3dInstalled = false;
    };
  }

  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    if (e.newValue !== '1' && teardown) {
      teardown();
    } else if (e.newValue === '1' && !teardown) {
      install();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
`;
