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
