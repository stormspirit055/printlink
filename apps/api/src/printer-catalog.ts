export type PrinterCatalogItem = {
  id: string;
  brand: string;
  model: string;
  technology: 'FDM' | 'RESIN';
  maxX: number;
  maxY: number;
  maxZ: number;
  enclosed: boolean;
  colorMode: 'single' | 'multi';
  maxColors: number;
};
const p = (
  brand: string,
  model: string,
  technology: 'FDM' | 'RESIN',
  size: [number, number, number],
  enclosed = false,
  colorMode: 'single' | 'multi' = 'single',
  maxColors = 1,
): PrinterCatalogItem => ({
  id: `${brand}-${model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  brand,
  model,
  technology,
  maxX: size[0],
  maxY: size[1],
  maxZ: size[2],
  enclosed,
  colorMode,
  maxColors,
});

// Current product families listed by each manufacturer's official store/compare page.
export const printerCatalog: PrinterCatalogItem[] = [
  p('Bambu Lab', 'A1 mini', 'FDM', [180, 180, 180], false, 'multi', 4),
  p('Bambu Lab', 'A1', 'FDM', [256, 256, 256], false, 'multi', 4),
  p('Bambu Lab', 'P1S', 'FDM', [256, 256, 256], true, 'multi', 16),
  p('Bambu Lab', 'P2S', 'FDM', [256, 256, 256], true, 'multi', 20),
  p('Bambu Lab', 'X1 Carbon', 'FDM', [256, 256, 256], true, 'multi', 16),
  p('Bambu Lab', 'X1E', 'FDM', [256, 256, 256], true, 'multi', 16),
  p('Bambu Lab', 'X2D', 'FDM', [256, 256, 260], true, 'multi', 20),
  p('Bambu Lab', 'H2S', 'FDM', [340, 320, 340], true, 'multi', 24),
  p('Bambu Lab', 'H2D', 'FDM', [350, 320, 325], true, 'multi', 25),
  p('Bambu Lab', 'H2C', 'FDM', [330, 320, 325], true, 'multi', 24),

  p('Creality', 'SPARKX i7', 'FDM', [260, 260, 260], false, 'multi', 16),
  p('Creality', 'Ender-3 V3 SE', 'FDM', [220, 220, 250]),
  p('Creality', 'Ender-3 V3 KE', 'FDM', [220, 220, 240]),
  p('Creality', 'Ender-3 V3 Plus', 'FDM', [300, 300, 330]),
  p('Creality', 'Ender-5 Max', 'FDM', [400, 400, 400]),
  p('Creality', 'Hi', 'FDM', [260, 260, 300], false, 'multi', 16),
  p('Creality', 'K1', 'FDM', [220, 220, 250], true),
  p('Creality', 'K1C 2025', 'FDM', [220, 220, 250], true),
  p('Creality', 'K1 Max', 'FDM', [300, 300, 300], true),
  p('Creality', 'K2 SE', 'FDM', [220, 220, 250], false, 'multi', 16),
  p('Creality', 'K2', 'FDM', [260, 260, 260], true, 'multi', 16),
  p('Creality', 'K2 Pro', 'FDM', [300, 300, 300], true, 'multi', 16),
  p('Creality', 'K2 Plus', 'FDM', [350, 350, 350], true, 'multi', 16),
  p('Creality', 'HALOT-MAGE PRO', 'RESIN', [228, 128, 230], true),
  p('Creality', 'HALOT-MAGE S', 'RESIN', [223, 126, 230], true),

  p('ELEGOO', 'Centauri Carbon', 'FDM', [256, 256, 256], true),
  p('ELEGOO', 'Centauri Carbon 2', 'FDM', [256, 256, 256], true, 'multi', 4),
  p('ELEGOO', 'Neptune 4', 'FDM', [225, 225, 265]),
  p('ELEGOO', 'Neptune 4 Pro', 'FDM', [225, 225, 265]),
  p('ELEGOO', 'Neptune 4 Plus', 'FDM', [320, 320, 385]),
  p('ELEGOO', 'Neptune 4 Max', 'FDM', [420, 420, 480]),
  p('ELEGOO', 'OrangeStorm Giga', 'FDM', [800, 800, 1000]),
  p('ELEGOO', 'Mars 4', 'RESIN', [153, 77, 175], true),
  p('ELEGOO', 'Mars 4 Ultra', 'RESIN', [153, 77, 165], true),
  p('ELEGOO', 'Mars 5', 'RESIN', [143, 90, 150], true),
  p('ELEGOO', 'Mars 5 Ultra', 'RESIN', [153, 78, 165], true),
  p('ELEGOO', 'Saturn 4', 'RESIN', [219, 123, 220], true),
  p('ELEGOO', 'Saturn 4 Ultra', 'RESIN', [219, 123, 220], true),
  p('ELEGOO', 'Saturn 4 Ultra 16K', 'RESIN', [212, 118, 220], true),
  p('ELEGOO', 'Jupiter SE', 'RESIN', [278, 156, 300], true),
  p('ELEGOO', 'Jupiter 2', 'RESIN', [302, 162, 300], true),
];
