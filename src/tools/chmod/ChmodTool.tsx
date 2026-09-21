import { useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, Panel, TextField, Toggle } from '@/components/ui';
import { HeroResult, KeyValue } from '@/components/TextIO';
import { CHMOD_PRESETS, EMPTY_PERMISSIONS, applyChmodExpression, describePermissions, octalToPermissions, permissionsToOctal, permissionsToSymbolic, symbolicToPermissions } from '@/lib/chmod';
import type { Permissions } from '@/lib/chmod';

const WHO = [
  ['owner', 'Owner'],
  ['group', 'Group'],
  ['others', 'Others'],
] as const;
const WHAT = [
  ['read', 'Read', 4],
  ['write', 'Write', 2],
  ['execute', 'Execute', 1],
] as const;

export default function ChmodTool(): React.ReactElement {
  const [perms, setPerms] = useState<Permissions>(() => octalToPermissions('755') ?? EMPTY_PERMISSIONS);
  const [isDirectory, setIsDirectory] = useState(false);
  const [expression, setExpression] = useState('');
  const [exprError, setExprError] = useState<string | null>(null);

  const octal = permissionsToOctal(perms);
  const symbolic = permissionsToSymbolic(perms, isDirectory);
  const descriptions = useMemo(() => describePermissions(perms, isDirectory), [perms, isDirectory]);

  const setOctal = (value: string): void => {
    const parsed = octalToPermissions(value);
    if (parsed) setPerms(parsed);
  };
  const setSymbolic = (value: string): void => {
    const parsed = symbolicToPermissions(value);
    if (parsed) setPerms(parsed);
  };
  const apply = (): void => {
    try {
      setPerms(applyChmodExpression(perms, expression));
      setExprError(null);
    } catch (e) {
      setExprError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ToolShell slug="chmod-calculator">
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,24rem)]">
        <div className="flex flex-col gap-4">
          <Panel title="Permissions">
            <div className="overflow-x-auto p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="muted text-left text-xs uppercase">
                    <th scope="col" className="pb-2 font-semibold">Who</th>
                    {WHAT.map(([, label, bit]) => (
                      <th key={label} scope="col" className="pb-2 font-semibold">
                        {label} <span className="muted font-mono normal-case">({bit})</span>
                      </th>
                    ))}
                    <th scope="col" className="pb-2 font-semibold">Digit</th>
                  </tr>
                </thead>
                <tbody>
                  {WHO.map(([who, label]) => {
                    const set = perms[who];
                    const digit = (set.read ? 4 : 0) + (set.write ? 2 : 0) + (set.execute ? 1 : 0);
                    return (
                      <tr key={who} className="border-t">
                        <th scope="row" className="py-2.5 text-left font-medium">{label}</th>
                        {WHAT.map(([what]) => (
                          <td key={what} className="py-2.5">
                            <input
                              type="checkbox"
                              aria-label={`${label} ${what}`}
                              checked={set[what]}
                              onChange={(e) => setPerms({ ...perms, [who]: { ...set, [what]: e.target.checked } })}
                            />
                          </td>
                        ))}
                        <td className="py-2.5 font-mono text-lg font-semibold" style={{ color: 'var(--accent)' }}>{digit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-4 flex flex-wrap gap-4 border-t pt-4">
                <Toggle checked={perms.setuid} onChange={(v) => setPerms({ ...perms, setuid: v })} label="setuid (4)" />
                <Toggle checked={perms.setgid} onChange={(v) => setPerms({ ...perms, setgid: v })} label="setgid (2)" />
                <Toggle checked={perms.sticky} onChange={(v) => setPerms({ ...perms, sticky: v })} label="sticky (1)" />
                <Toggle checked={isDirectory} onChange={setIsDirectory} label="It is a directory" />
              </div>
            </div>
          </Panel>
          <div className="grid gap-4 sm:grid-cols-2">
            <HeroResult label="Octal" value={octal} copy={octal} sub={`chmod ${octal} file`} />
            <HeroResult label="Symbolic (ls -l)" value={symbolic} copy={symbolic} />
          </div>
          <Panel title="Commands" bodyClassName="px-4">
            <KeyValue
              dense
              rows={[
                { key: 'Numeric', value: `chmod ${octal} path`, copy: `chmod ${octal} path` },
                { key: 'Symbolic', value: `chmod u=${flags(perms.owner)},g=${flags(perms.group)},o=${flags(perms.others)} path`, copy: `chmod u=${flags(perms.owner)},g=${flags(perms.group)},o=${flags(perms.others)} path` },
                { key: 'Recursive', value: `chmod -R ${octal} directory`, copy: `chmod -R ${octal} directory` },
                { key: 'Files only', value: `find . -type f -exec chmod ${octal.slice(-3)} {} +`, copy: `find . -type f -exec chmod ${octal.slice(-3)} {} +` },
              ]}
            />
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="Type a mode">
            <div className="flex flex-col gap-3 p-4">
              <TextField label="Octal" value={octal} onChange={setOctal} mono hint="3 or 4 digits, e.g. 644 or 2755" />
              <TextField label="Symbolic" value={symbolic} onChange={setSymbolic} mono hint="10 characters as shown by ls -l" />
              <div>
                <TextField label="Apply expression" value={expression} onChange={setExpression} mono placeholder="u+x,go-w  or  a=r,u+w" invalid={Boolean(exprError)} hint={exprError ?? 'Same syntax as chmod: who (u g o a), operator (+ - =), perms (r w x s t X).'} />
                <button type="button" className="btn btn-sm mt-2" onClick={apply} disabled={!expression.trim()}>
                  Apply
                </button>
              </div>
            </div>
          </Panel>
          <Panel title="What it means">
            <ul className="space-y-1.5 p-4 text-sm">
              {descriptions.map((d) => (
                <li key={d} className="flex gap-2">
                  <span aria-hidden style={{ color: 'var(--accent)' }}>•</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
            {perms.others.write && !perms.sticky && (
              <Callout tone="warning" className="m-4 mt-0">
                World-writable: anyone on the system can modify this. Rarely what you want.
              </Callout>
            )}
          </Panel>
          <Panel title="Common modes">
            <ul className="divide-y">
              {CHMOD_PRESETS.map((p) => (
                <li key={p.octal}>
                  <button type="button" className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:surface-3" onClick={() => setOctal(p.octal)}>
                    <span className="font-mono font-semibold" style={{ color: 'var(--accent)' }}>{p.octal}</span>
                    <span className="flex-1">
                      <span className="block font-medium">{p.label}</span>
                      <span className="muted block text-xs">{p.use}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </ToolShell>
  );
}

function flags(set: { read: boolean; write: boolean; execute: boolean }): string {
  return `${set.read ? 'r' : ''}${set.write ? 'w' : ''}${set.execute ? 'x' : ''}` || '-';
}
