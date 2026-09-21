/**
 * Unix permission calculator: octal ⇄ symbolic ⇄ checkboxes, special bits,
 * and a plain-English explanation.
 */

export interface PermissionSet {
  read: boolean;
  write: boolean;
  execute: boolean;
}

export interface Permissions {
  owner: PermissionSet;
  group: PermissionSet;
  others: PermissionSet;
  setuid: boolean;
  setgid: boolean;
  sticky: boolean;
}

export const EMPTY_PERMISSIONS: Permissions = {
  owner: { read: false, write: false, execute: false },
  group: { read: false, write: false, execute: false },
  others: { read: false, write: false, execute: false },
  setuid: false,
  setgid: false,
  sticky: false,
};

const setToDigit = (s: PermissionSet) => (s.read ? 4 : 0) + (s.write ? 2 : 0) + (s.execute ? 1 : 0);
const digitToSet = (d: number): PermissionSet => ({ read: (d & 4) !== 0, write: (d & 2) !== 0, execute: (d & 1) !== 0 });

export function permissionsToOctal(p: Permissions, includeSpecial = true): string {
  const special = (p.setuid ? 4 : 0) + (p.setgid ? 2 : 0) + (p.sticky ? 1 : 0);
  const base = `${setToDigit(p.owner)}${setToDigit(p.group)}${setToDigit(p.others)}`;
  return includeSpecial && special ? `${special}${base}` : base;
}

export function octalToPermissions(octal: string): Permissions | null {
  const clean = octal.trim().replace(/^0o?/i, '');
  if (!/^[0-7]{3,4}$/.test(clean)) return null;
  const digits = clean.padStart(4, '0').split('').map(Number) as [number, number, number, number];
  return {
    setuid: (digits[0] & 4) !== 0,
    setgid: (digits[0] & 2) !== 0,
    sticky: (digits[0] & 1) !== 0,
    owner: digitToSet(digits[1]),
    group: digitToSet(digits[2]),
    others: digitToSet(digits[3]),
  };
}

export function permissionsToSymbolic(p: Permissions, isDirectory = false): string {
  const tri = (s: PermissionSet, special: boolean, specialChar: string) => {
    const x = s.execute ? (special ? specialChar.toLowerCase() : 'x') : special ? specialChar.toUpperCase() : '-';
    return `${s.read ? 'r' : '-'}${s.write ? 'w' : '-'}${x}`;
  };
  return `${isDirectory ? 'd' : '-'}${tri(p.owner, p.setuid, 's')}${tri(p.group, p.setgid, 's')}${tri(p.others, p.sticky, 't')}`;
}

export function symbolicToPermissions(symbolic: string): Permissions | null {
  let s = symbolic.trim();
  if (s.length === 10) s = s.slice(1);
  if (!/^[rwxsStT-]{9}$/.test(s)) return null;
  const parse = (chunk: string, specialLower: string): PermissionSet & { special: boolean } => ({
    read: chunk[0] === 'r',
    write: chunk[1] === 'w',
    execute: chunk[2] === 'x' || chunk[2] === specialLower,
    special: chunk[2]?.toLowerCase() === specialLower,
  });
  const o = parse(s.slice(0, 3), 's');
  const g = parse(s.slice(3, 6), 's');
  const t = parse(s.slice(6, 9), 't');
  return {
    owner: { read: o.read, write: o.write, execute: o.execute },
    group: { read: g.read, write: g.write, execute: g.execute },
    others: { read: t.read, write: t.write, execute: t.execute },
    setuid: o.special,
    setgid: g.special,
    sticky: t.special,
  };
}

/** Apply a chmod expression like "u+x,go-w" or "a=r" to a permission set. */
export function applyChmodExpression(base: Permissions, expression: string): Permissions {
  const result: Permissions = JSON.parse(JSON.stringify(base)) as Permissions;
  for (const clause of expression.split(',').map((c) => c.trim()).filter(Boolean)) {
    const m = /^([ugoa]*)([+\-=])([rwxXst]*)$/.exec(clause);
    if (!m) throw new Error(`Cannot parse “${clause}”. Use forms like u+x, go-w, a=r.`);
    const who = m[1] || 'a';
    const op = m[2]!;
    const perms = m[3]!;
    const targets: Array<'owner' | 'group' | 'others'> = [];
    if (who.includes('a')) targets.push('owner', 'group', 'others');
    if (who.includes('u')) targets.push('owner');
    if (who.includes('g')) targets.push('group');
    if (who.includes('o')) targets.push('others');
    const anyExec = result.owner.execute || result.group.execute || result.others.execute;
    for (const t of targets) {
      const set = result[t];
      const flags = {
        read: perms.includes('r'),
        write: perms.includes('w'),
        execute: perms.includes('x') || (perms.includes('X') && anyExec),
      };
      if (op === '=') {
        set.read = flags.read;
        set.write = flags.write;
        set.execute = flags.execute;
      } else {
        const value = op === '+';
        if (flags.read) set.read = value;
        if (flags.write) set.write = value;
        if (flags.execute) set.execute = value;
      }
      if (perms.includes('s')) {
        if (t === 'owner') result.setuid = op !== '-';
        if (t === 'group') result.setgid = op !== '-';
      }
      if (perms.includes('t') && t === 'others') result.sticky = op !== '-';
    }
  }
  return result;
}

export function describePermissions(p: Permissions, isDirectory = false): string[] {
  const lines: string[] = [];
  const describeSet = (label: string, s: PermissionSet) => {
    const can: string[] = [];
    if (s.read) can.push(isDirectory ? 'list contents' : 'read');
    if (s.write) can.push(isDirectory ? 'create/delete entries' : 'modify');
    if (s.execute) can.push(isDirectory ? 'enter (traverse)' : 'execute');
    lines.push(`${label} can ${can.length ? can.join(', ') : 'do nothing'}.`);
  };
  describeSet('Owner', p.owner);
  describeSet('Group', p.group);
  describeSet('Everyone else', p.others);
  if (p.setuid) lines.push(isDirectory ? 'setuid on a directory is ignored on most systems.' : 'setuid: runs with the owner’s privileges.');
  if (p.setgid) lines.push(isDirectory ? 'setgid: new files inherit this directory’s group.' : 'setgid: runs with the group’s privileges.');
  if (p.sticky) lines.push(isDirectory ? 'Sticky: only owners can delete their own files (like /tmp).' : 'Sticky bit on a file has no effect on modern systems.');
  if (p.others.write && !p.sticky) lines.push('⚠ World-writable — anyone on the system can change this.');
  if (!p.owner.read && !p.owner.write) lines.push('⚠ The owner cannot read or write their own file.');
  return lines;
}

export const CHMOD_PRESETS: Array<{ octal: string; label: string; use: string }> = [
  { octal: '644', label: 'rw-r--r--', use: 'Regular files' },
  { octal: '600', label: 'rw-------', use: 'Private keys, secrets' },
  { octal: '755', label: 'rwxr-xr-x', use: 'Scripts, directories' },
  { octal: '700', label: 'rwx------', use: 'Private directories (~/.ssh)' },
  { octal: '664', label: 'rw-rw-r--', use: 'Group-shared files' },
  { octal: '775', label: 'rwxrwxr-x', use: 'Group-shared directories' },
  { octal: '1777', label: 'rwxrwxrwt', use: 'Public temp dirs (/tmp)' },
  { octal: '2775', label: 'rwxrwsr-x', use: 'Shared project dirs (setgid)' },
  { octal: '444', label: 'r--r--r--', use: 'Read-only files' },
];
