/**
 * Unit conversion across length, mass, temperature, area, volume, speed,
 * time, data, energy, pressure, power, angle, fuel economy, plus CSS units
 * and cooking measures.
 */

export interface Unit {
  id: string;
  label: string;
  symbol: string;
  /** Multiply by this to get the base unit (unless custom to/from provided). */
  factor: number;
  toBase?: (v: number) => number;
  fromBase?: (v: number) => number;
  aliases?: string[];
}

export interface UnitCategory {
  id: string;
  label: string;
  base: string;
  units: Unit[];
}

const u = (id: string, label: string, symbol: string, factor: number, aliases: string[] = []): Unit => ({ id, label, symbol, factor, aliases });

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: 'length',
    label: 'Length',
    base: 'm',
    units: [
      u('mm', 'Millimetre', 'mm', 0.001), u('cm', 'Centimetre', 'cm', 0.01), u('m', 'Metre', 'm', 1), u('km', 'Kilometre', 'km', 1000),
      u('in', 'Inch', 'in', 0.0254, ['inch', 'inches', '"']), u('ft', 'Foot', 'ft', 0.3048, ['feet', 'foot', "'"]), u('yd', 'Yard', 'yd', 0.9144),
      u('mi', 'Mile', 'mi', 1609.344, ['mile', 'miles']), u('nmi', 'Nautical mile', 'nmi', 1852), u('um', 'Micrometre', 'µm', 1e-6, ['micron']),
      u('nm', 'Nanometre', 'nm', 1e-9), u('ly', 'Light year', 'ly', 9.4607e15), u('au', 'Astronomical unit', 'AU', 1.495978707e11),
    ],
  },
  {
    id: 'mass',
    label: 'Mass',
    base: 'kg',
    units: [
      u('mg', 'Milligram', 'mg', 1e-6), u('g', 'Gram', 'g', 0.001), u('kg', 'Kilogram', 'kg', 1), u('t', 'Tonne', 't', 1000),
      u('oz', 'Ounce', 'oz', 0.028349523125), u('lb', 'Pound', 'lb', 0.45359237, ['lbs']), u('st', 'Stone', 'st', 6.35029318),
      u('ton_us', 'US ton', 'ton', 907.18474), u('ton_uk', 'Imperial ton', 'long ton', 1016.0469088), u('ct', 'Carat', 'ct', 0.0002),
    ],
  },
  {
    id: 'temperature',
    label: 'Temperature',
    base: 'c',
    units: [
      { id: 'c', label: 'Celsius', symbol: '°C', factor: 1 },
      { id: 'f', label: 'Fahrenheit', symbol: '°F', factor: 1, toBase: (v) => ((v - 32) * 5) / 9, fromBase: (v) => (v * 9) / 5 + 32 },
      { id: 'k', label: 'Kelvin', symbol: 'K', factor: 1, toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
      { id: 'r', label: 'Rankine', symbol: '°R', factor: 1, toBase: (v) => ((v - 491.67) * 5) / 9, fromBase: (v) => (v * 9) / 5 + 491.67 },
    ],
  },
  {
    id: 'area',
    label: 'Area',
    base: 'm2',
    units: [
      u('mm2', 'Square millimetre', 'mm²', 1e-6), u('cm2', 'Square centimetre', 'cm²', 1e-4), u('m2', 'Square metre', 'm²', 1), u('ha', 'Hectare', 'ha', 10000),
      u('km2', 'Square kilometre', 'km²', 1e6), u('in2', 'Square inch', 'in²', 0.00064516), u('ft2', 'Square foot', 'ft²', 0.09290304), u('yd2', 'Square yard', 'yd²', 0.83612736),
      u('ac', 'Acre', 'ac', 4046.8564224), u('mi2', 'Square mile', 'mi²', 2589988.110336),
    ],
  },
  {
    id: 'volume',
    label: 'Volume',
    base: 'l',
    units: [
      u('ml', 'Millilitre', 'ml', 0.001), u('l', 'Litre', 'L', 1), u('m3', 'Cubic metre', 'm³', 1000), u('cm3', 'Cubic centimetre', 'cm³', 0.001, ['cc']),
      u('tsp', 'Teaspoon (US)', 'tsp', 0.00492892159375), u('tbsp', 'Tablespoon (US)', 'tbsp', 0.01478676478125), u('floz', 'Fluid ounce (US)', 'fl oz', 0.0295735295625),
      u('cup', 'Cup (US)', 'cup', 0.2365882365), u('pt', 'Pint (US)', 'pt', 0.473176473), u('qt', 'Quart (US)', 'qt', 0.946352946), u('gal', 'Gallon (US)', 'gal', 3.785411784),
      u('gal_uk', 'Gallon (UK)', 'imp gal', 4.54609), u('pt_uk', 'Pint (UK)', 'imp pt', 0.56826125), u('ft3', 'Cubic foot', 'ft³', 28.316846592), u('in3', 'Cubic inch', 'in³', 0.016387064),
      u('bbl', 'Oil barrel', 'bbl', 158.987294928),
    ],
  },
  {
    id: 'speed',
    label: 'Speed',
    base: 'mps',
    units: [
      u('mps', 'Metres per second', 'm/s', 1), u('kph', 'Kilometres per hour', 'km/h', 1 / 3.6), u('mph', 'Miles per hour', 'mph', 0.44704),
      u('kn', 'Knot', 'kn', 0.514444444), u('fps', 'Feet per second', 'ft/s', 0.3048), u('mach', 'Mach (sea level)', 'Ma', 340.29), u('c', 'Speed of light', 'c', 299792458),
    ],
  },
  {
    id: 'time',
    label: 'Time',
    base: 's',
    units: [
      u('ns', 'Nanosecond', 'ns', 1e-9), u('us', 'Microsecond', 'µs', 1e-6), u('ms', 'Millisecond', 'ms', 0.001), u('s', 'Second', 's', 1), u('min', 'Minute', 'min', 60),
      u('h', 'Hour', 'h', 3600), u('d', 'Day', 'd', 86400), u('wk', 'Week', 'wk', 604800), u('mo', 'Month (30.44 d)', 'mo', 2629746), u('yr', 'Year', 'yr', 31556952),
      u('decade', 'Decade', 'dec', 315569520), u('century', 'Century', 'c', 3155695200),
    ],
  },
  {
    id: 'data',
    label: 'Digital storage',
    base: 'B',
    units: [
      u('bit', 'Bit', 'b', 0.125), u('B', 'Byte', 'B', 1), u('KB', 'Kilobyte', 'KB', 1e3), u('MB', 'Megabyte', 'MB', 1e6), u('GB', 'Gigabyte', 'GB', 1e9), u('TB', 'Terabyte', 'TB', 1e12), u('PB', 'Petabyte', 'PB', 1e15),
      u('KiB', 'Kibibyte', 'KiB', 1024), u('MiB', 'Mebibyte', 'MiB', 1024 ** 2), u('GiB', 'Gibibyte', 'GiB', 1024 ** 3), u('TiB', 'Tebibyte', 'TiB', 1024 ** 4), u('PiB', 'Pebibyte', 'PiB', 1024 ** 5),
      u('Kbit', 'Kilobit', 'kb', 125), u('Mbit', 'Megabit', 'Mb', 125e3), u('Gbit', 'Gigabit', 'Gb', 125e6),
    ],
  },
  {
    id: 'energy',
    label: 'Energy',
    base: 'J',
    units: [
      u('J', 'Joule', 'J', 1), u('kJ', 'Kilojoule', 'kJ', 1000), u('cal', 'Calorie', 'cal', 4.184), u('kcal', 'Kilocalorie', 'kcal', 4184), u('Wh', 'Watt-hour', 'Wh', 3600),
      u('kWh', 'Kilowatt-hour', 'kWh', 3.6e6), u('eV', 'Electronvolt', 'eV', 1.602176634e-19), u('BTU', 'British thermal unit', 'BTU', 1055.05585262), u('ftlb', 'Foot-pound', 'ft⋅lb', 1.3558179483),
    ],
  },
  {
    id: 'power',
    label: 'Power',
    base: 'W',
    units: [u('W', 'Watt', 'W', 1), u('kW', 'Kilowatt', 'kW', 1000), u('MW', 'Megawatt', 'MW', 1e6), u('hp', 'Horsepower (mechanical)', 'hp', 745.69987158), u('hp_metric', 'Horsepower (metric)', 'PS', 735.49875), u('BTUh', 'BTU per hour', 'BTU/h', 0.29307107)],
  },
  {
    id: 'pressure',
    label: 'Pressure',
    base: 'Pa',
    units: [
      u('Pa', 'Pascal', 'Pa', 1), u('kPa', 'Kilopascal', 'kPa', 1000), u('MPa', 'Megapascal', 'MPa', 1e6), u('bar', 'Bar', 'bar', 1e5), u('mbar', 'Millibar', 'mbar', 100),
      u('atm', 'Atmosphere', 'atm', 101325), u('psi', 'Pound per square inch', 'psi', 6894.757293168), u('mmHg', 'Millimetre of mercury', 'mmHg', 133.322387415), u('inHg', 'Inch of mercury', 'inHg', 3386.389),
    ],
  },
  {
    id: 'angle',
    label: 'Angle',
    base: 'deg',
    units: [u('deg', 'Degree', '°', 1), u('rad', 'Radian', 'rad', 180 / Math.PI), u('grad', 'Gradian', 'gon', 0.9), u('turn', 'Turn', 'tr', 360), u('arcmin', 'Arcminute', '′', 1 / 60), u('arcsec', 'Arcsecond', '″', 1 / 3600)],
  },
  {
    id: 'fuel',
    label: 'Fuel economy',
    base: 'kml',
    units: [
      { id: 'kml', label: 'Kilometres per litre', symbol: 'km/L', factor: 1 },
      { id: 'mpg_us', label: 'Miles per gallon (US)', symbol: 'mpg', factor: 1, toBase: (v) => v * 0.425143707, fromBase: (v) => v / 0.425143707 },
      { id: 'mpg_uk', label: 'Miles per gallon (UK)', symbol: 'mpg (imp)', factor: 1, toBase: (v) => v * 0.354006044, fromBase: (v) => v / 0.354006044 },
      { id: 'l100km', label: 'Litres per 100 km', symbol: 'L/100km', factor: 1, toBase: (v) => (v === 0 ? Infinity : 100 / v), fromBase: (v) => (v === 0 ? Infinity : 100 / v) },
    ],
  },
  {
    id: 'frequency',
    label: 'Frequency',
    base: 'Hz',
    units: [u('Hz', 'Hertz', 'Hz', 1), u('kHz', 'Kilohertz', 'kHz', 1e3), u('MHz', 'Megahertz', 'MHz', 1e6), u('GHz', 'Gigahertz', 'GHz', 1e9), u('rpm', 'Revolutions per minute', 'rpm', 1 / 60), u('bpm', 'Beats per minute', 'bpm', 1 / 60)],
  },
  {
    id: 'typography',
    label: 'Typography & CSS',
    base: 'px',
    units: [u('px', 'Pixel', 'px', 1), u('pt', 'Point', 'pt', 4 / 3), u('pc', 'Pica', 'pc', 16), u('rem', 'Rem (16px root)', 'rem', 16), u('em', 'Em (16px)', 'em', 16), u('in_css', 'Inch (96 dpi)', 'in', 96), u('cm_css', 'Centimetre (CSS)', 'cm', 96 / 2.54), u('mm_css', 'Millimetre (CSS)', 'mm', 96 / 25.4)],
  },
];

