import { describe, expect, it } from 'vitest';
import { base64ToBytes, binaryToText, decodeBase64, decodeHtmlEntities, encodeBase64, encodeHtmlEntities, morseToText, parseUrl, rot13, textToBinary, textToMorse, urlDecode, urlEncode } from './encoding';
import { adler32, digest, digestsEqual, formatDigest, guessAlgorithmFromDigest, hmac, md5 } from './hash';
import { decodeJwt, signJwtHmac, verifyJwtHmac } from './jwt';
import { formatUuid, inspectUuid, nanoid, ulid, ulidTimestamp, uuidV1, uuidV4, uuidV5, uuidV7, UUID_NAMESPACES } from './ids';
import { describeTimestamp, isoWeek, parseTimestamp, relativeTime } from './timestamp';
import { buildCron, nextRuns, parseCron } from './cron';
import { apcaContrast, contrastReport, formatColor, harmonies, mix, nearestNamedColor, parseColor, rgbToHex, rgbToHsl, rgbToOklch, simulateCvd, tonalScale } from './color';
import { convertNumber, float64Bits, fromRoman, numberToWords, toRoman } from './numbers';
import { convertCase, detectCase, slugify, splitWords, toTitleCase } from './textcase';
import { createRng, fakePeople, generateLorem } from './lorem';
import { countDuplicates, dedentLines, processLines, defaultLineOptions, sortLines, wrapText } from './lines';
import { analyzeText, countSyllables, splitSentences } from './readability';
import { cleanText, defaultCleanOptions, describeChar, escapeText, findInvisibles, inspectText, styleText, unescapeText } from './unicode';
import { decryptBytes, decryptText, encryptBytes, encryptText, generatePassphrase, generatePassword, isEncryptedEnvelope, passwordStrength } from './textcrypto';
import { applyChmodExpression, describePermissions, octalToPermissions, permissionsToOctal, permissionsToSymbolic, symbolicToPermissions } from './chmod';
import { generateTypes } from './json-to-ts';
import { formatXml, jsonToXml, minifyXml, parseXml, xmlStats, xmlToJson } from './xml';
import { cssStats, formatCss, formatHtml, minifyCss, minifyHtml } from './cssfmt';
import { generateQrMatrix, renderQrSvg, vcardPayload, wifiPayload } from './qr';
import { exportAse, exportPalette, extractPalette } from './palette';
import { buildIco } from './ico';
import { optimizeSvg, svgDimensions, svgToDataUri, svgToReactComponent } from './svgopt';
import { byteHistogram, detectFileType, hexDump, sniffText } from './filetype';
import { convertUnit, cookingToGrams, findUnit, formatQuantity, parseQuantity } from './units';
import { addBusinessDays, ageReport, dateDiff, easterSunday, humanizeDiff } from './dates';
import { amortize, compoundInterest, monthlyPayment, savingsGoal, tipSplit, vat } from './finance';
import { flipCoins, randomInt, randomInts, rollDice, shuffleArray, splitTeams, weightedPick } from './random';
import { readImageMetadata, stripJpegMetadata } from './exif';

describe('encoding', () => {
  it('round-trips UTF-8 through Base64 (standard and URL-safe)', () => {
    const text = 'héllo wörld → 日本語 🎉';
    const b64 = encodeBase64(text);
    expect(decodeBase64(b64).text).toBe(text);
    const url = encodeBase64(text, { urlSafe: true, padding: false });
    expect(url).not.toMatch(/[+/=]/);
    expect(decodeBase64(url).text).toBe(text);
  });
  it('rejects garbage Base64 and accepts data URIs', () => {
    expect(() => base64ToBytes('not base64!!')).toThrow(/Invalid Base64/);
    expect(new TextDecoder().decode(base64ToBytes('data:text/plain;base64,aGk='))).toBe('hi');
  });
  it('encodes and decodes URL components and forms', () => {
    expect(urlEncode('a b&c=d/é', 'component')).toBe('a%20b%26c%3Dd%2F%C3%A9');
    expect(urlEncode('a b', 'form')).toBe('a+b');
    expect(urlDecode('a+b%20c', 'form')).toBe('a b c');
    expect(urlDecode('100%')).toBe('100%');
  });
  it('parses URLs into parts', () => {
    const u = parseUrl('https://user:pw@example.com:8443/a/b%20c?x=1&y=two#frag');
    expect(u?.hostname).toBe('example.com');
    expect(u?.port).toBe('8443');
    expect(u?.params).toEqual([{ key: 'x', value: '1' }, { key: 'y', value: 'two' }]);
    expect(u?.pathSegments).toEqual(['a', 'b c']);
    expect(parseUrl('example.org/path')?.protocol).toBe('https');
  });
  it('handles HTML entities both ways', () => {
    expect(encodeHtmlEntities('<a href="x">Tom & Jerry ©</a>')).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry &copy;&lt;/a&gt;');
    expect(encodeHtmlEntities('©€', 'numeric')).toBe('&#169;&#8364;');
    expect(decodeHtmlEntities('&lt;p&gt; &amp;amp; &#169; &#x1F600; &nbsp;&unknown;')).toBe('<p> &amp; © 😀 \u00a0&unknown;');
  });
  it('does binary, morse and rot13', () => {
    expect(textToBinary('Hi')).toBe('01001000 01101001');
    expect(binaryToText('01001000 01101001')).toBe('Hi');
    expect(textToMorse('SOS ok')).toBe('... --- ... / --- -.-');
    expect(morseToText('... --- ... / --- -.-')).toBe('SOS OK');
    expect(rot13(rot13('Hello, World!'))).toBe('Hello, World!');
  });
});

