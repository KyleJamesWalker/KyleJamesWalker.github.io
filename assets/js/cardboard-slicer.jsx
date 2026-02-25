/**
 * Cardboard Slicer
 */
import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Upload, Download, Layers, Ruler, Square, Play, Loader } from 'lucide-react';

// --- STL Parsing Utilities ---
function parseSTLAscii(text) {
  const triangles = [];
  const lines = text.split('\n');
  let currentTri = [];
  for (let line of lines) {
    line = line.trim();
    if (line.startsWith('vertex')) {
      const parts = line.split(/\s+/);
      currentTri.push({
        x: parseFloat(parts[1]),
        y: parseFloat(parts[2]),
        z: parseFloat(parts[3])
      });
      if (currentTri.length === 3) {
        triangles.push(currentTri);
        currentTri = [];
      }
    }
  }
  return triangles;
}

function parseSTLBinary(buffer) {
  const dataView = new DataView(buffer);
  const numTriangles = dataView.getUint32(80, true);
  const triangles = [];
  let offset = 84;
  for (let i = 0; i < numTriangles; i++) {
    // Skip 12 bytes for normal
    const v1 = {
      x: dataView.getFloat32(offset + 12, true),
      y: dataView.getFloat32(offset + 16, true),
      z: dataView.getFloat32(offset + 20, true)
    };
    const v2 = {
      x: dataView.getFloat32(offset + 24, true),
      y: dataView.getFloat32(offset + 28, true),
      z: dataView.getFloat32(offset + 32, true)
    };
    const v3 = {
      x: dataView.getFloat32(offset + 36, true),
      y: dataView.getFloat32(offset + 40, true),
      z: dataView.getFloat32(offset + 44, true)
    };
    triangles.push([v1, v2, v3]);
    offset += 50;
  }
  return triangles;
}

function parseSTL(buffer) {
  const view = new Uint8Array(buffer);
  const headerText = new TextDecoder().decode(view.subarray(0, 200));
  if (headerText.includes("solid") && headerText.includes("facet normal")) {
    return parseSTLAscii(new TextDecoder().decode(buffer));
  }
  return parseSTLBinary(buffer);
}

// --- Geometry Math & Slicing ---
function normalizeTriangles(triangles, targetHeight) {
  let minZ = Infinity, maxZ = -Infinity;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const tri of triangles) {
    for (const v of tri) {
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
  }

  const rawHeight = maxZ - minZ;
  const scale = targetHeight / rawHeight;

  const cX = (minX + maxX) / 2;
  const cY = (minY + maxY) / 2;
  const cZ = minZ;

  const scaledTriangles = triangles.map(tri =>
    tri.map(v => ({
      x: (v.x - cX) * scale,
      y: (v.y - cY) * scale,
      z: (v.z - cZ) * scale
    }))
  );

  return {
    triangles: scaledTriangles,
    width: (maxX - minX) * scale,
    length: (maxY - minY) * scale,
    height: targetHeight
  };
}

function intersectTriangleZ(v1, v2, v3, z) {
  const pts = [v1, v2, v3].sort((a, b) => a.z - b.z);
  if (z < pts[0].z || z > pts[2].z) return null;
  if (z === pts[0].z && z === pts[2].z) return null;

  const interpolate = (pA, pB, zTarget) => {
    if (pB.z === pA.z) return { x: pA.x, y: pA.y };
    const t = (zTarget - pA.z) / (pB.z - pA.z);
    return {
      x: pA.x + t * (pB.x - pA.x),
      y: pA.y + t * (pB.y - pA.y)
    };
  };

  const p1 = interpolate(pts[0], pts[2], z);
  let p2 = z <= pts[1].z ? interpolate(pts[0], pts[1], z) : interpolate(pts[1], pts[2], z);

  if (Math.abs(p1.x - p2.x) < 1e-5 && Math.abs(p1.y - p2.y) < 1e-5) return null;
  return { p1, p2 };
}

