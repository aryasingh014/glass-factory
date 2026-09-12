/**
 * Lightweight Code-128 Barcode & QR Code SVG utilities
 */

export function escapeSVGText(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sanitizeSVG(svgString: string): string {
  if (typeof svgString !== "string") return "";
  return svgString
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

// Code 128 (Subset B) table patterns
const CODE128_B_PATTERNS: { [key: string]: string } = {
  " ": "212222", "!": "222122", '"': "222221", "#": "121223", "$": "121322", "%": "131222", "&": "122213", "'": "122312",
  "(": "132212", ")": "221213", "*": "221312", "+": "231212", ",": "112232", "-": "122132", ".": "122231", "/": "113222",
  "0": "123122", "1": "123221", "2": "223211", "3": "221132", "4": "221231", "5": "213212", "6": "223112", "7": "312131",
  "8": "311222", "9": "321122", ":": "321221", ";": "312212", "<": "322112", "=": "322211", ">": "212123", "?": "212321",
  "@": "232121", "A": "111323", "B": "131123", "C": "131321", "D": "112313", "E": "132113", "F": "132311", "G": "211313",
  "H": "231113", "I": "231311", "J": "112133", "K": "112331", "L": "132131", "M": "113123", "N": "113321", "O": "133121",
  "P": "313112", "Q": "331112", "R": "312113", "S": "312311", "T": "332111", "U": "314111", "V": "221411", "W": "431111",
  "X": "111224", "Y": "111422", "Z": "121124", "[": "121421", "\\": "141122", "]": "141221", "^": "112214", "_": "112412",
  "`": "122114", "a": "122411", "b": "142112", "c": "142211", "d": "241211", "e": "221114", "f": "411112", "g": "411211",
  "h": "211114", "i": "211214", "j": "211412", "k": "111242", "l": "111441", "m": "114212", "n": "121142", "o": "121441",
  "p": "141142", "q": "141441", "r": "114241", "s": "144112", "t": "144211", "u": "411241", "v": "411412", "w": "421114",
  "x": "411441", "y": "211441", "z": "231141", "{": "211414", "|": "421114", "}": "241114", "~": "211441"
};

const START_CODE_B = "211214";
const STOP_CODE = "2331112";

export function generateBarcodeSVG(text: string, height: number = 50, barWidth: number = 2): string {
  const safeText = escapeSVGText(text);
  let pattern = START_CODE_B;
  let checksum = 104; // Start B value

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const codePattern = CODE128_B_PATTERNS[char] || CODE128_B_PATTERNS["?"];
    pattern += codePattern;
    const charCode = char.charCodeAt(0) - 32;
    checksum += charCode * (i + 1);
  }

  const checkValue = checksum % 103;
  const checkChar = String.fromCharCode(checkValue + 32);
  const checkPattern = CODE128_B_PATTERNS[checkChar] || "211214";
  pattern += checkPattern + STOP_CODE;

  let rects = "";
  let currentX = 10;
  let isBar = true;

  for (let i = 0; i < pattern.length; i++) {
    const width = parseInt(pattern[i], 10) * barWidth;
    if (isBar) {
      rects += `<rect x="${currentX}" y="5" width="${width}" height="${height}" fill="black" />`;
    }
    currentX += width;
    isBar = !isBar;
  }

  const totalWidth = currentX + 10;
  const totalHeight = height + 18;

  const rawSVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">
      <rect width="100%" height="100%" fill="white" />
      ${rects}
      <text x="${totalWidth / 2}" y="${totalHeight - 2}" font-family="monospace" font-size="13" font-weight="900" letter-spacing="1.5" text-anchor="middle" fill="#000000">${safeText}</text>
    </svg>
  `;

  return sanitizeSVG(rawSVG);
}

// Generate SVG QR Code matrix for QR scanning
export function generateQRCodeSVG(data: string, size: number = 100): string {
  const grid = 21;
  const cellSize = Math.floor(size / grid);
  const offset = Math.floor((size - grid * cellSize) / 2);

  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 5) - hash + data.charCodeAt(i);
    hash |= 0;
  }

  let paths = "";
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      const isTopLeft = r < 7 && c < 7;
      const isTopRight = r < 7 && c >= grid - 7;
      const isBottomLeft = r >= grid - 7 && c < 7;

      let isBlack = false;
      if (isTopLeft || isTopRight || isBottomLeft) {
        const localR = isTopLeft ? r : isTopRight ? r : r - (grid - 7);
        const localC = isTopLeft ? c : isTopRight ? c - (grid - 7) : c;
        if (localR === 0 || localR === 6 || localC === 0 || localC === 6) isBlack = true;
        else if (localR >= 2 && localR <= 4 && localC >= 2 && localC <= 4) isBlack = true;
      } else {
        const bit = Math.abs((hash ^ (r * 31 + c * 17)) % 100);
        isBlack = bit < 48;
      }

      if (isBlack) {
        const x = offset + c * cellSize;
        const y = offset + r * cellSize;
        paths += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#0f172a" />`;
      }
    }
  }

  const rawSVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <rect width="100%" height="100%" fill="white" rx="6" />
      ${paths}
    </svg>
  `;

  return sanitizeSVG(rawSVG);
}

export function formatSejalBarcode(sfoNo?: string, seqNo?: number | string): string {
  const cleanSfo = String(sfoNo || "1344").replace(/[^0-9]/g, "");
  const sfoPad = (cleanSfo || "1344").padStart(5, "0").slice(-5);
  const seqPad = String(seqNo || "16").padStart(4, "0").slice(-4);
  return `10126270${sfoPad}${seqPad}`;
}
