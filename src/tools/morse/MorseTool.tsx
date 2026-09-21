import { useMemo, useRef, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { NumberField, Segmented } from '@/components/ui';
import { OptionsBar, TextInput, TextOutput, Workspace } from '@/components/TextIO';
import { morseToText, textToMorse } from '@/lib/encoding';
import { useLocalStorage } from '@/hooks';

type Mode = 'encode' | 'decode';

export default function MorseTool(): React.ReactElement {
  const [mode, setMode] = useState<Mode>('encode');
  const [input, setInput] = useState('');
  const [wpm, setWpm] = useLocalStorage('morse:wpm', 18);
  const [tone, setTone] = useLocalStorage('morse:tone', 640);
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);

  const output = useMemo(() => (mode === 'encode' ? textToMorse(input) : morseToText(input)), [mode, input]);
  const morse = mode === 'encode' ? output : input;

  const stop = (): void => {
    void ctxRef.current?.close();
    ctxRef.current = null;
    setPlaying(false);
  };

  const play = (): void => {
    stop();
    const Ctx = window.AudioContext;
    if (!Ctx || !morse.trim()) return;
    const ctx = new Ctx();
    ctxRef.current = ctx;
    const unit = 1.2 / Math.max(5, Math.min(60, wpm)); // PARIS timing
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = Math.max(200, Math.min(1500, tone));
    gain.gain.value = 0;
    osc.connect(gain).connect(ctx.destination);
    let t = ctx.currentTime + 0.05;
    for (const ch of morse) {
      if (ch === '.' || ch === '-') {
        const len = ch === '.' ? unit : unit * 3;
        gain.gain.setTargetAtTime(0.5, t, 0.004);
        gain.gain.setTargetAtTime(0, t + len - 0.004, 0.004);
        t += len + unit;
      } else if (ch === ' ') t += unit * 2;
      else if (ch === '/') t += unit * 4;
    }
    osc.start();
    osc.stop(t + 0.1);
    setPlaying(true);
    osc.onended = () => {
      if (ctxRef.current === ctx) {
        void ctx.close();
        ctxRef.current = null;
        setPlaying(false);
      }
    };
  };

  return (
    <ToolShell slug="morse-binary">
      <OptionsBar>
        <Segmented label="Direction" value={mode} onChange={(m) => { setMode(m); setInput(output); }} options={[{ value: 'encode', label: 'Text → Morse' }, { value: 'decode', label: 'Morse → Text' }]} />
        <NumberField label="Speed (WPM)" value={wpm} onChange={setWpm} min={5} max={60} className="w-32" />
        <NumberField label="Tone (Hz)" value={tone} onChange={setTone} min={200} max={1500} step={10} className="w-32" />
        <button type="button" className="btn btn-primary btn-sm" onClick={playing ? stop : play} disabled={!morse.trim()}>
          {playing ? 'Stop' : 'Play audio'}
        </button>
      </OptionsBar>
      <Workspace>
        <TextInput value={input} onChange={setInput} label={mode === 'encode' ? 'Text' : 'Morse code'} placeholder={mode === 'encode' ? 'SOS we have run out of coffee' : '... --- ... / .-- . / .... .- ...- .'} sample={mode === 'encode' ? 'The quick brown fox jumps over the lazy dog. CQ CQ DE W1AW' : '- .... . / --.- ..- .. -.-. -.- / -... .-. --- .-- -. / ..-. --- -..- / .--- ..- -- .--. ...'} rows={12} fill autoFocus />
        <TextOutput value={output} label={mode === 'encode' ? 'Morse code' : 'Text'} filename={mode === 'encode' ? 'morse.txt' : 'decoded.txt'} rows={12} fill wrap />
      </Workspace>
      <p className="muted mt-3 text-xs">
        Letters are separated by a single space, words by <code className="font-mono">/</code>. Unknown symbols decode as <code className="font-mono">?</code>. Audio uses standard PARIS timing.
      </p>
    </ToolShell>
  );
}