function connectSegments(segments) {
  let paths = [];
  let remaining = [...segments];
  const EPSILON = 1e-5;
  const getDistSq = (pA, pB) => (pA.x - pB.x) ** 2 + (pA.y - pB.y) ** 2;

  while (remaining.length > 0) {
    let currentPath = [];
    let currentSeg = remaining.pop();
    currentPath.push(currentSeg.p1, currentSeg.p2);

    let changed = true;
    while (changed) {
      changed = false;
      let head = currentPath[0];
      let tail = currentPath[currentPath.length - 1];

      for (let i = 0; i < remaining.length; i++) {
        let seg = remaining[i];
        if (getDistSq(seg.p1, tail) < EPSILON) {
          currentPath.push(seg.p2); remaining.splice(i, 1); changed = true; break;
        } else if (getDistSq(seg.p2, tail) < EPSILON) {
          currentPath.push(seg.p1); remaining.splice(i, 1); changed = true; break;
        } else if (getDistSq(seg.p1, head) < EPSILON) {
          currentPath.unshift(seg.p2); remaining.splice(i, 1); changed = true; break;
        } else if (getDistSq(seg.p2, head) < EPSILON) {
          currentPath.unshift(seg.p1); remaining.splice(i, 1); changed = true; break;
        }
      }
    }

    // Close the loop if head meets tail
    if (currentPath.length > 2 && getDistSq(currentPath[0], currentPath[currentPath.length - 1]) < EPSILON) {
      currentPath.pop();
    }
    paths.push(currentPath);
  }
  return paths;
}

