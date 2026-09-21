import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Check, ChevronDown, Copy, Info, X } from 'lucide-react';
import { useCopy } from '@/hooks';

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  small?: boolean;
}

export function CopyButton({
  value,
  label = 'Copy',
  className = '',
  disabled,
  small,
}: CopyButtonProps): React.ReactElement {
  const { copied, copy } = useCopy();
  const [failed, setFailed] = useState(false);
  const isCopied = copied === 'btn';

  return (
    <button
      type="button"
      className={`btn ${small ? 'btn-sm' : ''} ${className}`}
      disabled={disabled || !value}
      onClick={async () => {
        const ok = await copy(value, 'btn');
        setFailed(!ok);
        if (!ok) setTimeout(() => setFailed(false), 2500);
      }}
      aria-live="polite"
      aria-label={label ? undefined : failed ? 'Press Ctrl+C to copy' : isCopied ? 'Copied' : 'Copy'}
      title={label ? undefined : 'Copy to clipboard'}
    >
      {isCopied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
      {(label || failed || isCopied) && <span>{failed ? 'Press Ctrl+C' : isCopied ? 'Copied' : label}</span>}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Panels & layout                                                            */
/* -------------------------------------------------------------------------- */

interface PanelProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Panel({
  title,
  description,
  actions,
  children,
  className = '',
  bodyClassName = '',
}: PanelProps): React.ReactElement {
  return (
    <section className={`card flex min-w-0 flex-col overflow-hidden ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="truncate text-sm font-semibold">{title}</h2>}
            {description && <p className="muted mt-0.5 text-xs">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={`min-w-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

interface FieldGroupProps {
  label: string;
  children: ReactNode;
  hint?: string;
  htmlFor?: string;
}

export function FieldGroup({ label, children, hint, htmlFor }: FieldGroupProps): React.ReactElement {
  return (
    <div className="min-w-0">
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="muted mt-1 text-xs">{hint}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
}

export function Toggle({ checked, onChange, label, hint, disabled, className = '' }: ToggleProps): React.ReactElement {
  const id = useId();
  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0">
        <label
          htmlFor={id}
          className={`block cursor-pointer text-sm leading-tight select-none ${disabled ? 'opacity-50' : ''}`}
        >
          {label}
        </label>
        {hint && <p className="muted mt-0.5 text-xs leading-snug">{hint}</p>}
      </div>
    </div>
  );
}

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  format?: (value: number) => string;
  hint?: string;
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  format,
  hint,
}: SliderProps): React.ReactElement {
  const id = useId();
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="muted font-mono text-xs tabular-nums">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={format ? format(value) : String(value)}
      />
      {hint && <p className="muted -mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; title?: string }>;
  label?: string;
  size?: 'sm' | 'md';
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
}: SegmentedProps<T>): React.ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="surface-3 inline-flex flex-wrap gap-0.5 rounded-lg border p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title ?? option.label}
            onClick={() => onChange(option.value)}
            className={`rounded-md font-medium transition-colors ${
              size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
            } ${active ? 'shadow-sm' : 'muted hover:opacity-80'}`}
            style={
              active
                ? { background: 'var(--accent)', color: 'var(--accent-contrast)' }
                : undefined
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

type CalloutTone = 'info' | 'success' | 'warning' | 'error';

const TONE_STYLE: Record<CalloutTone, { color: string; icon: typeof Info }> = {
  info: { color: 'var(--accent)', icon: Info },
  success: { color: 'var(--ok)', icon: Check },
  warning: { color: 'var(--warn)', icon: AlertTriangle },
  error: { color: 'var(--danger)', icon: AlertTriangle },
};

interface CalloutProps {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export function Callout({
  tone = 'info',
  title,
  children,
  onDismiss,
  className = '',
}: CalloutProps): React.ReactElement {
  const { color, icon: Icon } = TONE_STYLE[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${className}`}
      style={{
        borderColor: `color-mix(in oklab, ${color} 45%, transparent)`,
        background: `color-mix(in oklab, ${color} 10%, transparent)`,
      }}
    >
      <Icon size={16} className="mt-0.5 shrink-0" style={{ color }} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'muted mt-0.5 text-xs' : ''}>{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="btn-ghost -m-1 shrink-0 rounded p-1 hover:opacity-70"
          aria-label="Dismiss"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}: EmptyStateProps): React.ReactElement {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? 'gap-1.5 p-6' : 'gap-2.5 p-10'}`}
    >
      {icon && <div className="muted opacity-50">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {description && <div className="muted max-w-md text-xs leading-relaxed">{description}</div>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

interface StatProps {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'good' | 'bad';
  title?: string;
}

export function Stat({ label, value, tone = 'default', title }: StatProps): React.ReactElement {
  const color =
    tone === 'good' ? 'var(--ok)' : tone === 'bad' ? 'var(--danger)' : undefined;
  return (
    <div className="min-w-0" title={title}>
      <div className="muted text-[0.65rem] font-semibold tracking-wide uppercase">{label}</div>
      <div className="truncate font-mono text-sm tabular-nums" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Disclosure                                                                 */
/* -------------------------------------------------------------------------- */

interface DisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className = '',
}: DisclosureProps): React.ReactElement {
  return (
    <details className={`group ${className}`} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium select-none">
        <ChevronDown
          size={15}
          className="transition-transform group-open:rotate-0 -rotate-90"
          aria-hidden
        />
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/* -------------------------------------------------------------------------- */
/* Toast                                                                      */
/* -------------------------------------------------------------------------- */

export interface ToastMessage {
  id: number;
  tone: CalloutTone;
  text: string;
}

export function Toasts({
  messages,
  onDismiss,
}: {
  messages: ToastMessage[];
  onDismiss: (id: number) => void;
}): React.ReactElement {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      aria-live="polite"
      aria-atomic="false"
    >
      {messages.map((message) => (
        <div key={message.id} className="pointer-events-auto w-full max-w-md animate-fade-in">
          <Callout tone={message.tone} onDismiss={() => onDismiss(message.id)}>
            {message.text}
          </Callout>
        </div>
      ))}
    </div>
  );
}

export function useToasts(): {
  toasts: ToastMessage[];
  push: (text: string, tone?: CalloutTone) => void;
  dismiss: (id: number) => void;
} {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const counter = useRef(0);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const dismiss = (id: number): void => setToasts((prev) => prev.filter((t) => t.id !== id));

  const push = (text: string, tone: CalloutTone = 'info'): void => {
    const id = ++counter.current;
    setToasts((prev) => [...prev.slice(-2), { id, tone, text }]);
    timers.current.push(setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4000));
  };

  return { toasts, push, dismiss };
}

/* -------------------------------------------------------------------------- */
/* Form fields                                                                */
/* -------------------------------------------------------------------------- */

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  hint?: string;
  className?: string;
  disabled?: boolean;
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  className = '',
  disabled,
}: SelectFieldProps<T>): React.ReactElement {
  const id = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="field" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="muted mt-1 text-xs">{hint}</p>}
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  suffix?: string;
  className?: string;
  disabled?: boolean;
}

export function NumberField({ label, value, onChange, min, max, step, hint, suffix, className = '', disabled }: NumberFieldProps): React.ReactElement {
  const id = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className={`field font-mono tabular-nums ${suffix ? 'pr-12' : ''}`}
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.valueAsNumber;
            onChange(Number.isNaN(next) ? 0 : next);
          }}
        />
        {suffix && (
          <span className="muted pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">{suffix}</span>
        )}
      </div>
      {hint && <p className="muted mt-1 text-xs">{hint}</p>}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  type?: 'text' | 'password' | 'email' | 'url' | 'date' | 'time' | 'datetime-local' | 'search';
  mono?: boolean;
  className?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  spellCheck?: boolean;
  list?: string;
  maxLength?: number;
  disabled?: boolean;
  suffix?: ReactNode;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = 'text',
  mono,
  className = '',
  invalid,
  autoFocus,
  spellCheck = false,
  list,
  maxLength,
  disabled,
  suffix,
}: TextFieldProps): React.ReactElement {
  const id = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={type}
          className={`field ${mono ? 'font-mono' : ''} ${suffix ? 'pr-10' : ''}`}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          spellCheck={spellCheck}
          list={list}
          maxLength={maxLength}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="absolute top-1/2 right-2 -translate-y-1/2">{suffix}</span>}
      </div>
      {hint && <p className={`mt-1 text-xs ${invalid ? '' : 'muted'}`} style={invalid ? { color: 'var(--danger)' } : undefined}>{hint}</p>}
    </div>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  className?: string;
}

/** Native colour picker paired with an editable hex field. */
export function ColorField({ label, value, onChange, className = '' }: ColorFieldProps): React.ReactElement {
  const id = useId();
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input id={id} type="color" value={safe} onChange={(e) => onChange(e.target.value)} />
        <input
          type="text"
          className="field font-mono"
          value={value}
          aria-label={`${label} hex value`}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

interface ProgressBarProps {
  value: number;
  max?: number;
  label: string;
  className?: string;
  tone?: 'accent' | 'ok' | 'warn' | 'danger';
  showValue?: boolean;
}

export function ProgressBar({ value, max = 100, label, className = '', tone = 'accent', showValue }: ProgressBarProps): React.ReactElement {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = tone === 'accent' ? 'var(--accent)' : tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : 'var(--danger)';
  return (
    <div className={className}>
      {showValue && (
        <div className="mb-1 flex items-baseline justify-between text-xs">
          <span className="muted">{label}</span>
          <span className="font-mono tabular-nums">{Math.round(pct)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--surface-3)' }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, color-mix(in oklab, ${color} 70%, white))`, boxShadow: `0 0 12px -2px ${color}` }}
        />
      </div>
    </div>
  );
}

/** Inline busy indicator for async work. */
export function Spinner({ label = 'Working…', className = '' }: { label?: string; className?: string }): React.ReactElement {
  return (
    <span className={`inline-flex items-center gap-2 text-sm ${className}`} role="status">
      <span
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        style={{ color: 'var(--accent)' }}
        aria-hidden
      />
      <span className="muted">{label}</span>
    </span>
  );
}

/** Row of primary/secondary actions with consistent spacing. */
export function ActionBar({ children, className = '' }: { children: ReactNode; className?: string }): React.ReactElement {
  return <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;
}
