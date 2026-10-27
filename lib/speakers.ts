/** Stored speaker ids use s1, s2, ... and are displayed as localized "Speaker N" labels. */
export const SPEAKER_CODE = /^s\d{1,2}$/;
export const speakerNumber = (code: string) => Number(code.slice(1));
