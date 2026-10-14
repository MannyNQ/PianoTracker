// Score file types the backend accepts. PDF/images go through sheet-music
// recognition (OMR); MIDI/MusicXML are read exactly.
export const SCORE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.mid,.midi,.musicxml,.xml,.mxl';
export const isSheetImage = (name = '') => /\.(pdf|png|jpe?g)$/i.test(name);
