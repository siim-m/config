// SAFETY: the fixture checks only the disable below.
// oxlint-disable-next-line ts/no-unsafe-type-assertion -- oxlint honours any prefix
export const id = (value: unknown): string => value as string;
