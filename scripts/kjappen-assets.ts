/**
 * Cut the Kjappen show art into the pieces the page loads.
 *
 * The three illustrations in `assets/kjappen/` are the design brief for the game: the
 * logo, the full stage, and a sheet of six contestant portraits. None of them can be
 * used whole. The portraits arrive as one 3x2 sheet with a name plate under each face,
 * and the plates have to go - the podium under the avatar carries the name of whoever
 * is actually playing, not the name printed on the reference art.
 *
 *   node --import tsx scripts/kjappen-assets.ts
 *
 * Output goes to `public/kjappen/`. Both the sources and the output are committed, so
 * this only needs running when the art changes; it exists so the crops are a recipe
 * rather than something nobody can reproduce.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = path.join(process.cwd(), "assets", "kjappen");
const OUT = path.join(process.cwd(), "public", "kjappen");

/** The portrait sheet: three across, two down, on a 1536x1024 canvas. */
const SHEET = { tile: 512, cols: 3, rows: 2 };
/**
 * How much of each tile to keep. The inset of 8px drops the white gutter between
 * tiles; the height of 382 stops just above the name plate, keeping the face, the
 * raised hands and the top of the red buzzer.
 */
const TILE_CROP = { inset: 8, height: 382 };

/** Where the crowd sits in the stage picture: the left half of the front row. */
const CROWD = { left: 0, top: 775, width: 620, height: 166 };

/** The logo badge, trimmed of the empty canvas around it. */
const LOGO = { left: 20, top: 100, width: 1214, height: 960 };

async function main() {
  mkdirSync(OUT, { recursive: true });

  const sheet = sharp(path.join(SRC, "avatars.webp"));
  const { tile, cols, rows } = SHEET;
  let n = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      n += 1;
      await sheet
        .clone()
        .extract({
          left: col * tile + TILE_CROP.inset,
          top: row * tile + TILE_CROP.inset,
          width: tile - TILE_CROP.inset * 2,
          height: TILE_CROP.height,
        })
        .webp({ quality: 82 })
        .toFile(path.join(OUT, `avatar-${n}.webp`));
    }
  }

  await sharp(path.join(SRC, "logo.webp")).extract(LOGO).resize({ width: 760 }).webp({ quality: 88 }).toFile(path.join(OUT, "logo.webp"));
  await sharp(path.join(SRC, "stage.webp")).extract(CROWD).webp({ quality: 80 }).toFile(path.join(OUT, "crowd.webp"));

  console.log(`Skrev ${n} avatarer, logo og publikum til public/kjappen/.`);
}

void main();
