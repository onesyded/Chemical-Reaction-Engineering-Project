import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, ShieldCheck, AlertTriangle, RotateCcw, Activity, Loader2, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import katex from 'katex';
import { ChatMessage, ReactorState } from './types';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// Palette (control-room dark)
const EM = '#34D399';
const CORAL = '#FB7185';

// -------------------------------------------------------------
// Formatting
// -------------------------------------------------------------

function fmt(n?: number): string {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return n.toExponential(2);
  return Number(n.toPrecision(4)).toString();
}

// Residence (space) time τ = V / v0, with volumetric feed v0 = F_A0 / C_A0.
function residenceTime(s: ReactorState): number | undefined {
  if (s.volume == null || s.C_A0 == null || !s.F_A0) return undefined;
  return (s.volume * s.C_A0) / s.F_A0;
}

// The design equation actually applied, in general (any-order) Levenspiel form.
function designEquation(s: ReactorState): string {
  const rate = '\\;\\; -r_A = k\\,C_{A0}^{\\,n}(1-X)^n';
  return s.type === 'CSTR'
    ? `V = \\dfrac{F_{A0}\\,X}{-r_A}${rate}`
    : `V = F_{A0}\\!\\int_0^{X}\\!\\dfrac{dX}{-r_A}${rate}`;
}

