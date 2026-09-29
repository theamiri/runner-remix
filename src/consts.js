// World is drawn at a tiny fixed resolution and scaled up with nearest-neighbour,
// so every sprite stays crisp pixel art at any window size.
export const W = 320;          // world width in art pixels
export const H = 100;          // world height in art pixels
export const GROUND = 86;      // y of the ground surface (feet stand on GROUND - 1)
export const PLAYER_X = 26;    // left edge of the runner
export const TILE = 640;       // width of pre-rendered parallax tiles

// Bottom edge (exclusive) of flying obstacles in each lane.
export const LANES = {
  low: GROUND - 2,    // skims the ground: jump it
  mid: GROUND - 13,   // head height: duck (or jump high)
  high: GROUND - 24,  // overhead: only dangerous if you jump into it
};

export const STEP_MS = 1000 / 60;