export function findUnit(categoryId: string, unitId: string): Unit | undefined {
  return UNIT_CATEGORIES.find((c) => c.id === categoryId)?.units.find((x) => x.id === unitId);
}

export function convertUnit(value: number, from: Unit, to: Unit): number {
  const base = from.toBase ? from.toBase(value) : value * from.factor;
  return to.fromBase ? to.fromBase(base) : base / to.factor;
}

export function formatQuantity(n: number, maxSignificant = 8): string {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : n < 0 ? '-∞' : 'NaN';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e15 || abs < 1e-6) return n.toExponential(Math.min(6, maxSignificant - 1)).replace(/\.?0+e/, 'e');
  const digits = Math.max(0, maxSignificant - Math.floor(Math.log10(abs)) - 1);
  return Number(n.toFixed(Math.min(12, digits))).toLocaleString('en-US', { maximumFractionDigits: 12 });
}

/** Parse "12.5 kg", "3ft", "10 miles" into a value + unit within any category. */
export function parseQuantity(input: string): { value: number; unit: Unit; category: UnitCategory } | null {
  const m = /^\s*(-?[\d,]*\.?\d+(?:e-?\d+)?)\s*([^\d\s].*?)\s*$/i.exec(input);
  if (!m) return null;
  const value = parseFloat(m[1]!.replace(/,/g, ''));
  const token = m[2]!.toLowerCase().replace(/\.$/, '');
  for (const category of UNIT_CATEGORIES) {
    for (const unit of category.units) {
      const names = [unit.id, unit.symbol, unit.label, ...(unit.aliases ?? [])].map((s) => s.toLowerCase());
      if (names.includes(token) || names.includes(token.replace(/s$/, ''))) return { value, unit, category };
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Cooking                                                                    */
/* -------------------------------------------------------------------------- */

export const INGREDIENT_DENSITIES: Array<{ id: string; label: string; gramsPerCup: number }> = [
  { id: 'water', label: 'Water / milk', gramsPerCup: 237 },
  { id: 'flour', label: 'All-purpose flour', gramsPerCup: 125 },
  { id: 'bread-flour', label: 'Bread flour', gramsPerCup: 127 },
  { id: 'sugar', label: 'Granulated sugar', gramsPerCup: 200 },
  { id: 'brown-sugar', label: 'Brown sugar (packed)', gramsPerCup: 220 },
  { id: 'powdered-sugar', label: 'Powdered sugar', gramsPerCup: 120 },
  { id: 'butter', label: 'Butter', gramsPerCup: 227 },
  { id: 'oil', label: 'Vegetable oil', gramsPerCup: 218 },
  { id: 'honey', label: 'Honey / syrup', gramsPerCup: 340 },
  { id: 'rice', label: 'Rice (uncooked)', gramsPerCup: 185 },
  { id: 'oats', label: 'Rolled oats', gramsPerCup: 90 },
  { id: 'cocoa', label: 'Cocoa powder', gramsPerCup: 85 },
  { id: 'salt', label: 'Table salt', gramsPerCup: 292 },
  { id: 'cornstarch', label: 'Cornstarch', gramsPerCup: 128 },
  { id: 'nuts', label: 'Chopped nuts', gramsPerCup: 120 },
  { id: 'cheese', label: 'Grated cheese', gramsPerCup: 100 },
  { id: 'yogurt', label: 'Yogurt', gramsPerCup: 245 },
  { id: 'cream', label: 'Heavy cream', gramsPerCup: 238 },
];

export const COOKING_VOLUMES: Array<{ id: string; label: string; cups: number }> = [
  { id: 'tsp', label: 'teaspoon', cups: 1 / 48 },
  { id: 'tbsp', label: 'tablespoon', cups: 1 / 16 },
  { id: 'floz', label: 'fluid ounce', cups: 1 / 8 },
  { id: 'cup', label: 'cup', cups: 1 },
  { id: 'pint', label: 'pint', cups: 2 },
  { id: 'quart', label: 'quart', cups: 4 },
  { id: 'ml', label: 'millilitre', cups: 1 / 236.588 },
  { id: 'l', label: 'litre', cups: 1000 / 236.588 },
];

export function cookingToGrams(amount: number, volumeId: string, ingredientId: string): number | null {
  const vol = COOKING_VOLUMES.find((v) => v.id === volumeId);
  const ing = INGREDIENT_DENSITIES.find((i) => i.id === ingredientId);
  if (!vol || !ing) return null;
  return amount * vol.cups * ing.gramsPerCup;
}

export function gramsToCooking(grams: number, ingredientId: string): Array<{ volume: string; amount: number }> {
  const ing = INGREDIENT_DENSITIES.find((i) => i.id === ingredientId);
  if (!ing) return [];
  const cups = grams / ing.gramsPerCup;
  return COOKING_VOLUMES.map((v) => ({ volume: v.label, amount: cups / v.cups }));
}

/* -------------------------------------------------------------------------- */
/* Shoe / clothing sizes, oven temperatures                                   */
/* -------------------------------------------------------------------------- */

export const OVEN_TEMPERATURES: Array<{ c: number; f: number; gas: string; description: string }> = [
  { c: 110, f: 225, gas: '¼', description: 'Very slow' },
  { c: 130, f: 250, gas: '½', description: 'Very slow' },
  { c: 140, f: 275, gas: '1', description: 'Slow' },
  { c: 150, f: 300, gas: '2', description: 'Slow' },
  { c: 160, f: 325, gas: '3', description: 'Moderately slow' },
  { c: 180, f: 350, gas: '4', description: 'Moderate' },
  { c: 190, f: 375, gas: '5', description: 'Moderately hot' },
  { c: 200, f: 400, gas: '6', description: 'Hot' },
  { c: 220, f: 425, gas: '7', description: 'Hot' },
  { c: 230, f: 450, gas: '8', description: 'Very hot' },
  { c: 240, f: 475, gas: '9', description: 'Very hot' },
];