export default function App() {
  // App State
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("Idle. Upload an STL file to begin.");
  const [progress, setProgress] = useState(0);
  const [modelData, setModelData] = useState(null);
  const [slices, setSlices] = useState([]);

  // Settings State
  const [targetHeight, setTargetHeight] = useState(100); // mm
  const [sliceMode, setSliceMode] = useState('thickness'); // 'thickness' or 'count'
  const [layerThickness, setLayerThickness] = useState(4); // mm
  const [layerCount, setLayerCount] = useState(25);

  // Refs for 3D and 2D rendering
  const threeContainerRef = useRef(null);
  const leftCanvasRef = useRef(null);
  const rightCanvasRef = useRef(null);
  const blueprintCanvasRef = useRef(null);
  const scenesRef = useRef({ scene1: null, scene2: null, renderer1: null, renderer2: null, camera1: null, camera2: null });

  // Handle File Upload
  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);
    setStatus("Parsing STL file...");

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawTriangles = parseSTL(event.target.result);
        const normalized = normalizeTriangles(rawTriangles, targetHeight);
        setModelData({ rawTriangles, ...normalized });
        setStatus("STL Loaded. Ready to slice.");
        setSlices([]); // Clear old slices
      } catch (err) {
        setStatus("Error parsing STL. Please ensure it's a valid 3D model.");
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  // Re-normalize if target height changes
  useEffect(() => {
    if (modelData && modelData.rawTriangles) {
      setModelData(prev => ({ ...prev, ...normalizeTriangles(prev.rawTriangles, targetHeight) }));
      setSlices([]); // Clear old slices since the model scale changed
    }
  }, [targetHeight]);

  // Main Slicing Engine
  const generateSlices = () => {
    if (!modelData) return;

    const actualThickness = sliceMode === 'thickness' ? layerThickness : targetHeight / layerCount;
    const actualCount = sliceMode === 'count' ? layerCount : Math.floor(targetHeight / actualThickness);

    setStatus("Slicing geometry...");
    setProgress(0);
    const newSlices = [];
    let currentLayer = 0;
    const zStart = actualThickness / 2;

    const processLayer = () => {
      if (currentLayer >= actualCount) {
        setSlices(newSlices);
        setStatus(`Sliced ${actualCount} layers successfully.`);
        setProgress(100);
        return;
      }

      const z = zStart + currentLayer * actualThickness;
      const segments = [];
      for (const tri of modelData.triangles) {
        const seg = intersectTriangleZ(tri[0], tri[1], tri[2], z);
        if (seg) segments.push(seg);
      }

      const paths = connectSegments(segments);
      newSlices.push(paths);

      currentLayer++;
      setProgress((currentLayer / actualCount) * 100);

      // Yield to main thread to keep UI responsive
      setTimeout(processLayer, 0);
    };

    processLayer();
  };

  // Initialize and Synchronize Three.js Scenes
  useEffect(() => {
    if (!leftCanvasRef.current || !rightCanvasRef.current) return;

    // Setup Renderers
    const renderer1 = new THREE.WebGLRenderer({ canvas: leftCanvasRef.current, antialias: true, alpha: true });
    const renderer2 = new THREE.WebGLRenderer({ canvas: rightCanvasRef.current, antialias: true, alpha: true });

    const updateSize = () => {
      const parent = leftCanvasRef.current.parentElement;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      renderer1.setSize(w, h);
      renderer2.setSize(w, h);
      scenesRef.current.camera1.aspect = w / h;
      scenesRef.current.camera1.updateProjectionMatrix();
      scenesRef.current.camera2.aspect = w / h;
      scenesRef.current.camera2.updateProjectionMatrix();
    };

    // Setup Scenes
    const scene1 = new THREE.Scene();
    const scene2 = new THREE.Scene();

    // Add Lighting
    const addLights = (scene) => {
      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      const directional = new THREE.DirectionalLight(0xffffff, 0.8);
      directional.position.set(1, 1, 1);
      const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
      backLight.position.set(-1, -0.5, -1);
      scene.add(ambient, directional, backLight);
    };
    addLights(scene1);
    addLights(scene2);

    // Setup Cameras
    const camera1 = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    const camera2 = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);

    scenesRef.current = { scene1, scene2, renderer1, renderer2, camera1, camera2 };
    updateSize();
    window.addEventListener('resize', updateSize);

    // Custom Orbit Controls (Synchronized)
    let isInteracting = false;
    let prevMouse = { x: 0, y: 0 };
    let theta = Math.PI / 4, phi = Math.PI / 3, radius = 300;
    let target = new THREE.Vector3(0, 50, 0);

    const updateCameras = () => {
      const x = radius * Math.sin(phi) * Math.cos(theta) + target.x;
      const y = radius * Math.cos(phi) + target.y;
      const z = radius * Math.sin(phi) * Math.sin(theta) + target.z;

      camera1.position.set(x, y, z);
      camera1.lookAt(target);
      camera2.position.set(x, y, z);
      camera2.lookAt(target);

      renderer1.render(scene1, camera1);
      renderer2.render(scene2, camera2);
    };

    const handleMouseDown = (e) => { isInteracting = true; prevMouse = { x: e.clientX, y: e.clientY }; };
    const handleMouseUp = () => { isInteracting = false; };
    const handleMouseMove = (e) => {
      if (!isInteracting) return;

      const deltaX = e.clientX - prevMouse.x;
      const deltaY = e.clientY - prevMouse.y;

      if (e.buttons === 1 && !e.shiftKey) {
        // Left click (without Shift): Rotate
        theta -= deltaX * 0.01;
        phi -= deltaY * 0.01;
        phi = Math.max(0.01, Math.min(Math.PI - 0.01, phi));
      } else if (e.buttons === 2 || e.buttons === 4 || (e.buttons === 1 && e.shiftKey)) {
        // Right/Middle click or Shift+Left: Pan
        // Scale pan speed based on current zoom radius so it feels consistent
        const panSpeed = radius * 0.002;

        // Get the camera's local X and Y axes to know which way is "right" and "up" in the current view
        const vRight = new THREE.Vector3().setFromMatrixColumn(camera1.matrix, 0);
        const vUp = new THREE.Vector3().setFromMatrixColumn(camera1.matrix, 1);

        vRight.multiplyScalar(-deltaX * panSpeed);
        vUp.multiplyScalar(deltaY * panSpeed);

        target.add(vRight);
        target.add(vUp);
      }

      prevMouse = { x: e.clientX, y: e.clientY };
      updateCameras();
    };
    const handleWheel = (e) => {
      e.preventDefault();
      radius += e.deltaY * 0.2;
      radius = Math.max(10, radius);
      updateCameras();
    };
    const handleContextMenu = (e) => e.preventDefault();

    const container = threeContainerRef.current;
    if (container) {
      container.addEventListener('mousedown', handleMouseDown);
      container.addEventListener('contextmenu', handleContextMenu);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    updateCameras();

    return () => {
      window.removeEventListener('resize', updateSize);
      if (container) {
        container.removeEventListener('mousedown', handleMouseDown);
        container.removeEventListener('contextmenu', handleContextMenu);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, []);

  // Render Original 3D Model
  useEffect(() => {
    const { scene1, renderer1, camera1 } = scenesRef.current;
    if (!scene1 || !modelData) return;

    // Clear old mesh
    const oldMesh = scene1.getObjectByName('originalMesh');
    if (oldMesh) scene1.remove(oldMesh);

    // Build BufferGeometry
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(modelData.triangles.length * 9);
    let i = 0;
    modelData.triangles.forEach(tri => {
      tri.forEach(v => { positions[i++] = v.x; positions[i++] = v.y; positions[i++] = v.z; });
    });
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'originalMesh';
    mesh.rotation.x = -Math.PI / 2; // Make Z point UP
    scene1.add(mesh);

    renderer1.render(scene1, camera1);
  }, [modelData]);

  // Render Blocky Sliced 3D Model
  useEffect(() => {
    const { scene2, renderer2, camera2 } = scenesRef.current;
    if (!scene2) return;

    const oldGroup = scene2.getObjectByName('slicedGroup');
    if (oldGroup) scene2.remove(oldGroup);

    if (slices.length === 0) {
      renderer2.render(scene2, camera2);
      return;
    }

    const group = new THREE.Group();
    group.name = 'slicedGroup';
    const actualThickness = sliceMode === 'thickness' ? layerThickness : targetHeight / layerCount;

    // Extrude Settings
    const extrudeSettings = { depth: actualThickness * 0.95, bevelEnabled: false };
    const material = new THREE.MeshStandardMaterial({ color: 0xcd853f, roughness: 0.8 }); // Cardboard color
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x5c3a21 });

    slices.forEach((layerPaths, idx) => {
      const zOffset = idx * actualThickness;
      layerPaths.forEach(path => {
        if (path.length < 3) return;
        try {
          const shape = new THREE.Shape();
          shape.moveTo(path[0].x, path[0].y);
          for(let i=1; i<path.length; i++) {
            shape.lineTo(path[i].x, path[i].y);
          }

          const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.z = zOffset;
          group.add(mesh);

          const edges = new THREE.EdgesGeometry(geometry);
          const line = new THREE.LineSegments(edges, edgeMat);
          line.position.z = zOffset;
          group.add(line);
        } catch (e) {
          // Fallback if ThreeJS Earcut fails on complex path self-intersections
          const points = path.map(p => new THREE.Vector3(p.x, p.y, zOffset));
          const geo = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff0000 }));
          group.add(line);
        }
      });
    });

    group.rotation.x = -Math.PI / 2; // Make Z point UP
    scene2.add(group);
    renderer2.render(scene2, camera2);

  }, [slices, sliceMode, layerThickness, layerCount, targetHeight]);

  // Render 2D Blueprint Canvas
  useEffect(() => {
    const canvas = blueprintCanvasRef.current;
    if (!canvas || !modelData) return;
    const ctx = canvas.getContext('2d');

    if (slices.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#9ca3af';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Generate slices to view 2D blueprint', canvas.width/2, canvas.height/2);
      return;
    }

    const padding = 20; // mm padding between cuts
    const boxW = modelData.width + padding;
    const boxH = modelData.length + padding;

    // Calculate layout grid
    const cols = Math.ceil(Math.sqrt(slices.length));
    const rows = Math.ceil(slices.length / cols);

    const pixelsPerMm = 4; // Scale for the HTML Canvas viewing
    canvas.width = cols * boxW * pixelsPerMm;
    canvas.height = rows * boxH * pixelsPerMm;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.scale(pixelsPerMm, pixelsPerMm);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#000000'; // Laser cut path color

    slices.forEach((layerPaths, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const offsetX = col * boxW + (boxW / 2); // Center in grid cell
      const offsetY = row * boxH + (boxH / 2);

      ctx.save();
      ctx.translate(offsetX, offsetY);

      // Draw Paths
      ctx.beginPath();
      layerPaths.forEach(path => {
        if(path.length === 0) return;
        ctx.moveTo(path[0].x, -path[0].y); // Canvas Y is flipped compared to standard Cartesian
        for(let i=1; i<path.length; i++) {
          ctx.lineTo(path[i].x, -path[i].y);
        }
        ctx.closePath();
      });
      ctx.stroke();

      // Draw Label
      ctx.fillStyle = '#ef4444'; // Red label for etching/info
      ctx.font = '4px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Layer ${idx + 1}`, 0, (boxH/2) - 5);

      ctx.restore();
    });
  }, [slices, modelData]);

  // Export SVG Feature
  const downloadSVG = () => {
    if (slices.length === 0 || !modelData) return;

    const padding = 10;
    const boxW = modelData.width + padding;
    const boxH = modelData.length + padding;
    const cols = Math.ceil(Math.sqrt(slices.length));
    const rows = Math.ceil(slices.length / cols);

    const totalW = cols * boxW;
    const totalH = rows * boxH;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}mm" height="${totalH}mm">\n`;
    svg += `<style>path { fill: none; stroke: black; stroke-width: 0.1px; } text { font-family: sans-serif; font-size: 5px; fill: red; }</style>\n`;

    slices.forEach((layerPaths, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const offsetX = col * boxW + (boxW / 2);
      const offsetY = row * boxH + (boxH / 2);

      svg += `<g transform="translate(${offsetX}, ${offsetY})">\n`;
      svg += `<text x="0" y="${(boxH/2) - 2}" text-anchor="middle">Layer ${idx + 1}</text>\n`;

      layerPaths.forEach(path => {
        if(path.length === 0) return;
        let d = `M ${path[0].x} ${-path[0].y} `; // Flip Y for SVG coords
        for(let i=1; i<path.length; i++) {
          d += `L ${path[i].x} ${-path[i].y} `;
        }
        d += "Z";
        svg += `<path d="${d}" />\n`;
      });
      svg += `</g>\n`;
    });

    svg += `</svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laser_slices_${file?.name || 'model'}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-neutral-100 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-neutral-950 border-b border-neutral-800">
        <div className="flex items-center space-x-3">
          <Layers className="w-6 h-6 text-orange-500" />
          <h1 className="text-xl font-bold tracking-wide">Cardboard Slicer Pro</h1>
        </div>
        <div className="text-sm text-neutral-400 flex items-center">
          <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
          {status}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar Controls */}
        <aside className="w-80 bg-neutral-900 border-r border-neutral-800 flex flex-col p-6 overflow-y-auto shadow-xl z-10">

          {/* Upload Section */}
          <div className="mb-8">
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-neutral-700 border-dashed rounded-lg cursor-pointer hover:bg-neutral-800 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-8 h-8 mb-2 text-neutral-400" />
                <p className="mb-1 text-sm font-semibold">Click to upload STL</p>
                <p className="text-xs text-neutral-500">Binary or ASCII Supported</p>
              </div>
              <input type="file" accept=".stl" className="hidden" onChange={handleFileUpload} />
            </label>
            {file && <div className="mt-2 text-sm text-orange-400 truncate">Loaded: {file.name}</div>}
          </div>

          {/* Model Dimensions Info */}
          {modelData && (
            <div className="mb-8 p-4 bg-neutral-950 rounded-lg border border-neutral-800">
              <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-3 font-semibold">Model Dimensions (Scaled)</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-neutral-900 p-2 rounded"><div className="text-xs text-neutral-400">Width (X)</div><div className="font-mono text-sm">{modelData.width.toFixed(1)}</div></div>
                <div className="bg-neutral-900 p-2 rounded"><div className="text-xs text-neutral-400">Length (Y)</div><div className="font-mono text-sm">{modelData.length.toFixed(1)}</div></div>
                <div className="bg-neutral-900 p-2 rounded border border-orange-500/30"><div className="text-xs text-orange-400">Height (Z)</div><div className="font-mono text-sm">{modelData.height.toFixed(1)}</div></div>
              </div>
            </div>
          )}

          {/* Slicing Parameters */}
          <div className="space-y-6 flex-1">
            <div>
              <label className="flex items-center text-sm font-medium mb-2 text-neutral-300">
                <Ruler className="w-4 h-4 mr-2 text-neutral-500"/> Overall Height (mm)
              </label>
              <input
                type="number"
                value={targetHeight}
                onChange={(e) => setTargetHeight(Number(e.target.value))}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-md py-2 px-3 focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>

            <div>
               <label className="flex items-center text-sm font-medium mb-2 text-neutral-300">
                <Square className="w-4 h-4 mr-2 text-neutral-500"/> Slicing Method
              </label>
              <div className="flex bg-neutral-950 rounded-md p-1 border border-neutral-800">
                <button
                  className={`flex-1 text-sm py-1.5 rounded-sm transition-colors ${sliceMode === 'thickness' ? 'bg-neutral-800 shadow text-white' : 'text-neutral-500 hover:text-white'}`}
                  onClick={() => setSliceMode('thickness')}
                >By Thickness</button>
                <button
                  className={`flex-1 text-sm py-1.5 rounded-sm transition-colors ${sliceMode === 'count' ? 'bg-neutral-800 shadow text-white' : 'text-neutral-500 hover:text-white'}`}
                  onClick={() => setSliceMode('count')}
                >By Count</button>
              </div>
            </div>

            {sliceMode === 'thickness' ? (
              <div>
                <label className="block text-sm font-medium mb-2 text-neutral-300">Layer Thickness (mm)</label>
                <input
                  type="number" step="0.1"
                  value={layerThickness}
                  onChange={(e) => setLayerThickness(Number(e.target.value))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-md py-2 px-3 focus:outline-none focus:border-orange-500"
                />
                <p className="text-xs text-neutral-500 mt-2">Will produce ~{Math.floor(targetHeight / layerThickness)} layers.</p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-2 text-neutral-300">Total Layer Count</label>
                <input
                  type="number"
                  value={layerCount}
                  onChange={(e) => setLayerCount(Number(e.target.value))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-md py-2 px-3 focus:outline-none focus:border-orange-500"
                />
                <p className="text-xs text-neutral-500 mt-2">Each layer will be {(targetHeight / layerCount).toFixed(2)}mm thick.</p>
              </div>
            )}

            <button
              onClick={generateSlices}
              disabled={!modelData || progress > 0 && progress < 100}
              className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-semibold rounded-md transition-colors flex items-center justify-center shadow-lg shadow-orange-900/20"
            >
              {(progress > 0 && progress < 100) ? (
                <><Loader className="w-5 h-5 mr-2 animate-spin" /> Processing {Math.round(progress)}%</>
              ) : (
                <><Play className="w-5 h-5 mr-2" /> Generate Slices</>
              )}
            </button>
          </div>

          {/* Export Action */}
          <div className="pt-6 mt-6 border-t border-neutral-800">
            <button
              onClick={downloadSVG}
              disabled={slices.length === 0}
              className="w-full py-3 bg-white text-black hover:bg-neutral-200 disabled:bg-neutral-800 disabled:text-neutral-500 font-semibold rounded-md transition-colors flex items-center justify-center"
            >
              <Download className="w-5 h-5 mr-2" /> Download SVG Blueprint
            </button>
          </div>

        </aside>

        {/* Viewports Area */}
        <main className="flex-1 flex flex-col min-w-0">

          {/* 3D Split View */}
          <div
            ref={threeContainerRef}
            className="flex-1 border-b border-neutral-800 flex relative cursor-move bg-gradient-to-b from-neutral-800 to-neutral-950"
          >
            {/* Sync Camera Overlay instructions */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none bg-black/40 px-3 py-1.5 rounded-full text-xs text-neutral-300 border border-white/10 backdrop-blur-sm shadow-xl whitespace-nowrap">
              Left-click: Rotate • Right-click (or Shift+click): Pan • Scroll: Zoom
            </div>

            {/* Left: Original */}
            <div className="flex-1 relative border-r border-black/50">
              <div className="absolute bottom-4 left-4 z-10 bg-black/60 px-2 py-1 rounded text-xs text-neutral-400">Original Model</div>
              <canvas ref={leftCanvasRef} className="w-full h-full block" />
            </div>

            {/* Right: Sliced */}
            <div className="flex-1 relative border-l border-white/5">
              <div className="absolute bottom-4 right-4 z-10 bg-black/60 px-2 py-1 rounded text-xs text-orange-400 font-medium">Cardboard Preview</div>
              <canvas ref={rightCanvasRef} className="w-full h-full block" />
            </div>
          </div>

          {/* 2D Blueprint View */}
          <div className="h-[40%] bg-neutral-200 relative overflow-hidden flex flex-col border-t-4 border-neutral-950">
             <div className="absolute top-0 left-0 right-0 bg-white/90 backdrop-blur border-b border-neutral-300 px-4 py-2 flex justify-between items-center z-10 shadow-sm">
              <span className="text-black font-semibold text-sm flex items-center">
                <Square className="w-4 h-4 mr-2 text-neutral-600"/> 2D Laser Cutting Layout
              </span>
              <span className="text-xs text-neutral-500">Preview only. Click Download SVG for true-to-scale vector file.</span>
            </div>
            <div className="flex-1 overflow-auto p-8 pt-16 flex items-start justify-center cursor-grab active:cursor-grabbing inner-shadow">
              {/* Using a wrapper to center the canvas naturally if it's smaller than the viewport, and scroll if larger */}
              <div className="bg-white shadow-2xl border border-neutral-300 transition-transform duration-300 ease-in-out transform origin-top">
                 <canvas ref={blueprintCanvasRef} className="block pointer-events-none" />
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
