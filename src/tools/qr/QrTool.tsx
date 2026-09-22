import { useEffect, useMemo, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Callout, ColorField, NumberField, Panel, Segmented, SelectField, TextField, Toggle } from '@/components/ui';
import { TextOutput } from '@/components/TextIO';
import { QR_CAPACITY, emailPayload, eventPayload, generateQrMatrix, geoPayload, renderQrAscii, renderQrPng, renderQrSvg, smsPayload, vcardPayload, wifiPayload } from '@/lib/qr';
import type { QrEcc, QrMatrix, QrModuleStyle } from '@/lib/qr';
import { downloadBlob, downloadText } from '@/lib/files';
import { svgToDataUri } from '@/lib/svgopt';

type Kind = 'text' | 'url' | 'wifi' | 'vcard' | 'email' | 'sms' | 'geo' | 'event';

export default function QrTool(): React.ReactElement {
  const [kind, setKind] = useState<Kind>('url');
  const [text, setText] = useState('https://example.com');
  const [wifi, setWifi] = useState({ ssid: '', password: '', security: 'WPA' as 'WPA' | 'WEP' | 'nopass', hidden: false });
  const [card, setCard] = useState({ firstName: '', lastName: '', organization: '', title: '', phone: '', email: '', url: '', address: '', note: '' });
  const [mail, setMail] = useState({ to: '', subject: '', body: '' });
  const [sms, setSms] = useState({ phone: '', message: '' });
  const [geo, setGeo] = useState({ latitude: 6.5244, longitude: 3.3792 });
  const [event, setEvent] = useState({ title: '', start: '', end: '', location: '', description: '' });

  const [ecc, setEcc] = useState<QrEcc>('M');
  const [size, setSize] = useState(512);
  const [margin, setMargin] = useState(2);
  const [dark, setDark] = useState('#0b0b0f');
  const [light, setLight] = useState('#ffffff');
  const [transparent, setTransparent] = useState(false);
  const [style, setStyle] = useState<QrModuleStyle>('square');

  const payload = useMemo(() => {
    switch (kind) {
      case 'wifi':
        return wifi.ssid ? wifiPayload(wifi) : '';
      case 'vcard':
        return card.firstName || card.lastName ? vcardPayload(card) : '';
      case 'email':
        return mail.to ? emailPayload(mail) : '';
      case 'sms':
        return sms.phone ? smsPayload(sms) : '';
      case 'geo':
        return geoPayload(geo);
      case 'event':
        return event.title && event.start ? eventPayload(event) : '';
      default:
        return text;
    }
  }, [kind, text, wifi, card, mail, sms, geo, event]);

  const matrix = useMemo<{ m: QrMatrix | null; error: string | null }>(() => {
    if (!payload) return { m: null, error: null };
    try {
      return { m: generateQrMatrix(payload, ecc), error: null };
    } catch (e) {
      return { m: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [payload, ecc]);

  const svg = useMemo(() => (matrix.m ? renderQrSvg(matrix.m, { ecc, size, margin, dark, light, transparent, style }) : ''), [matrix.m, ecc, size, margin, dark, light, transparent, style]);
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!matrix.m) return;
    let cancelled = false;
    let url: string | null = null;
    const m = matrix.m;
    const timer = setTimeout(() => {
      void renderQrPng(m, { ecc, size, margin, dark, light, transparent, style })
        .then((blob) => {
          if (cancelled) return;
          url = URL.createObjectURL(blob);
          setPngUrl(url);
        })
        .catch(() => undefined);
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [matrix.m, ecc, size, margin, dark, light, transparent, style]);

  const bytes = new TextEncoder().encode(payload).length;
  const capacity = QR_CAPACITY[ecc];

  const downloadPng = async (): Promise<void> => {
    if (!matrix.m) return;
    downloadBlob(await renderQrPng(matrix.m, { ecc, size, margin, dark, light, transparent, style }), 'qr-code.png');
  };

  const field = (label: string, value: string, onChange: (v: string) => void, extra: { type?: 'text' | 'url' | 'email' | 'datetime-local'; placeholder?: string } = {}): React.ReactElement => (
    <TextField label={label} value={value} onChange={onChange} placeholder={extra.placeholder} type={extra.type} />
  );

  return (
    <ToolShell slug="qr-generator">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Content">
            <div className="flex flex-col gap-3 p-4">
              <SelectField
                label="Type"
                value={kind}
                onChange={(v) => setKind(v)}
                options={[
                  { value: 'url', label: 'Website URL' },
                  { value: 'text', label: 'Plain text' },
                  { value: 'wifi', label: 'Wi-Fi network' },
                  { value: 'vcard', label: 'Contact card (vCard)' },
                  { value: 'email', label: 'Email' },
                  { value: 'sms', label: 'SMS' },
                  { value: 'geo', label: 'Location' },
                  { value: 'event', label: 'Calendar event' },
                ]}
              />
              {(kind === 'url' || kind === 'text') && (
                <div>
                  <label className="label" htmlFor="qr-text">{kind === 'url' ? 'URL' : 'Text'}</label>
                  <textarea id="qr-text" className="field code-area min-h-24 w-full" value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'url' ? 'https://' : 'Anything…'} />
                </div>
              )}
              {kind === 'wifi' && (
                <>
                  {field('Network name (SSID)', wifi.ssid, (v) => setWifi({ ...wifi, ssid: v }))}
                  {field('Password', wifi.password, (v) => setWifi({ ...wifi, password: v }))}
                  <Segmented label="Security" value={wifi.security} onChange={(v) => setWifi({ ...wifi, security: v })} options={[{ value: 'WPA', label: 'WPA/WPA2/3' }, { value: 'WEP', label: 'WEP' }, { value: 'nopass', label: 'Open' }]} size="sm" />
                  <Toggle checked={wifi.hidden} onChange={(v) => setWifi({ ...wifi, hidden: v })} label="Hidden network" />
                </>
              )}
              {kind === 'vcard' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {field('First name', card.firstName, (v) => setCard({ ...card, firstName: v }))}
                    {field('Last name', card.lastName, (v) => setCard({ ...card, lastName: v }))}
                  </div>
                  {field('Organisation', card.organization, (v) => setCard({ ...card, organization: v }))}
                  {field('Job title', card.title, (v) => setCard({ ...card, title: v }))}
                  {field('Phone', card.phone, (v) => setCard({ ...card, phone: v }))}
                  {field('Email', card.email, (v) => setCard({ ...card, email: v }), { type: 'email' })}
                  {field('Website', card.url, (v) => setCard({ ...card, url: v }), { type: 'url' })}
                  {field('Address', card.address, (v) => setCard({ ...card, address: v }))}
                </>
              )}
              {kind === 'email' && (
                <>
                  {field('To', mail.to, (v) => setMail({ ...mail, to: v }), { type: 'email' })}
                  {field('Subject', mail.subject, (v) => setMail({ ...mail, subject: v }))}
                  {field('Body', mail.body, (v) => setMail({ ...mail, body: v }))}
                </>
              )}
              {kind === 'sms' && (
                <>
                  {field('Phone number', sms.phone, (v) => setSms({ ...sms, phone: v }), { placeholder: '+2348012345678' })}
                  {field('Message', sms.message, (v) => setSms({ ...sms, message: v }))}
                </>
              )}
              {kind === 'geo' && (
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Latitude" value={geo.latitude} onChange={(v) => setGeo({ ...geo, latitude: v })} min={-90} max={90} step={0.0001} />
                  <NumberField label="Longitude" value={geo.longitude} onChange={(v) => setGeo({ ...geo, longitude: v })} min={-180} max={180} step={0.0001} />
                </div>
              )}
              {kind === 'event' && (
                <>
                  {field('Title', event.title, (v) => setEvent({ ...event, title: v }))}
                  {field('Starts', event.start, (v) => setEvent({ ...event, start: v }), { type: 'datetime-local' })}
                  {field('Ends', event.end, (v) => setEvent({ ...event, end: v }), { type: 'datetime-local' })}
                  {field('Location', event.location, (v) => setEvent({ ...event, location: v }))}
                  {field('Description', event.description, (v) => setEvent({ ...event, description: v }))}
                </>
              )}
              <p className="muted text-xs">
                {bytes} bytes · capacity at level {ecc}: {capacity.toLocaleString()} {bytes > capacity && <strong style={{ color: 'var(--danger)' }}> — too long</strong>}
              </p>
            </div>
          </Panel>
          <Panel title="Style">
            <div className="flex flex-col gap-3 p-4">
              <Segmented label="Error correction" value={ecc} onChange={setEcc} options={[{ value: 'L', label: 'L 7%' }, { value: 'M', label: 'M 15%' }, { value: 'Q', label: 'Q 25%' }, { value: 'H', label: 'H 30%' }]} size="sm" />
              <Segmented label="Modules" value={style} onChange={setStyle} options={[{ value: 'square', label: 'Square' }, { value: 'rounded', label: 'Rounded' }, { value: 'dots', label: 'Dots' }]} size="sm" />
              <div className="grid grid-cols-2 gap-2">
                <ColorField label="Dark" value={dark} onChange={setDark} />
                <ColorField label="Light" value={light} onChange={setLight} />
              </div>
              <Toggle checked={transparent} onChange={setTransparent} label="Transparent background" />
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Size (px)" value={size} onChange={setSize} min={64} max={4096} step={32} />
                <NumberField label="Quiet zone (modules)" value={margin} onChange={setMargin} min={0} max={10} />
              </div>
            </div>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          {matrix.error && <Callout tone="error">{matrix.error}</Callout>}
          <div className="checker flex min-h-72 items-center justify-center rounded-2xl border p-6">
            {svg ? <img src={svgToDataUri(svg)} alt={`QR code for ${kind}`} className="max-h-96 w-full max-w-96" width={size} height={size} /> : <p className="muted text-sm">Fill in the content to generate a code.</p>}
          </div>
          {matrix.m && (
            <>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={() => void downloadPng()}>
                  Download PNG
                </button>
                <button type="button" className="btn" onClick={() => downloadText(svg, 'qr-code.svg', 'image/svg+xml')}>
                  Download SVG
                </button>
                {pngUrl && (
                  <a className="btn" href={pngUrl} download="qr-code.png">
                    Open PNG
                  </a>
                )}
                <span className="muted self-center text-xs">Version {matrix.m.version} · {matrix.m.size}×{matrix.m.size} modules</span>
              </div>
              <TextOutput value={payload} label="Encoded payload" rows={4} wrap />
              <details className="card">
                <summary className="cursor-pointer px-4 py-2 text-sm font-medium">ASCII version (for terminals)</summary>
                <pre className="overflow-auto px-4 pb-4 font-mono text-[0.55rem] leading-[0.6rem]">{renderQrAscii(matrix.m)}</pre>
              </details>
            </>
          )}
        </div>
      </div>
    </ToolShell>
  );
}
