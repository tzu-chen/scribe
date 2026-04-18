declare module 'djvujs-dist/library/src/DjVuDocument.js' {
  export default class DjVuDocument {
    constructor(arraybuffer: ArrayBuffer, options?: { baseUrl?: string | null; memoryLimit?: number });
    pages: DjVuPage[];
    getContents(): DjVuContentsItem[] | null;
  }

  interface DjVuPage {
    getWidth(): number;
    getHeight(): number;
    getDpi(): number;
    getImageData(rotate?: boolean): ImageData;
    init(): DjVuPage;
  }

  interface DjVuContentsItem {
    description: string;
    url: string;
    children?: DjVuContentsItem[];
  }
}
