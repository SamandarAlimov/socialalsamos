import { useMemo } from 'react';

const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112',
] as const;

function encodeCode128B(value: string) {
  const clean = value.trim().toUpperCase();
  if (!clean || [...clean].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126)) {
    return null;
  }

  const values = [...clean].map(char => char.charCodeAt(0) - 32);
  const checksum = (104 + values.reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103;
  return [104, ...values, checksum, 106].map(code => CODE128_PATTERNS[code]).join('');
}

export function Code128Barcode({ value, className = '' }: { value: string; className?: string }) {
  const barcode = useMemo(() => encodeCode128B(value), [value]);

  if (!barcode) return null;

  const quietZone = 10;
  const moduleWidth = 2;
  const barHeight = 72;
  const totalModules = [...barcode].reduce((sum, width) => sum + Number(width), 0);
  const width = (totalModules + quietZone * 2) * moduleWidth;

  let x = quietZone * moduleWidth;
  let isBar = true;
  const bars: Array<{ x: number; width: number }> = [];

  for (const digit of barcode) {
    const runWidth = Number(digit) * moduleWidth;
    if (isBar) bars.push({ x, width: runWidth });
    x += runWidth;
    isBar = !isBar;
  }

  return (
    <div className={className} role="img" aria-label={`Barcode ${value}`}>
      <svg
        viewBox={`0 0 ${width} ${barHeight}`}
        className="h-[72px] w-full max-w-sm"
        preserveAspectRatio="xMidYMid meet"
        shapeRendering="crispEdges"
      >
        <rect width={width} height={barHeight} fill="white" />
        {bars.map((bar, index) => (
          <rect key={index} x={bar.x} y={0} width={bar.width} height={barHeight} fill="black" />
        ))}
      </svg>
    </div>
  );
}
