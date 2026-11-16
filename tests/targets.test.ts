import { describe, expect, test } from "bun:test";
import {
  backingShellKeyForTarget,
  shellRootForTarget,
  type ContextTarget,
  type RegistryScope,
} from "../src/core/targets.ts";

const roots: Array<{
  target: ContextTarget;
  scope: RegistryScope;
  expected: string;
}> = [
  {
    target: "file",
    scope: "machine",
    expected: "HKLM\\Software\\Classes\\*\\shell",
  },
  {
    target: "file",
    scope: "user",
    expected: "HKCU\\Software\\Classes\\*\\shell",
  },
  {
    target: "directory",
    scope: "machine",
    expected: "HKLM\\Software\\Classes\\Directory\\shell",
  },
  {
    target: "directory",
    scope: "user",
    expected: "HKCU\\Software\\Classes\\Directory\\shell",
  },
  {
    target: "background",
    scope: "machine",
    expected: "HKLM\\Software\\Classes\\Directory\\Background\\shell",
  },
  {
    target: "background",
    scope: "user",
    expected: "HKCU\\Software\\Classes\\Directory\\Background\\shell",
  },
];

describe("scope-aware shell registry paths", () => {
  test.each(roots)(
    "returns the $scope backing root for the $target target",
    ({ target, scope, expected }) => {
      expect(shellRootForTarget(target, scope)).toBe(expected);
    },
  );

  test.each(roots)(
    "returns the exact $scope backing key for the $target target",
    ({ target, scope, expected }) => {
      expect(backingShellKeyForTarget(target, scope, "Open in Codex")).toBe(
        `${expected}\\Open in Codex`,
      );
    },
  );
});

describe("strict backing entry names", () => {
  test.each([
    { description: "an empty name", name: "" },
    { description: "a whitespace-only name", name: "   " },
    { description: "a dot path segment", name: "." },
    { description: "a dot-dot path segment", name: ".." },
    { description: "a forward-slash separator", name: "folder/child" },
    { description: "a backslash separator", name: "folder\\child" },
    { description: "a control character", name: "Open\u0000Name" },
  ])("rejects $description", ({ name }) => {
    expect(() => backingShellKeyForTarget("file", "machine", name)).toThrow();
  });

  test.each([
    "Open*",
    "Open?",
    "C:child",
    'Say "Hi"',
    "Open <Now>",
    "Pipe|Entry",
  ])("keeps printable registry child name %p addressable", (name) => {
    expect(backingShellKeyForTarget("file", "machine", name)).toBe(
      `HKLM\\Software\\Classes\\*\\shell\\${name}`,
    );
  });

  test("preserves surrounding whitespace in a valid child name", () => {
    expect(
      backingShellKeyForTarget("file", "machine", "  Open in Codex  "),
    ).toBe("HKLM\\Software\\Classes\\*\\shell\\  Open in Codex  ");
  });
});