describe('hash', () => {
  it('computes MD5 test vectors', () => {
    expect(formatDigest(md5(''))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(formatDigest(md5('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(formatDigest(md5('The quick brown fox jumps over the lazy dog'))).toBe('9e107d9d372bb6826bd81d3542a419d6');
    expect(formatDigest(md5('a'.repeat(1000)))).toBe('cabe45dcc9ae5b66ba86600cca6b8ba8');
  });
  it('computes SHA family via WebCrypto and checksums', async () => {
    expect(formatDigest(await digest('sha256', 'abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(formatDigest(await digest('sha1', 'abc'))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(formatDigest(await digest('crc32', 'The quick brown fox jumps over the lazy dog'))).toBe('414fa339');
    expect(adler32('Wikipedia').toString(16)).toBe('11e60398');
    expect(formatDigest(await digest('sha256', 'abc'), 'base64')).toBe('ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
  });
  it('computes HMAC and compares digests', async () => {
    const mac = await hmac('sha256', 'key', 'The quick brown fox jumps over the lazy dog');
    expect(formatDigest(mac)).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
    expect(digestsEqual('ABC', 'abc')).toBe(true);
    expect(digestsEqual('abc', 'abd')).toBe(false);
    expect(guessAlgorithmFromDigest('d41d8cd98f00b204e9800998ecf8427e')).toEqual(['md5']);
  });
});

describe('jwt', () => {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  it('decodes header, payload and flags issues', () => {
    const d = decodeJwt(token, 1700000000);
    expect(d.header.alg).toBe('HS256');
    expect(d.payload.name).toBe('John Doe');
    expect(d.issues).toContain('No "exp" claim — the token never expires.');
    expect(d.claims.find((c) => c.key === 'iat')?.display).toMatch(/ago\)$/);
  });
  it('verifies and signs HS256 tokens', async () => {
    expect(await verifyJwtHmac(token, 'your-256-bit-secret')).toBe(true);
    expect(await verifyJwtHmac(token, 'wrong')).toBe(false);
    const signed = await signJwtHmac({ alg: 'HS256' }, { sub: 'x', exp: 1 }, 's3cret');
    expect(await verifyJwtHmac(signed, 's3cret')).toBe(true);
    expect(decodeJwt(signed, 1700000000).expired).toBe(true);
  });
  it('explains malformed tokens', () => {
    expect(() => decodeJwt('a.b')).toThrow(/three dot-separated parts/);
    expect(() => decodeJwt('a.b.c.d.e')).toThrow(/JWE/);
  });
});

describe('ids', () => {
  it('generates valid UUIDs of each version', async () => {
    expect(inspectUuid(uuidV4()).version).toBe(4);
    const v7 = uuidV7(1700000000000);
    expect(inspectUuid(v7).version).toBe(7);
    expect(inspectUuid(v7).timestamp?.getTime()).toBe(1700000000000);
    expect(inspectUuid(uuidV1()).version).toBe(1);
    expect(await uuidV5('example.com', UUID_NAMESPACES.DNS)).toBe('cfbff0d1-9375-5685-968c-48ce8b15ae17');
    expect(formatUuid(v7, 'compact')).toHaveLength(32);
    expect(formatUuid(v7, 'urn')).toMatch(/^urn:uuid:/);
  });
  it('generates ULIDs and nanoids', () => {
    const id = ulid(1700000000000);
    expect(id).toHaveLength(26);
    expect(ulidTimestamp(id)?.getTime()).toBe(1700000000000);
    expect(nanoid()).toHaveLength(21);
    expect(nanoid(10, 'abc')).toMatch(/^[abc]{10}$/);
  });
});

describe('timestamp', () => {
  const now = new Date('2024-05-01T12:00:00Z');
  it('detects unix units', () => {
    expect(parseTimestamp('1700000000')?.interpretation).toBe('Unix seconds');
    expect(parseTimestamp('1700000000000')?.date.toISOString()).toBe('2023-11-14T22:13:20.000Z');
    expect(parseTimestamp('1700000000000000')?.interpretation).toBe('Unix microseconds');
    expect(parseTimestamp('1700000000123456789')?.fraction).toBe('456789');
  });
  it('parses ISO, relative and natural forms', () => {
    expect(parseTimestamp('2024-02-29T10:00:00Z')?.date.toISOString()).toBe('2024-02-29T10:00:00.000Z');
    expect(parseTimestamp('in 2 hours', now)?.date.toISOString()).toBe('2024-05-01T14:00:00.000Z');
    expect(parseTimestamp('3 days ago', now)?.date.getDate()).toBe(28);
    expect(parseTimestamp('now', now)?.date.getTime()).toBe(now.getTime());
    expect(parseTimestamp('garbage')).toBeNull();
  });
  it('describes timestamps', () => {
    const d = describeTimestamp(new Date('2024-01-01T00:00:00Z'), now);
    expect(d.unixSeconds).toBe('1704067200');
    expect(d.isoWeek).toBe('2024-W01');
    expect(isoWeek(new Date(2021, 0, 3))).toEqual({ year: 2020, week: 53 });
    expect(relativeTime(new Date(now.getTime() - 90_000), now)).toMatch(/2 minutes ago/);
  });
});

describe('cron', () => {
  it('describes common expressions', () => {
    expect(parseCron('0 9 * * 1-5').description).toBe('At 09:00, on weekdays.');
    expect(parseCron('*/15 * * * *').description).toBe('Every 15 minutes.');
    expect(parseCron('0 0 1 1 *').description).toBe('At 00:00, on day 1 of the month, in January.');
    expect(parseCron('@hourly').description).toBe('Every hour, on the hour.');
    expect(parseCron('30 8 * * MON').description).toBe('At 08:30, on Monday.');
  });
  it('computes next runs', () => {
    const p = parseCron('0 9 * * 1-5');
    const runs = nextRuns(p, 3, new Date(2024, 4, 3, 10, 0)); // Friday 3 May 2024 10:00 local
    expect(runs.map((d) => `${d.getDate()}@${d.getHours()}`)).toEqual(['6@9', '7@9', '8@9']);
    const last = nextRuns(parseCron('0 0 L * *'), 1, new Date(2024, 1, 1));
    expect(last[0]?.getDate()).toBe(29);
  });
  it('rejects invalid input helpfully', () => {
    expect(() => parseCron('* * *')).toThrow(/Expected 5 fields/);
    expect(() => parseCron('60 * * * *')).toThrow(/out of range/);
    expect(buildCron({ minute: '5', hour: '', dayOfMonth: '', month: '', dayOfWeek: '' })).toBe('5 * * * *');
  });
});

describe('color', () => {
  it('parses many syntaxes', () => {
    expect(rgbToHex(parseColor('#f80')!)).toBe('#ff8800');
    expect(rgbToHex(parseColor('rgb(255 136 0 / 50%)')!)).toBe('#ff880080');
    expect(rgbToHex(parseColor('hsl(120 100% 25%)')!)).toBe('#008000');
    expect(rgbToHex(parseColor('rebeccapurple')!)).toBe('#663399');
    expect(rgbToHex(parseColor('oklch(62.8% 0.2577 29.23)')!)).toBe('#ff0000');
    expect(rgbToHex(parseColor('hwb(0 0% 0%)')!)).toBe('#ff0000');
    expect(parseColor('nope')).toBeNull();
  });
  it('converts and formats', () => {
    const c = parseColor('#3b82f6')!;
    const f = formatColor(c);
    expect(f.hsl).toBe('hsl(217 91% 60%)');
    expect(f.cmyk).toBe('cmyk(76%, 47%, 0%, 4%)');
    expect(rgbToHsl(c).h).toBeCloseTo(217.2, 0);
    expect(rgbToOklch(parseColor('#ffffff')!).l).toBeCloseTo(1, 2);
    expect(nearestNamedColor(parseColor('#ff0001')!).name).toBe('red');
  });
  it('reports contrast and generates palettes', () => {
    const black = parseColor('#000')!;
    const white = parseColor('#fff')!;
    expect(contrastReport(black, white).ratio).toBeCloseTo(21, 1);
    expect(contrastReport(parseColor('#777')!, white).grade).toBe('AA Large');
    expect(Math.abs(apcaContrast(black, white))).toBeGreaterThan(100);
    const complement = harmonies(parseColor('#ff0000')!).complementary[1]!;
    expect(rgbToHex(complement)).toBe('#00ffff');
    expect(tonalScale(parseColor('#3b82f6')!)).toHaveLength(11);
    expect(rgbToHex(mix(black, white, 0.5))).not.toBe('#000000');
    expect(simulateCvd(parseColor('#ff0000')!, 'achromatopsia').r).toBeCloseTo(simulateCvd(parseColor('#ff0000')!, 'achromatopsia').g, 0);
  });
});

describe('numbers', () => {
  it('converts between bases with BigInt precision', () => {
    const c = convertNumber('255', 10);
    expect(c.binary).toBe('11111111');
    expect(c.hex).toBe('ff');
    expect(c.roman).toBe('CCLV');
    expect(c.words).toBe('two hundred fifty-five');
    expect(convertNumber('0xFFFFFFFFFFFFFFFFFFFF', 16).decimal).toBe('1208925819614629174706175');
    expect(convertNumber('-5', 10).twosComplement[8]).toBe('11111011');
    expect(convertNumber('1010.1', 2).decimal).toBe('10.5');
    expect(() => convertNumber('12', 2)).toThrow(/not a valid base-2/);
  });
  it('handles roman numerals and words', () => {
    expect(toRoman(1994)).toBe('MCMXCIV');
    expect(fromRoman('mcmxciv')).toBe(1994);
    expect(fromRoman('IIII')).toBeNull();
    expect(numberToWords(1000001n)).toBe('one million one');
    expect(float64Bits(1).exponent).toBe('01111111111');
  });
});

describe('textcase', () => {
  it('splits identifiers into words', () => {
    expect(splitWords('HTMLParserV2 is_here-now')).toEqual(['html', 'parser', 'v', '2', 'is', 'here', 'now']);
  });
  it('converts between cases', () => {
    expect(convertCase('hello big world', 'camel')).toBe('helloBigWorld');
    expect(convertCase('helloBigWorld', 'snake')).toBe('hello_big_world');
    expect(convertCase('hello big world', 'screaming-snake')).toBe('HELLO_BIG_WORLD');
    expect(toTitleCase('the lord of the rings')).toBe('The Lord of the Rings');
    expect(convertCase('hello. how are you? i am fine', 'sentence')).toBe('Hello. How are you? I am fine');
    expect(slugify('Crème Brûlée & Straße!')).toBe('creme-brulee-strasse');
    expect(detectCase('fooBarBaz')).toBe('camel');
    expect(convertCase('one\ntwo words', 'kebab')).toBe('one\ntwo-words');
  });
});

describe('lorem & fake data', () => {
  it('is deterministic with a seed', () => {
    const a = generateLorem({ flavor: 'lorem', unit: 'paragraphs', count: 2, startWithClassic: true, seed: 7 });
    const b = generateLorem({ flavor: 'lorem', unit: 'paragraphs', count: 2, startWithClassic: true, seed: 7 });
    expect(a).toBe(b);
    expect(a.startsWith('Lorem ipsum dolor sit amet')).toBe(true);
    expect(a.split('\n\n')).toHaveLength(2);
    expect(generateLorem({ flavor: 'tech', unit: 'words', count: 12, startWithClassic: false, seed: 1 }).split(' ')).toHaveLength(12);
    expect(createRng(1)()).toBeCloseTo(createRng(1)(), 10);
  });
  it('generates people', () => {
    const people = fakePeople(3, 9);
    expect(people).toHaveLength(3);
    expect(people[0]?.email).toMatch(/@/);
    expect(fakePeople(3, 9)[1]?.fullName).toBe(people[1]?.fullName);
  });
});

describe('lines', () => {
  it('sorts naturally and numerically', () => {
    expect(sortLines(['file10', 'file2', 'file1'], 'natural')).toEqual(['file1', 'file2', 'file10']);
    expect(sortLines(['b 20', 'a 3', 'c 100'], 'numeric')).toEqual(['a 3', 'b 20', 'c 100']);
    expect(sortLines(['ccc', 'a', 'bb'], 'length', true)).toEqual(['ccc', 'bb', 'a']);
  });
  it('processes lines with options', () => {
    const r = processLines('b\na\n\nb\n a ', { ...defaultLineOptions, trim: true, removeEmpty: true, dedupe: true, sort: 'alpha', numbering: 'dot' });
    expect(r.text).toBe('1. a\n2. b');
    expect(r.removedDuplicates).toBe(2);
    expect(countDuplicates('x\ny\nx\nX', true)[0]).toEqual({ line: 'x', count: 3 });
    expect(processLines('apple\nbanana\ncherry', { ...defaultLineOptions, filterInclude: 'an' }).text).toBe('banana');
  });
  it('wraps and dedents', () => {
    expect(wrapText('one two three four five six', 10)).toBe('one two\nthree four\nfive six');
    expect(dedentLines('    a\n      b\n    c')).toBe('a\n  b\nc');
  });
});

describe('readability', () => {
  it('counts syllables and sentences', () => {
    expect(countSyllables('table')).toBe(2);
    expect(countSyllables('the')).toBe(1);
    expect(countSyllables('beautiful')).toBe(3);
    expect(splitSentences('Hello there. How are you? Fine!')).toHaveLength(3);
  });
  it('analyses text', () => {
    const s = analyzeText('The cat sat on the mat. It was a very good cat, and everyone loved it.');
    expect(s.words).toBe(16);
    expect(s.sentences).toBe(2);
    expect(s.scores.fleschReadingEase).toBeGreaterThan(80);
    expect(s.topWords[0]?.word).toBe('cat');
    expect(analyzeText('').words).toBe(0);
  });
});

describe('unicode', () => {
  it('describes characters', () => {
    expect(describeChar('A').name).toBe('LATIN CAPITAL LETTER A');
    expect(describeChar('\u200b').isInvisible).toBe(true);
    expect(describeChar('😀').utf8).toBe('F0 9F 98 80');
    expect(describeChar('é').block).toBe('Latin-1 Supplement');
    expect(inspectText('e\u0301').graphemes).toBe(1);
  });
  it('finds and cleans invisibles', () => {
    const hits = findInvisibles('ab\u200bc\nd\u00a0e');
    expect(hits.map((h) => h.name)).toEqual(['ZERO WIDTH SPACE', 'NO-BREAK SPACE']);
    expect(hits[1]?.line).toBe(2);
    expect(cleanText('a\u200bb\u00a0c “q”', { ...defaultCleanOptions, straightenQuotes: true }).text).toBe('ab c "q"');
  });
  it('escapes, unescapes and styles', () => {
    expect(escapeText('é😀', 'js')).toBe('\\u00e9\\u{1f600}');
    expect(escapeText('😀', 'json')).toBe('\\ud83d\\ude00');
    expect(unescapeText('\\u00e9 &#x1F600; U+0041')).toBe('é 😀 A');
    expect(styleText('Hi 5', 'bold')).toBe('𝐇𝐢 𝟓');
    expect(styleText('h', 'italic')).toBe('ℎ');
  });
});

describe('textcrypto', () => {
  it('encrypts and decrypts text and bytes', async () => {
    const cipher = await encryptText('secret message ✨', 'pa55word');
    expect(isEncryptedEnvelope(cipher)).toBe(true);
    expect(await decryptText(cipher, 'pa55word')).toBe('secret message ✨');
    await expect(decryptText(cipher, 'nope')).rejects.toThrow(/wrong password/);
    const bytes = new Uint8Array([1, 2, 3, 250]);
    const env = await encryptBytes(bytes, 'k');
    expect(Array.from(await decryptBytes(env, 'k'))).toEqual([1, 2, 3, 250]);
  }, 20000);
  it('scores passwords and generates them', () => {
    expect(passwordStrength('password').score).toBe(0);
    expect(passwordStrength('correct horse battery staple 42!').score).toBe(4);
    const pw = generatePassword({ length: 24, lowercase: true, uppercase: true, digits: true, symbols: true, excludeAmbiguous: true });
    expect(pw).toHaveLength(24);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/\d/);
    expect(generatePassphrase(4, '-').split('-')).toHaveLength(4);
  });
});

describe('chmod', () => {
  it('converts between forms', () => {
    const p = octalToPermissions('755')!;
    expect(permissionsToSymbolic(p)).toBe('-rwxr-xr-x');
    expect(permissionsToOctal(symbolicToPermissions('rw-r--r--')!)).toBe('644');
    expect(permissionsToSymbolic(octalToPermissions('4755')!)).toBe('-rwsr-xr-x');
    expect(permissionsToOctal(octalToPermissions('1777')!)).toBe('1777');
    expect(octalToPermissions('999')).toBeNull();
  });
  it('applies symbolic expressions', () => {
    const base = octalToPermissions('644')!;
    expect(permissionsToOctal(applyChmodExpression(base, 'u+x,go-r'))).toBe('700');
    expect(permissionsToOctal(applyChmodExpression(base, 'a=rw'))).toBe('666');
    expect(describePermissions(octalToPermissions('666')!).some((l) => l.includes('World-writable'))).toBe(true);
  });
});

describe('json-to-ts', () => {
  const sample = { id: 1, name: 'A', tags: ['x'], meta: { created: '2024-01-01T00:00:00Z', score: 1.5 }, items: [{ sku: 'a', qty: 1 }, { sku: 'b', qty: 2, note: 'n' }], nothing: null };
  it('emits TypeScript interfaces with optional merged keys', () => {
    const ts = generateTypes(sample, { rootName: 'Order' });
    expect(ts).toContain('export interface Order {');
    expect(ts).toContain('items: Item[];');
    expect(ts).toContain('note?: string;');
    expect(ts).toContain('created: string; // datetime');
    expect(ts).toContain('nothing: null;');
  });
  it('emits other targets', () => {
    expect(generateTypes(sample, { target: 'zod' })).toContain('z.object({');
    expect(JSON.parse(generateTypes(sample, { target: 'json-schema' })).properties.items.type).toBe('array');
    expect(generateTypes(sample, { target: 'python' })).toContain('@dataclass');
    expect(generateTypes(sample, { target: 'go' })).toContain('type Root struct');
    expect(generateTypes([1, 2], { target: 'typescript' })).toContain('type Root = number[]');
  });
});

describe('xml', () => {
  const src = '<?xml version="1.0"?><root a="1"><!-- c --><item id="x">Hi &amp; bye</item><item id="y"/><n>42</n></root>';
  it('parses, formats and minifies', () => {
    expect(formatXml(src)).toBe('<?xml version="1.0"?>\n<root a="1">\n  <!-- c -->\n  <item id="x">Hi &amp; bye</item>\n  <item id="y" />\n  <n>42</n>\n</root>');
    expect(minifyXml(formatXml(src))).toBe('<?xml version="1.0"?><root a="1"><item id="x">Hi &amp; bye</item><item id="y"/><n>42</n></root>');
    expect(xmlStats(src)).toMatchObject({ elements: 4, attributes: 3, depth: 2 });
  });
  it('reports errors with positions', () => {
    expect(() => parseXml('<a><b></a>')).toThrow(/Expected <\/b> but found <\/a> \(line 1, column 7\)/);
    expect(() => parseXml('<a>x & y</a>')).toThrow(/Unescaped "&"/);
    expect(() => parseXml('<a href=x></a>')).toThrow(/must be quoted/);
    expect(() => parseXml('<a>')).toThrow(/Unclosed element <a>/);
  });
  it('converts XML to JSON and back', () => {
    expect(xmlToJson(src)).toEqual({ root: { '@a': 1, item: [{ '@id': 'x', '#text': 'Hi & bye' }, { '@id': 'y' }], n: 42 } });
    const xml = jsonToXml({ order: { '@id': 5, items: { item: ['a', 'b'] }, note: 'x < y' } });
    expect(xml).toContain('<order id="5">');
    expect(xml).toContain('<item>a</item>');
    expect(xml).toContain('x &lt; y');
    expect(xmlToJson(xml)).toEqual({ order: { '@id': 5, items: { item: ['a', 'b'] }, note: 'x < y' } });
  });
});

describe('css & html formatting', () => {
  it('beautifies and minifies CSS', () => {
    const css = 'a{color:red;background:url(data:image/png;base64,AAA)}@media (min-width:600px){a:hover,b{margin:0 auto}}';
    const pretty = formatCss(css);
    expect(pretty).toContain('a {\n  color: red;\n  background: url(data:image/png;base64,AAA);\n}');
    expect(pretty).toContain('@media (min-width: 600px) {\n  a:hover,\n  b {\n    margin: 0 auto;\n  }\n}');
    expect(minifyCss(pretty)).toBe('a{color:red;background:url(data:image/png;base64,AAA)}@media (min-width:600px){a:hover,b{margin:0 auto}}');
    expect(minifyCss('a { width: 0px; color: #ffffff; opacity: 0.5 }')).toBe('a{width:0;color:#fff;opacity:.5}');
    expect(cssStats(css).rules).toBe(2);
  });
  it('formats and minifies HTML', () => {
    const html = '<div><p>Hello <b>bold</b> text</p><img src="x"><ul><li>One</li></ul></div>';
    expect(formatHtml(html)).toBe('<div>\n  <p>\n    Hello <b>bold</b> text\n  </p>\n  <img src="x">\n  <ul>\n    <li>\n      One\n    </li>\n  </ul>\n</div>\n');
    expect(minifyHtml('<div>\n  <p>  a  </p>\n</div>')).toBe('<div><p> a </p></div>');
  });
});

describe('qr', () => {
  it('generates matrices and SVG', () => {
    const m = generateQrMatrix('https://example.com', 'M');
    expect(m.size).toBeGreaterThan(20);
    const svg = renderQrSvg(m, { size: 256 });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<path');
    expect(() => generateQrMatrix('')).toThrow();
    expect(wifiPayload({ ssid: 'Net;1', password: 'p"w', security: 'WPA', hidden: false })).toBe('WIFI:T:WPA;S:Net\\;1;P:p\\"w;;');
    expect(vcardPayload({ firstName: 'Ada', lastName: 'Lovelace', email: 'a@b.c' })).toContain('FN:Ada Lovelace');
  });
});

describe('palette & ico', () => {
  it('extracts dominant colours', () => {
    const px = new Uint8ClampedArray(4 * 100);
    for (let i = 0; i < 100; i++) {
      const red = i < 70;
      px.set([red ? 255 : 0, 0, red ? 0 : 255, 255], i * 4);
    }
    const pal = extractPalette(px, 2);
    expect(pal).toHaveLength(2);
    expect(pal[0]?.hex).toBe('#ff0000');
    expect(pal[0]?.percent).toBeCloseTo(70, 0);
    expect(exportPalette(pal, 'css')).toContain('--color-1: #ff0000;');
    expect(exportAse(pal).subarray(0, 4)).toEqual(new Uint8Array([0x41, 0x53, 0x45, 0x46]));
  });
  it('builds ICO containers', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const ico = buildIco([{ size: 32, png }, { size: 16, png }]);
    expect(Array.from(ico.subarray(0, 6))).toEqual([0, 0, 1, 0, 2, 0]);
    expect(ico[6]).toBe(16);
    expect(ico.length).toBe(6 + 32 + 14);
  });
});

describe('svg optimiser', () => {
  it('strips cruft and keeps geometry', () => {
    const svg = '<?xml version="1.0"?><!-- made in Inkscape --><svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://x" width="24" height="24" version="1.1"><metadata>x</metadata><g></g><path inkscape:label="p" fill-opacity="1" d="M 1.23456 2.34567 L 3 4"/></svg>';
    const r = optimizeSvg(svg, { removeDimensions: true });
    expect(r.svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1.23 2.35L3 4"/></svg>');
    expect(r.after).toBeLessThan(r.before);
    expect(svgDimensions(r.svg)).toEqual({ width: 24, height: 24 });
    expect(svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E");
    expect(svgToReactComponent('<svg stroke-width="2" class="a"></svg>', 'Star')).toContain('strokeWidth="2" className="a" {...props}');
  });
});

describe('file type detection', () => {
  it('detects magic bytes', () => {
    expect(detectFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.extension).toBe('png');
    expect(detectFileType(new TextEncoder().encode('%PDF-1.7'))?.mime).toBe('application/pdf');
    const zipDocx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode('....word/document.xml')]);
    expect(detectFileType(zipDocx)?.extension).toBe('docx');
    expect(detectFileType(new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it('sniffs text and dumps hex', () => {
    const t = sniffText(new TextEncoder().encode('{"a":1}\r\n'));
    expect(t.guess).toBe('JSON');
    expect(t.lineEndings).toBe('CRLF');
    expect(sniffText(new Uint8Array([0, 1, 2, 0, 0])).isText).toBe(false);
    expect(hexDump(new TextEncoder().encode('ABC'))).toBe('00000000  41 42 43                                          |ABC|');
    expect(byteHistogram(new Uint8Array(100)).entropy).toBe(0);
  });
});

describe('units', () => {
  it('converts across categories', () => {
    expect(convertUnit(1, findUnit('length', 'mi')!, findUnit('length', 'km')!)).toBeCloseTo(1.609344, 5);
    expect(convertUnit(100, findUnit('temperature', 'c')!, findUnit('temperature', 'f')!)).toBe(212);
    expect(convertUnit(1, findUnit('data', 'GiB')!, findUnit('data', 'MB')!)).toBeCloseTo(1073.741824, 3);
    expect(convertUnit(30, findUnit('fuel', 'mpg_us')!, findUnit('fuel', 'l100km')!)).toBeCloseTo(7.84, 1);
    expect(parseQuantity('12.5 kg')?.unit.id).toBe('kg');
    expect(parseQuantity('3 miles')?.unit.id).toBe('mi');
    expect(formatQuantity(1234.56789)).toBe('1,234.5679');
    expect(cookingToGrams(1, 'cup', 'flour')).toBe(125);
  });
});

describe('dates', () => {
  it('computes differences and business days', () => {
    const d = dateDiff(new Date(2024, 0, 31), new Date(2024, 2, 1));
    expect([d.years, d.months, d.days]).toEqual([0, 1, 1]);
    expect(d.totalDays).toBe(30);
    expect(humanizeDiff(d)).toBe('1 month and 1 day');
    expect(dateDiff(new Date(2024, 4, 6), new Date(2024, 4, 13)).businessDays).toBe(5);
    expect(addBusinessDays(new Date(2024, 4, 3), 1).getDate()).toBe(6); // Fri → Mon
    expect(easterSunday(2024).getMonth()).toBe(2);
    expect(easterSunday(2024).getDate()).toBe(31);
  });
  it('reports ages', () => {
    const r = ageReport(new Date(1990, 5, 15), new Date(2024, 5, 14));
    expect(r.years).toBe(33);
    expect(r.daysUntilBirthday).toBe(1);
    expect(r.zodiac).toBe('Gemini');
    expect(r.generation).toBe('Millennial');
  });
});

describe('finance', () => {
  it('amortises loans', () => {
    expect(monthlyPayment(200000, 6, 360)).toBeCloseTo(1199.1, 1);
    const loan = amortize({ principal: 10000, annualRate: 5, years: 1 });
    expect(loan.months).toBe(12);
    expect(loan.totalInterest).toBeCloseTo(272.9, 0);
    const extra = amortize({ principal: 10000, annualRate: 5, years: 1, extraMonthly: 500 });
    expect(extra.months).toBeLessThan(12);
    expect(extra.interestSavedByExtra).toBeGreaterThan(0);
  });
  it('compounds, tips and taxes', () => {
    const c = compoundInterest({ principal: 1000, annualRate: 12, years: 1, compoundsPerYear: 12, monthlyContribution: 0 });
    expect(c.finalBalance).toBeCloseTo(1126.83, 1);
    expect(savingsGoal(1200, 0, 0, 12)).toBe(100);
    expect(tipSplit(100, 15, 2).perPerson).toBe(57.5);
    expect(vat(120, 20, true).net).toBe(100);
  });
});

describe('random', () => {
  it('stays within bounds and parses dice', () => {
    for (let i = 0; i < 50; i++) {
      const n = randomInt(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
    expect(new Set(randomInts(10, 1, 10, true)).size).toBe(10);
    expect(() => randomInts(11, 1, 10, true)).toThrow();
    const roll = rollDice('2d6+3');
    expect(roll.total).toBeGreaterThanOrEqual(5);
    expect(roll.total).toBeLessThanOrEqual(15);
    expect(rollDice('4d6kh3').rolls[0]?.kept).toHaveLength(3);
    expect(() => rollDice('banana')).toThrow();
    expect(shuffleArray([1, 2, 3]).sort()).toEqual([1, 2, 3]);
    expect(splitTeams(['a', 'b', 'c', 'd', 'e'], 2).map((t) => t.length).sort()).toEqual([2, 3]);
    expect(flipCoins(3)).toHaveLength(3);
    expect(weightedPick([{ value: 'x', weight: 1 }, { value: 'y', weight: 0 }])).toBe('x');
  });
});

describe('exif', () => {
  function jpegWithExif(): Uint8Array {
    // SOI + APP1(Exif, big-endian TIFF with Orientation=6 and Make) + SOF0 + EOI
    const tiff: number[] = [
      0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // header, IFD0 at 8
      0x00, 0x02, // two entries
      0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, // Orientation SHORT 6
      0x01, 0x0f, 0x00, 0x02, 0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x26, // Make ASCII len 5 at offset 38
      0x00, 0x00, 0x00, 0x00, // next IFD
      0x41, 0x63, 0x6d, 0x65, 0x00, // "Acme\0"
    ];
    const app1Body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
    const len = app1Body.length + 2;
    const sof0 = [0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x20, 0x01, 0x01, 0x11, 0x00];
    return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...app1Body, ...sof0, 0xff, 0xd9]);
  }
  it('reads EXIF and strips it losslessly', () => {
    const jpeg = jpegWithExif();
    const toBuffer = (bytes: Uint8Array): ArrayBuffer => {
      const copy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copy).set(bytes);
      return copy;
    };
    const report = readImageMetadata(toBuffer(jpeg));
    expect(report.format).toBe('JPEG');
    expect(report.hasExif).toBe(true);
    expect(report.orientation).toBe(6);
    expect(report.camera).toBe('Acme');
    expect(report.width).toBe(32);
    expect(report.height).toBe(16);
    const stripped = stripJpegMetadata(toBuffer(jpeg));
    expect(stripped.removed).toBeGreaterThan(0);
    const after = readImageMetadata(stripped.bytes.buffer.slice(stripped.bytes.byteOffset, stripped.bytes.byteOffset + stripped.bytes.byteLength) as ArrayBuffer);
    expect(after.hasExif).toBe(false);
    expect(after.width).toBe(32);
    const kept = stripJpegMetadata(toBuffer(jpeg), { keepOrientation: true });
    expect(readImageMetadata(kept.bytes.buffer.slice(0, kept.bytes.byteLength) as ArrayBuffer).orientation).toBe(6);
  });
});
