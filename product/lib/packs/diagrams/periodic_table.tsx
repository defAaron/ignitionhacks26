import { ACCENT, INK, MONO, strs, type ShapeTemplate } from "../shapes/types";

/* Main block: 18 fields per period row, "Symbol:categoryChar", empty field = gap. */
const MAIN = [
  "H:n,,,,,,,,,,,,,,,,,He:g",
  "Li:a,Be:e,,,,,,,,,,,B:m,C:n,N:n,O:n,F:h,Ne:g",
  "Na:a,Mg:e,,,,,,,,,,,Al:p,Si:m,P:n,S:n,Cl:h,Ar:g",
  "K:a,Ca:e,Sc:t,Ti:t,V:t,Cr:t,Mn:t,Fe:t,Co:t,Ni:t,Cu:t,Zn:t,Ga:p,Ge:m,As:m,Se:n,Br:h,Kr:g",
  "Rb:a,Sr:e,Y:t,Zr:t,Nb:t,Mo:t,Tc:t,Ru:t,Rh:t,Pd:t,Ag:t,Cd:t,In:p,Sn:p,Sb:m,Te:m,I:h,Xe:g",
  "Cs:a,Ba:e,La:l,Hf:t,Ta:t,W:t,Re:t,Os:t,Ir:t,Pt:t,Au:t,Hg:t,Tl:p,Pb:p,Bi:p,Po:p,At:h,Rn:g",
  "Fr:a,Ra:e,Ac:c,Rf:t,Db:t,Sg:t,Bh:t,Hs:t,Mt:t,Ds:t,Rg:t,Cn:t,Nh:p,Fl:p,Mc:p,Lv:p,Ts:h,Og:g",
];
/* Separated f-block lanes (Ce–Lu, Th–Lr), indented under group 4. */
const FBLOCK = [
  "Ce:l,Pr:l,Nd:l,Pm:l,Sm:l,Eu:l,Gd:l,Tb:l,Dy:l,Ho:l,Er:l,Tm:l,Yb:l,Lu:l",
  "Th:c,Pa:c,U:c,Np:c,Pu:c,Am:c,Cm:c,Bk:c,Cf:c,Es:c,Fm:c,Md:c,No:c,Lr:c",
];
/* Muted category palette — desaturated pastels that sit on the light token surfaces. */
const CAT: Record<string, string> = {
  a: "#f2cfc7", // alkali
  e: "#f7e2bd", // alkaline
  t: "#d7def5", // transition (accent-tinted)
  p: "#cfe6d7", // post-transition
  m: "#e3daf1", // metalloid
  n: "#cde9e6", // nonmetal
  h: "#f4eec2", // halogen
  g: "#efd6e4", // noble
  l: "#e2e8cd", // lanthanide
  c: "#ead9c9", // actinide
};

interface Cell {
  sym: string;
  cat: string;
  row: number;
  col: number;
}
const parse = (rows: string[], rowOff: number, colOff: number): Cell[] =>
  rows.flatMap((r, ri) =>
    r
      .split(",")
      .map((tok, ci) =>
        tok ? { sym: tok.split(":")[0], cat: tok.split(":")[1], row: rowOff + ri, col: colOff + ci } : null
      )
      .filter((c): c is Cell => c !== null)
  );
const CELLS: Cell[] = [...parse(MAIN, 0, 0), ...parse(FBLOCK, 7.45, 2)];

/**
 * periodic_table — the lookup asset: real 18×7 main block + separated f-block lanes, category-tinted cells.
 * params: highlight (string[] of symbols → accent ring). Symbols hide when a cell is under 9px wide.
 */
export const periodic_table: ShapeTemplate = ({ bbox, params }) => {
  const { x, y, width: w, height: h } = bbox;
  const highlight = new Set(strs(params, "highlight", []));
  const cell = Math.min(w / 18, h / 9.45);
  const ox = x + (w - cell * 18) / 2;
  const oy = y + (h - cell * 9.45) / 2;
  const showText = cell >= 9;
  const fs = cell * 0.42;
  const rx = Math.min(2.5, cell * 0.14);
  return (
    <g>
      {CELLS.map((c) => {
        const cx = ox + c.col * cell;
        const cy = oy + c.row * cell;
        return (
          <g key={c.sym}>
            <rect x={cx + 0.5} y={cy + 0.5} width={cell - 1} height={cell - 1} rx={rx} fill={CAT[c.cat]} />
            {highlight.has(c.sym) && (
              <rect
                x={cx + 0.9}
                y={cy + 0.9}
                width={cell - 1.8}
                height={cell - 1.8}
                rx={rx}
                fill="none"
                stroke={ACCENT}
                strokeWidth={Math.max(1.2, cell * 0.09)}
              />
            )}
            {showText && (
              <text x={cx + cell / 2} y={cy + cell / 2 + fs * 0.36} textAnchor="middle" fontFamily={MONO} fontSize={fs} fill={INK} fillOpacity={0.82}>
                {c.sym}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
};
