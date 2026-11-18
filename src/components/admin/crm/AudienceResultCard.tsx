// The shape of a count, shared by the page and the summary card. The summary card is in AudienceSummary.tsx.
export type CountData = {
  total: number;
  inFile: number;
  leftOut: { noContact: number; doNotContact: number };
  tooLarge: boolean;
  ignoredChoices: string[];
  needsUpdate: boolean;
  statusNeedsUpdate: boolean;
};

export type CountState =
  | { status: "idle"; key: string }
  | { status: "loading"; key: string }
  | { status: "error"; key: string; error: string }
  | { status: "done"; key: string; data: CountData };
