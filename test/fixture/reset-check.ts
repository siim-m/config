// ts-reset: JSON.parse returns unknown, so this fails to type-check.
export const parsed: string = JSON.parse('"text"');
