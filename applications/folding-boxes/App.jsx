import { useMemo, useState } from 'react';
import { AlertTriangle, Box, ChevronDown, ChevronRight, Download, Ruler } from 'lucide-react';

import { VARIANTS, buildBox, fromMM, toMM, toSVG } from './geometry.js';

const DEFAULTS_MM = {
  length: 200,
  width: 140,
  height: 60,
  thickness: 3,
  lockWidth: 40,
  slotClearance: 0.4,
  lidDepth: 30,
  lidClearance: 0.4,
};

const ROLL_END = [
  'Score every dashed line. Fold the end flaps on the front and back walls inwards.',
  'Fold each side wall up, roll it over those end flaps, and bring the return panel back down inside.',
  'Push the two tabs on each return through the slots in the base. The ends finish three boards thick and hold themselves together.',
];

const ASSEMBLY = {
  tray: ROLL_END,
  mailer: [
    ...ROLL_END,
    'Fold the lid over, drop its wings down inside the side walls, then fold the ears in and tuck the front flap down inside the front wall.',
  ],
  sliplid: [...ROLL_END, 'Build the lid the same way. It is cut to the base outside plus the slip clearance, so it slides over the finished base.'],
};

const round = (n, unit) => Number(n.toFixed(unit === 'mm' ? 2 : 3));

function NumberField({ label, value, onChange, unit, step, min = 0, compact = false }) {
  return (
    <label className="block">
      {/* Side by side, a pushed-right unit sits nearer the next field's label
          than its own, so narrow fields keep theirs alongside the label. */}
      <span
        className={`flex items-baseline text-sm font-medium text-neutral-300 ${
          compact ? 'gap-1.5' : 'justify-between'
        }`}
      >
        {label}
        {unit && <span className="text-xs text-neutral-500">{unit}</span>}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none"
      />
    </label>
  );
}

function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={`flex rounded-md border border-neutral-800 bg-neutral-950 p-1 ${className}`}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`flex-1 rounded-sm py-1.5 text-sm transition-colors ${
            value === option.id ? 'bg-neutral-800 text-white shadow' : 'text-neutral-500 hover:text-white'
          }`}
        >
          {option.name}
        </button>
      ))}
    </div>
  );
}

