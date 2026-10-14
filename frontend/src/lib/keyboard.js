// Keyboard geometry — mirrors backend/pianotracker/keyboard.py so the overlay
// matches exactly what the analysis used.
//
// Keyboard space: u in [0, numWhite] (white-key widths from the low end),
// v in [0, 1] (0 = back/fallboard edge, 1 = front edge).

export const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const HAS_BLACK_AFTER = { 0: true, 2: true, 4: false, 5: true, 7: true, 9: true, 11: false };
const BLACK_OFFSET = { 0: -0.08, 2: 0.08, 5: -0.1, 7: 0, 9: 0.1 };
export const BLACK_WIDTH = 0.58;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const noteName = (m) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
export const isWhite = (m) => WHITE_PCS.includes(m % 12);
const whiteOrdinal = (m) => Math.floor(m / 12) * 7 + WHITE_PCS.indexOf(m % 12);
const ordinalToMidi = (o) => Math.floor(o / 7) * 12 + WHITE_PCS[((o % 7) + 7) % 7];
export const whiteIndexToMidi = (first, i) => ordinalToMidi(whiteOrdinal(first) + i);

export function keyCenterU(first, midi) {
  const base = whiteOrdinal(first);
  if (isWhite(midi)) return whiteOrdinal(midi) - base + 0.5;
  const below = midi - 1;
  return whiteOrdinal(below) - base + 1 + BLACK_OFFSET[below % 12];
}

// All white keys from A0 to C8, for the "lowest key" picker.
export const WHITE_KEYS = [];
for (let m = 21; m <= 108; m++) if (isWhite(m)) WHITE_KEYS.push(m);

// ---- homography (4-point) -------------------------------------------------
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function homography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

const apply = (H, x, y) => {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
};

/** Geometry helper for a calibration in a W×H drawing space. */
export class KeyboardMap {
  constructor(cal, W, H) {
    this.cal = cal;
    const n = cal.num_white;
    const src = cal.quad.map(([x, y]) => [x * W, y * H]);
    const dst = cal.mirrored
      ? [[n, 0], [0, 0], [0, 1], [n, 1]]
      : [[0, 0], [n, 0], [n, 1], [0, 1]];
    this.toImgH = homography(dst, src);
    this.toKeyH = homography(src, dst);
  }

  toImage(u, v) {
    return apply(this.toImgH, u, v);
  }

  toKey(x, y) {
    return apply(this.toKeyH, x, y);
  }

  /** Polygon (image coords) for a key. */
  keyPoly(midi) {
    const { first_white_midi: first, black_depth: bd } = this.cal;
    let u0, u1, v1;
    if (isWhite(midi)) {
      u0 = whiteOrdinal(midi) - whiteOrdinal(first);
      u1 = u0 + 1;
      v1 = 1;
    } else {
      const c = keyCenterU(first, midi);
      u0 = c - BLACK_WIDTH / 2;
      u1 = c + BLACK_WIDTH / 2;
      v1 = bd;
    }
    return [this.toImage(u0, 0), this.toImage(u1, 0), this.toImage(u1, v1), this.toImage(u0, v1)];
  }

  /** All keys in the calibrated range: [{midi, white}] */
  keys() {
    const { first_white_midi: first, num_white: n } = this.cal;
    const out = [];
    const last = whiteIndexToMidi(first, n - 1);
    for (let m = first; m <= last; m++) {
      if (!isWhite(m) && (m === first || !HAS_BLACK_AFTER[(m - 1) % 12])) continue;
      out.push({ midi: m, white: isWhite(m) });
    }
    return out;
  }
}
