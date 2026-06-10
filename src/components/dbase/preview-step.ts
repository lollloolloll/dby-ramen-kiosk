type SearchParamsReader = {
  get(name: string): string | null;
};

export type DbaseInitialStep = "entry" | "contents";

export function getDbaseInitialStep(
  searchParams: SearchParamsReader
): DbaseInitialStep {
  return searchParams.get("preview") === "1" &&
    searchParams.get("step") === "contents"
    ? "contents"
    : "entry";
}