function Blueprint({ box }) {
  const { sheet, pieces } = box;
  const stroke = Math.max(sheet.width, sheet.height) / 500;

  return (
    <svg
      viewBox={`0 0 ${sheet.width} ${sheet.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
    >
      <rect width={sheet.width} height={sheet.height} fill="#ffffff" />
      {pieces.map((piece) => (
        <g key={piece.name} transform={`translate(${piece.x} ${piece.y})`}>
          {piece.cuts.map((path, i) => (
            <path key={`cut-${i}`} d={path.d} fill="none" stroke="#111827" strokeWidth={stroke} />
          ))}
          {piece.folds.map((path, i) => (
            <path
              key={`fold-${i}`}
              d={path.d}
              fill="none"
              stroke="#2563eb"
              strokeWidth={stroke}
              strokeDasharray={`${stroke * 6} ${stroke * 4}`}
            />
          ))}
          {piece.labels.map((label) => (
            <text
              key={label.text}
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="sans-serif"
              fontSize={Math.max(sheet.width, sheet.height) / 40}
              fill="#9ca3af"
            >
              {label.text}
            </text>
          ))}
        </g>
      ))}
    </svg>
  );
}

export default function App() {
  const [variant, setVariant] = useState('mailer');
  const [unit, setUnit] = useState('mm');
  const [dimensionMode, setDimensionMode] = useState('inner');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [labelPieces, setLabelPieces] = useState(false);
  const [values, setValues] = useState(DEFAULTS_MM);

  const step = unit === 'mm' ? 0.5 : 0.01;
  const set = (key) => (value) => setValues((prev) => ({ ...prev, [key]: value }));

  const switchUnit = (next) => {
    if (next === unit) return;
    setValues((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([key, value]) => [key, round(fromMM(toMM(value, unit), next), next)]),
      ),
    );
    setUnit(next);
  };

  const box = useMemo(() => {
    const mm = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, toMM(value, unit)]));
    return buildBox({ ...mm, variant, dimensionMode });
  }, [values, unit, variant, dimensionMode]);

  const show = (mmValue) => round(fromMM(mmValue, unit), unit);
  const ok = box.errors.length === 0;

  const download = () => {
    const svg = toSVG(box, { showLabels: labelPieces });
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `folding-box-${variant}-${values.length}x${values.width}x${values.height}${unit}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-screen flex-col bg-neutral-900 font-sans text-neutral-100 lg:h-screen">
      <header className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-6 py-4">
        <div className="flex items-center space-x-3">
          <Box className="h-6 w-6 text-amber-500" />
          <h1 className="text-xl font-bold tracking-wide">Folding Boxes</h1>
        </div>
        <Segmented
          options={[
            { id: 'mm', name: 'mm' },
            { id: 'in', name: 'inches' },
          ]}
          value={unit}
          onChange={switchUnit}
          className="w-40"
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-2 flex w-full flex-col border-t border-neutral-800 bg-neutral-900 lg:order-1 lg:w-96 lg:border-t-0 lg:border-r">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Style</h2>
              <div className="space-y-2">
                {VARIANTS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setVariant(option.id)}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      variant === option.id
                        ? 'border-amber-500/60 bg-neutral-950'
                        : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                    }`}
                  >
                    <div className="text-sm font-semibold">{option.name}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">{option.blurb}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-2 flex items-center text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <Ruler className="mr-2 h-3.5 w-3.5" /> Dimensions
              </h2>
              <Segmented
                options={[
                  { id: 'inner', name: 'Inside' },
                  { id: 'outer', name: 'Outside' },
                ]}
                value={dimensionMode}
                onChange={setDimensionMode}
              />
              <p className="mt-2 text-xs text-neutral-500">
                {dimensionMode === 'inner'
                  ? 'Sized around what goes in the box.'
                  : 'Sized to fit the finished box into a space.'}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <NumberField label="Length" value={values.length} onChange={set('length')} unit={unit} step={step} compact />
                <NumberField label="Width" value={values.width} onChange={set('width')} unit={unit} step={step} compact />
                <NumberField label="Height" value={values.height} onChange={set('height')} unit={unit} step={step} compact />
              </div>
              <div className="mt-3">
                <NumberField
                  label="Material thickness"
                  value={values.thickness}
                  onChange={set('thickness')}
                  unit={unit}
                  step={step}
                />
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((prev) => !prev)}
                className="flex w-full items-center text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-300"
              >
                {showAdvanced ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
                Fit and tolerances
              </button>
              {showAdvanced && (
                <div className="mt-3 space-y-3">
                  <NumberField label="Lock tab width" value={values.lockWidth} onChange={set('lockWidth')} unit={unit} step={step} />
                  <NumberField
                    label="Slot clearance"
                    value={values.slotClearance}
                    onChange={set('slotClearance')}
                    unit={unit}
                    step={step}
                  />
                  {variant === 'sliplid' && (
                    <>
                      <NumberField label="Lid depth" value={values.lidDepth} onChange={set('lidDepth')} unit={unit} step={step} />
                      <NumberField
                        label="Slip clearance"
                        value={values.lidClearance}
                        onChange={set('lidClearance')}
                        unit={unit}
                        step={step}
                      />
                    </>
                  )}
                  <label className="flex items-center space-x-2 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={labelPieces}
                      onChange={(e) => setLabelPieces(e.target.checked)}
                      className="h-4 w-4 accent-amber-500"
                    />
                    <span>Engrave piece names in the exported SVG</span>
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-neutral-800 bg-neutral-900 p-6">
            <button
              type="button"
              onClick={download}
              disabled={!ok}
              className="flex w-full items-center justify-center rounded-md bg-amber-600 py-3 font-semibold text-white transition-colors hover:bg-amber-500 disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              <Download className="mr-2 h-5 w-5" /> Download SVG
            </button>
          </div>
        </aside>

        <main className="order-1 flex min-h-0 min-w-0 flex-1 flex-col lg:order-2">
          {(box.errors.length > 0 || box.warnings.length > 0) && (
            <div className="space-y-2 border-b border-neutral-800 bg-neutral-950 px-6 py-3">
              {[...box.errors, ...box.warnings].map((message) => (
                <div
                  key={message}
                  className={`flex items-start text-sm ${box.errors.includes(message) ? 'text-red-400' : 'text-amber-400'}`}
                >
                  <AlertTriangle className="mr-2 mt-0.5 h-4 w-4 shrink-0" />
                  <span>{message}</span>
                </div>
              ))}
            </div>
          )}

          {ok && (
            <>
              <div className="h-[55vh] min-h-0 bg-neutral-800 p-4 lg:h-auto lg:flex-1 lg:p-6">
                <Blueprint box={box} />
              </div>

              <div className="grid grid-cols-2 gap-px border-t border-neutral-800 bg-neutral-800 text-sm md:grid-cols-4">
                {[
                  ['Inside', `${show(box.dims.inner.L)} × ${show(box.dims.inner.W)} × ${show(box.dims.inner.H)}`],
                  ['Outside', `${show(box.dims.outer.L)} × ${show(box.dims.outer.W)} × ${show(box.dims.outer.H)}`],
                  ['Sheet', `${show(box.sheet.width)} × ${show(box.sheet.height)}`],
                  ['Pieces', box.pieces.map((p) => p.name).join(' + ')],
                ].map(([label, value]) => (
                  <div key={label} className="bg-neutral-950 px-6 py-3">
                    <div className="text-xs uppercase tracking-wider text-neutral-500">{label}</div>
                    <div className="mt-0.5 font-mono text-neutral-200">{value}</div>
                  </div>
                ))}
              </div>

              <div className="border-t border-neutral-800 bg-neutral-950 px-6 py-4">
                <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-neutral-500">
                  <span className="flex items-center">
                    <span className="mr-2 inline-block h-0 w-6 border-t-2 border-neutral-200" /> Cut
                  </span>
                  <span className="flex items-center">
                    <span className="mr-2 inline-block h-0 w-6 border-t-2 border-dashed border-blue-500" /> Score and fold
                  </span>
                </div>
                <ol className="list-inside list-decimal space-y-1 text-sm text-neutral-400">
                  {ASSEMBLY[variant].map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
