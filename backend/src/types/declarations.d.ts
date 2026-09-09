declare module 'arabic-reshaper' {
  const reshaper: {
    convertArabic: (text: string) => string;
    convertArabicToLegibleForm: (text: string) => string;
  };
  export default reshaper;
}

declare module 'bidi-js' {
  interface EmbeddingLevels {
    levels: Uint8Array;
    paragraphs: { start: number; end: number; level: number }[];
  }
  interface Bidi {
    getEmbeddingLevels: (text: string, explicitDirection?: 'ltr' | 'rtl') => EmbeddingLevels;
    getReorderedString: (text: string, embedLevelsResult: EmbeddingLevels) => string;
  }
  function bidiFactory(): Bidi;
  export default bidiFactory;
}
