import { planAssignment, chunk, ASSIGN_CONTACTS_STORAGE_KEY } from "@/lib/crm/assignment";

const A = "agent-a";
const B = "agent-b";
const c = (id: string, ownerId: string | null = null, doNotContact = false) => ({ id, ownerId, doNotContact });

describe("planAssignment", () => {
  it("assigns unowned contacts", () => {
    const p = planAssignment([c("1"), c("2")], A, false);
    expect(p.toAssign).toEqual(["1", "2"]);
    expect(p.reassigning).toEqual([]);
  });

  it("default mode skips contacts owned by another agent", () => {
    const p = planAssignment([c("1"), c("2", B)], A, false);
    expect(p.toAssign).toEqual(["1"]);
    expect(p.skippedOwned).toEqual(["2"]);
  });

  it("override mode takes owned contacts and reports them as reassigning", () => {
    const p = planAssignment([c("1"), c("2", B)], A, true);
    expect(p.toAssign).toEqual(["1", "2"]);
    expect(p.reassigning).toEqual(["2"]);
    expect(p.skippedOwned).toEqual([]);
  });

  it("contacts already owned by the target are a no-op in both modes", () => {
    for (const include of [false, true]) {
      const p = planAssignment([c("1", A)], A, include);
      expect(p.toAssign).toEqual([]);
      expect(p.alreadyYours).toEqual(["1"]);
    }
  });

  it("do-not-contact is never assigned, even with override", () => {
    const p = planAssignment([c("1", null, true), c("2", B, true)], A, true);
    expect(p.toAssign).toEqual([]);
    expect(p.skippedDnc).toEqual(["1", "2"]);
  });

  it("duplicate candidate ids are counted once", () => {
    const p = planAssignment([c("1"), c("1")], A, false);
    expect(p.toAssign).toEqual(["1"]);
  });

  it("empty input gives an empty plan", () => {
    expect(planAssignment([], A, true).toAssign).toEqual([]);
  });
});

describe("chunk", () => {
  it("splits into slices of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
  it("rejects a non-positive size", () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

it("storage key is stable", () => {
  expect(ASSIGN_CONTACTS_STORAGE_KEY).toBe("pz.assign.contacts");
});