function MathInline({ tex }: { tex: string }) {
  const html = katex.renderToString(tex, { throwOnError: false, displayMode: false });
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// -------------------------------------------------------------
// Telemetry readout cell
// -------------------------------------------------------------

function Readout({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#7E938B]">
        {label}
      </span>
      <span
        className={cn(
          'font-mono text-[22px] leading-none tabular-nums',
          accent ? 'text-[#34D399] glow-text' : 'text-[#E6EFEB]'
        )}
      >
        {value}
        {unit && <span className="ml-1 text-[11px] text-[#7E938B]">{unit}</span>}
      </span>
    </div>
  );
}

// -------------------------------------------------------------
// Verified pill
// -------------------------------------------------------------

function VerifiedPill({ state }: { state: ReactorState }) {
  const isOk = !!state.ok;
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] tracking-wide',
        isOk
          ? 'border-[#34D399]/30 bg-[#34D399]/10 text-[#6EE7B7]'
          : 'border-[#FBBF24]/30 bg-[#FBBF24]/10 text-[#FCD34D]'
      )}
    >
      {isOk ? (
        <>
          <ShieldCheck className="h-3.5 w-3.5" />
          VERIFIED · 0 ≤ X ≤ 1 · V &gt; 0
        </>
      ) : (
        <>
          <AlertTriangle className="h-3.5 w-3.5" />
          CHECK FAILED
        </>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Reactor schematics
// -------------------------------------------------------------

const glowFilter = (
  <filter id="reactor-glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="3.5" result="b" />
    <feMerge>
      <feMergeNode in="b" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
);

function PFRSchematic({ conversion = 0 }: { conversion?: number }) {
  // Bright end of the gradient tracks how far conversion has progressed.
  const brightStop = `${Math.max(8, Math.min(100, conversion * 100)).toFixed(0)}%`;
  return (
    <svg viewBox="0 0 420 150" width="100%" height="100%" className="overflow-visible">
      <defs>
        {glowFilter}
        <linearGradient id="pfr-fill" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0E3B30" />
          <stop offset={brightStop} stopColor="#34D399" />
          <stop offset="100%" stopColor="#A7F3D0" />
        </linearGradient>
        <clipPath id="pfr-clip">
          <rect x="34" y="52" width="352" height="46" rx="23" />
        </clipPath>
      </defs>

      {/* inlet / outlet stubs */}
      <rect x="12" y="68" width="26" height="14" rx="3" fill="#16201D" stroke="#2C3A35" strokeWidth="1.5" />
      <rect x="382" y="68" width="26" height="14" rx="3" fill="#16201D" stroke="#2C3A35" strokeWidth="1.5" />

      {/* tube body */}
      <g clipPath="url(#pfr-clip)">
        <rect x="34" y="52" width="352" height="46" fill="url(#pfr-fill)" />
        {/* flowing reactant particles */}
        {[0, 0.5, 1, 1.5].map((delay, i) => (
          <circle key={i} cx="34" cy="75" r="3.4" fill={CORAL} opacity="0.9">
            <animate attributeName="cx" from="34" to="386" dur="2.4s" begin={`${delay}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;0.95;0.95;0" dur="2.4s" begin={`${delay}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
      <rect
        x="34" y="52" width="352" height="46" rx="23"
        fill="none" stroke={EM} strokeWidth="1.6" opacity="0.65"
        filter="url(#reactor-glow)"
      />

      {/* labels */}
      <text x="14" y="104" className="font-mono" fontSize="10" fill="#7E938B">A in</text>
      <text x="372" y="104" className="font-mono" fontSize="10" fill="#7E938B">B out</text>
      <text x="210" y="34" textAnchor="middle" className="font-mono" fontSize="11" fill="#6EE7B7" letterSpacing="2">
        PLUG FLOW
      </text>
    </svg>
  );
}

function CSTRSchematic({ conversion = 0 }: { conversion?: number }) {
  const fillOpacity = (0.18 + conversion * 0.6).toFixed(2);
  return (
    <svg viewBox="0 0 300 150" width="100%" height="100%" className="overflow-visible">
      <defs>
        {glowFilter}
        <linearGradient id="cstr-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#0E3B30" />
        </linearGradient>
      </defs>

      {/* inlet pipe (top-left) */}
      <path d="M40 18 H96 V40" fill="none" stroke="#2C3A35" strokeWidth="3" />
      <circle cx="40" cy="18" r="3" fill={CORAL} opacity="0.9">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1.6s" repeatCount="indefinite" />
      </circle>
      {/* outlet pipe (bottom-right) */}
      <path d="M204 120 H260 V134" fill="none" stroke="#2C3A35" strokeWidth="3" />

      {/* vessel */}
      <rect x="96" y="34" width="108" height="92" rx="16" fill="url(#cstr-fill)" fillOpacity={fillOpacity} />
      <rect
        x="96" y="34" width="108" height="92" rx="16"
        fill="none" stroke={EM} strokeWidth="1.8" opacity="0.7" filter="url(#reactor-glow)"
      />
      {/* liquid surface line */}
      <line x1="100" y1="50" x2="200" y2="50" stroke={EM} strokeWidth="1" opacity="0.35" />

      {/* stirrer shaft + impeller */}
      <rect x="148" y="22" width="4" height="66" rx="2" fill="#5C6B66" />
      <g transform="translate(150, 92)">
        <g>
          <rect x="-26" y="-3" width="52" height="6" rx="3" fill="#9FB0AA" />
          <rect x="-3" y="-26" width="6" height="52" rx="3" fill="#9FB0AA" opacity="0.5" />
          <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="1.4s" repeatCount="indefinite" />
        </g>
      </g>

      {/* rising bubbles for the well-mixed feel */}
      {[120, 150, 178].map((x, i) => (
        <circle key={i} cx={x} cy="116" r="2.2" fill="#A7F3D0" opacity="0.6">
          <animate attributeName="cy" values="116;58" dur={`${2 + i * 0.4}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.7;0" dur={`${2 + i * 0.4}s`} repeatCount="indefinite" />
        </circle>
      ))}

      <text x="150" y="146" textAnchor="middle" className="font-mono" fontSize="11" fill="#6EE7B7" letterSpacing="2">
        WELL MIXED
      </text>
    </svg>
  );
}

// -------------------------------------------------------------
// Reactor stage (schematic + glow + empty state)
// -------------------------------------------------------------

function ReactorStage({ state }: { state: ReactorState | null }) {
  if (!state || !state.type) {
    return (
      <div className="relative flex h-[260px] items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.012]">
        <div className="max-w-xs text-center">
          <Activity className="mx-auto mb-3 h-6 w-6 text-[#34D399]/50" />
          <p className="text-sm text-[#7E938B]">
            Describe a reactor problem in the conversation panel. The reactor, its numbers, and the
            conversion curve will materialise here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-[260px] items-center justify-center overflow-hidden rounded-2xl bg-[radial-gradient(460px_240px_at_50%_35%,rgba(52,211,153,0.11),transparent_70%)]">
      <div className="absolute left-4 top-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[#7E938B]">
        {state.type === 'PFR' ? 'Tubular reactor' : 'Stirred tank'}
      </div>
      <div className={cn('px-6', state.type === 'PFR' ? 'w-full max-w-xl' : 'w-44')}>
        {state.type === 'PFR' ? (
          <PFRSchematic conversion={state.conversion} />
        ) : (
          <CSTRSchematic conversion={state.conversion} />
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Conversion plot
// -------------------------------------------------------------

function ConversionPlot({ state }: { state: ReactorState }) {
  const data = state.profile && state.profile.length > 1 ? state.profile : null;

  return (
    <div className="mt-5 flex h-60 w-full flex-col rounded-2xl bg-white/[0.02] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#7E938B]">
          Conversion vs Volume
        </h3>
        {state.type === 'CSTR' && (
          <span className="font-mono text-[10px] text-[#7E938B]/70">design sweep · operating point in coral</span>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {data ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 12, left: -8, bottom: 2 }}>
              <defs>
                <linearGradient id="conv-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={EM} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={EM} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(120,200,170,0.12)" />
              <XAxis
                dataKey="volume"
                type="number"
                domain={[0, 'dataMax']}
                tick={{ fontSize: 11, fill: '#7E938B', fontFamily: 'DM Mono' }}
                tickFormatter={(v) => fmt(v)}
                tickLine={false}
                axisLine={{ stroke: 'rgba(120,200,170,0.15)' }}
                label={{ value: 'V (m³)', position: 'insideBottomRight', offset: -2, fill: '#7E938B', fontSize: 10 }}
              />
              <YAxis
                dataKey="conversion"
                type="number"
                domain={[0, 1]}
                tick={{ fontSize: 11, fill: '#7E938B', fontFamily: 'DM Mono' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: '#0C1312',
                  border: '1px solid rgba(52,211,153,0.25)',
                  borderRadius: 8,
                  fontFamily: 'DM Mono',
                  fontSize: 12,
                  color: '#E6EFEB',
                }}
                labelStyle={{ color: '#7E938B' }}
                labelFormatter={(v) => `V = ${fmt(Number(v))} m³`}
                formatter={(v: number) => [fmt(v), 'X']}
              />
              <Area
                type="monotone"
                dataKey="conversion"
                stroke={EM}
                strokeWidth={2.5}
                fill="url(#conv-fill)"
                dot={false}
                activeDot={{ r: 4, fill: EM, stroke: '#0C1312', strokeWidth: 2 }}
                isAnimationActive
              />
              {state.volume != null && state.conversion != null && (
                <>
                  <ReferenceDot x={state.volume} y={state.conversion} r={9} fill={CORAL} fillOpacity={0.2} stroke="none" />
                  <ReferenceDot x={state.volume} y={state.conversion} r={4.5} fill={CORAL} stroke="#0C1312" strokeWidth={2} />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-center font-mono text-xs text-[#7E938B]/70">
            {state.error ? 'No curve — inputs were rejected (see status above).' : 'Plot will appear here.'}
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Live agent trace ("thinking")
// -------------------------------------------------------------

export interface TraceStep {
  id: string;
  label?: string;
  detail?: string;
  status: 'active' | 'done';
  ok?: boolean;
  warn?: boolean;
}

function StepIcon({ step }: { step: TraceStep }) {
  if (step.status === 'active') return <Loader2 className="h-4 w-4 animate-spin text-[#34D399]" />;
  if (step.warn) return <AlertTriangle className="h-4 w-4 text-[#FBBF24]" />;
  if (step.ok) return <ShieldCheck className="h-4 w-4 text-[#34D399]" />;
  return <Check className="h-4 w-4 text-[#34D399]" />;
}

function ThinkingPanel({ trace }: { trace: TraceStep[] }) {
  return (
    <div className="flex min-h-[260px] flex-col rounded-2xl border border-[#34D399]/10 bg-[radial-gradient(560px_260px_at_50%_0%,rgba(52,211,153,0.09),transparent_70%)] p-6">
      <div className="mb-5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#6EE7B7]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Agent working
      </div>
      <ol className="space-y-3.5">
        {trace.map((step) => (
          <li key={step.id} className="flex animate-rise items-start gap-3">
            <span className="mt-0.5 flex-none">
              <StepIcon step={step} />
            </span>
            <div className="min-w-0">
              <div className={cn('text-sm leading-snug', step.warn ? 'text-[#FCD34D]' : 'text-[#E6EFEB]')}>
                {step.label}
              </div>
              {step.detail && (
                <div className="mt-1 font-mono text-[11px] leading-relaxed text-[#7E938B]">{step.detail}</div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// -------------------------------------------------------------
// Visualization panel
// -------------------------------------------------------------

function VizPanel({
  state,
  thinking,
  trace,
  className,
}: {
  state: ReactorState | null;
  thinking: boolean;
  trace: TraceStep[];
  className?: string;
}) {
  return (
    <section className={cn('min-h-0 flex-col overflow-hidden rounded-3xl border border-white/[0.05] bg-gradient-to-b from-white/[0.035] to-white/[0.004] shadow-[0_24px_70px_-45px_rgba(0,0,0,0.85)] backdrop-blur-xl', className)}>
      <div className="flex flex-none items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
        <h2 className="font-display text-sm font-bold tracking-tight text-[#E6EFEB]">
          {thinking ? 'Agent' : 'Reactor'}
          {!thinking && state?.type ? <span className="text-[#34D399]"> · {state.type}</span> : null}
        </h2>
        {!thinking && state?.type && <VerifiedPill state={state} />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div key={thinking ? 'thinking' : 'result'} className="animate-fade-in">
        {thinking ? (
          <ThinkingPanel trace={trace} />
        ) : (
          <>
            <ReactorStage state={state} />

            {state?.type && (
              <>
                {state.error && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#FBBF24]/25 bg-[#FBBF24]/10 px-3 py-2.5 text-sm text-[#FCD34D]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                    <span>{state.error}</span>
                  </div>
                )}

                <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 rounded-2xl bg-white/[0.02] px-6 py-5 sm:grid-cols-3">
                  <Readout label="Volume" value={fmt(state.volume)} unit="m³" accent />
                  <Readout label="Conversion" value={fmt(state.conversion)} accent />
                  <Readout label="Residence τ" value={fmt(residenceTime(state))} unit="s" />
                  <Readout label="Rate const k" value={fmt(state.k)} />
                  <Readout label="Feed F_A0" value={fmt(state.F_A0)} unit="mol/s" />
                  <Readout label="Conc C_A0" value={fmt(state.C_A0)} unit="mol/m³" />
                </div>

                <div className="mt-6 border-t border-white/[0.05] pt-5">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#7E938B]">
                    Model &amp; assumptions
                  </div>
                  <p className="mb-3 text-sm text-[#B7C7C1]">
                    Isothermal · {state.order === 1 ? 'first-order' : `${fmt(state.order)}-order`} in A · A → B ·
                    constant density
                  </p>
                  <div className="overflow-x-auto text-[15px] text-[#E6EFEB]">
                    <MathInline tex={designEquation(state)} />
                  </div>
                </div>

                <ConversionPlot state={state} />
              </>
            )}
          </>
        )}
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------
// Conversation panel
// -------------------------------------------------------------

const EXAMPLES = [
  'Size a PFR to convert 90% of A → B, with k = 0.5 /s, F_A0 = 1 mol/s, C_A0 = 2000 mol/m³',
  'What conversion does a 0.05 m³ CSTR reach for k = 0.5, F_A0 = 1, C_A0 = 2000?',
];

function ChatPanel({
  messages,
  isLoading,
  streamingText,
  input,
  setInput,
  onSubmit,
  onReset,
  className,
}: {
  messages: ChatMessage[];
  isLoading: boolean;
  streamingText: string;
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onReset: () => void;
  className?: string;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, streamingText]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as any);
    }
  };

  return (
    <section className={cn('min-h-0 flex-col overflow-hidden rounded-3xl border border-white/[0.05] bg-gradient-to-b from-white/[0.035] to-white/[0.004] shadow-[0_24px_70px_-45px_rgba(0,0,0,0.85)] backdrop-blur-xl', className)}>
      <div className="flex flex-none items-center justify-between border-b border-white/[0.06] px-4 py-3.5">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#7E938B]">
          Conversation
        </h2>
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-[#7E938B] transition-colors hover:bg-white/5 hover:text-[#E6EFEB]"
          title="Start a new session"
        >
          <RotateCcw className="h-3 w-3" />
          New
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mt-6 space-y-4">
            <p className="text-center text-sm text-[#7E938B]">
              Ask me to size a PFR or CSTR, or to find the conversion in a reactor you describe.
            </p>
            <div className="space-y-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setInput(ex)}
                  className="block w-full rounded-xl bg-white/[0.03] px-4 py-3 text-left text-[13px] leading-snug text-[#B7C7C1] transition-colors hover:bg-[#34D399]/[0.08] hover:text-[#E6EFEB]"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={cn('flex animate-rise', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[88%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed',
                msg.role === 'user'
                  ? 'rounded-br-md bg-[#34D399]/[0.13] text-[#E6EFEB]'
                  : 'rounded-bl-md bg-white/[0.045] text-[#D6E2DD]'
              )}
            >
              {msg.role === 'model' ? (
                <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-headings:text-[#E6EFEB] prose-strong:text-[#A7F3D0] prose-a:text-[#34D399] prose-code:text-[#A7F3D0]">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              )}
            </div>
          </div>
        ))}

        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-white/[0.045] px-4 py-3 text-[14px] leading-relaxed text-[#D6E2DD]">
              <span className="whitespace-pre-wrap">{streamingText}</span>
              <span className="ml-0.5 inline-block h-3.5 w-[3px] translate-y-0.5 animate-pulse bg-[#34D399] align-middle" />
            </div>
          </div>
        )}

        {isLoading && !streamingText && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-white/[0.045] px-4 py-3 font-mono text-[11px] tracking-wide text-[#7E938B]">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#34D399]" />
              thinking…
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={onSubmit} className="flex-none border-t border-white/[0.06] p-3">
        <div className="relative flex items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your reactor problem…"
            className="max-h-[200px] min-h-[46px] w-full resize-none rounded-xl border border-white/[0.07] bg-white/[0.03] py-3 pl-4 pr-12 text-[14px] text-[#E6EFEB] placeholder-[#7E938B]/70 transition-all focus:border-[#34D399]/40 focus:outline-none focus:ring-2 focus:ring-[#34D399]/15"
            disabled={isLoading}
            rows={1}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute bottom-1.5 right-1.5 rounded-lg bg-[#10B981] p-2 text-[#04221A] transition-colors hover:bg-[#34D399] disabled:opacity-40 disabled:hover:bg-[#10B981]"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </section>
  );
}

// -------------------------------------------------------------
// App
// -------------------------------------------------------------

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactorState, setReactorState] = useState<ReactorState | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => Math.random().toString(36).substring(2, 10));
  // Live agent trace + streaming answer (driven by the SSE endpoint).
  const [agentTrace, setAgentTrace] = useState<TraceStep[]>([]);
  const [streamingText, setStreamingText] = useState('');
  // True once the reactor result has arrived mid-stream, so the viz shows the
  // reactor while the explanation is still streaming into the chat.
  const [reactorBuilt, setReactorBuilt] = useState(false);
  // On phones we show one panel at a time via a tab switch (both show side-by-side on lg+).
  const [mobileTab, setMobileTab] = useState<'reactor' | 'chat'>('chat');

  const handleReset = () => {
    setMessages([]);
    setReactorState(null);
    setInput('');
    setAgentTrace([]);
    setStreamingText('');
    setReactorBuilt(false);
    setSessionId(Math.random().toString(36).substring(2, 10));
    setMobileTab('chat');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { id: Math.random().toString(), role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setAgentTrace([]);
    setStreamingText('');
    setReactorBuilt(false);
    setMobileTab('reactor'); // watch the live trace in the viz layer

    // Apply one server event to local state.
    const apply = (evt: any) => {
      if (evt.type === 'stage') {
        setAgentTrace((prev) => {
          const i = prev.findIndex((s) => s.id === evt.id);
          if (i >= 0) {
            const next = [...prev];
            next[i] = { ...next[i], ...evt, status: evt.status ?? next[i].status };
            return next;
          }
          return [
            ...prev,
            { id: evt.id, label: evt.label, detail: evt.detail, status: evt.status ?? 'active', ok: evt.ok, warn: evt.warn },
          ];
        });
      } else if (evt.type === 'delta') {
        setStreamingText((prev) => prev + evt.text);
      } else if (evt.type === 'reactor') {
        if (evt.reactorState) {
          setReactorState(evt.reactorState);
          setReactorBuilt(true); // morph viz to the reactor before the words arrive
        }
      } else if (evt.type === 'result') {
        if (evt.reactorState) setReactorState(evt.reactorState);
        setMessages(
          (evt.history || []).map((m: any) => ({
            id: m.id || Math.random().toString(),
            role: m.role as 'user' | 'model',
            content: m.content,
          }))
        );
        setStreamingText('');
      } else if (evt.type === 'error') {
        setMessages((prev) => [...prev, { id: Math.random().toString(), role: 'model', content: evt.message }]);
      }
    };

    try {
      const resp = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: userMsg.content }),
      });
      if (!resp.ok || !resp.body) throw new Error('stream failed');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          try {
            apply(JSON.parse(line.slice(5).trim()));
          } catch {
            /* ignore malformed chunk */
          }
        }
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        { id: Math.random().toString(), role: 'model', content: 'Sorry, the connection dropped. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
      setAgentTrace([]);
      setStreamingText('');
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden text-[#E6EFEB]">
      {/* Top bar */}
      <header className="flex flex-none items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 animate-pulse-dot rounded-full bg-[#34D399]" />
          <h1 className="font-display text-[15px] font-extrabold tracking-tight text-[#E6EFEB]">
            REACTOR <span className="text-[#34D399]">COPILOT</span>
          </h1>
          <span className="hidden h-3 w-px bg-white/15 sm:block" />
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-[#7E938B] sm:block">
            Modelling Club · KNUST
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
          <span className="font-mono text-[10px] uppercase tracking-wide text-[#7E938B]">
            v1 · isothermal A → B
          </span>
        </div>
      </header>

      {/* Mobile tab switch (hidden on lg, where both panels show together) */}
      <div className="mx-auto w-full max-w-[1440px] flex-none px-3 pt-3 md:px-5 lg:hidden">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.03] p-1">
          {(['chat', 'reactor'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={cn(
                'rounded-lg py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors',
                mobileTab === tab ? 'bg-[#34D399]/15 text-[#6EE7B7]' : 'text-[#7E938B] hover:text-[#E6EFEB]'
              )}
            >
              {tab === 'chat' ? 'Conversation' : `Reactor${reactorState?.type ? ` · ${reactorState.type}` : ''}`}
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <main className="mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-cols-1 gap-4 overflow-hidden p-3 md:p-5 lg:grid-cols-[1.55fr_1fr] lg:gap-5">
        <VizPanel
          state={reactorState}
          thinking={isLoading && !reactorBuilt}
          trace={agentTrace}
          className={cn(mobileTab === 'reactor' ? 'flex' : 'hidden', 'lg:flex')}
        />
        <ChatPanel
          className={cn(mobileTab === 'chat' ? 'flex' : 'hidden', 'lg:flex')}
          messages={messages}
          isLoading={isLoading}
          streamingText={streamingText}
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          onReset={handleReset}
        />
      </main>
    </div>
  );
}
