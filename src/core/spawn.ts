/**
 * Thin Bun.spawn wrapper shared by registry helpers.
 */

export type RegResult = {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
};

export async function spawn(
  command: string,
  args: string[],
): Promise<RegResult> {
  const proc = Bun.spawn([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  const exitCode = code ?? 1;
  return {
    ok: exitCode === 0,
    code: exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}
