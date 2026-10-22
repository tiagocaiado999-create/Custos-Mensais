// Globais que vêm de fora dos nossos ficheiros: bibliotecas carregadas sob demanda e APIs do navegador
// que ainda não estão nos tipos do TypeScript. Só serve para o `npm run typecheck`.
interface Window {
  jsQR: (dados: Uint8ClampedArray, largura: number, altura: number, opcoes?: { inversionAttempts?: string }) => { data: string } | null;
  XLSX: any;
}
declare class BarcodeDetector {
  constructor(opcoes?: { formats: string[] });
  detect(fonte: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface MediaTrackCapabilities { focusMode?: string[]; }
interface MediaTrackConstraintSet { focusMode?: string; }
