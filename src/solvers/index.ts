// ── Single flow reactors ──────────────────────────────────────────────────────
export { sizeCSTR, conversionInCSTR } from './cstr';
export { sizePFR, conversionInPFR } from './pfr';

// ── Batch Reactor ─────────────────────────────────────────────────────────────
export { sizeBatch, conversionInBatch } from './batch';

// ── Packed Bed Reactor (PBR) ──────────────────────────────────────────────────
export { sizePBR, conversionInPBR } from './pbr';

// ── Equal-volume series networks ──────────────────────────────────────────────
export { sizeCSTRSeries, conversionInCSTRSeries } from './cstr_series';
export { sizePFRSeries, conversionInPFRSeries } from './pfr_series';

// ── Unequal-volume CSTR series ────────────────────────────────────────────────
export { sizeCSTRUnequal, conversionInCSTRUnequal } from './cstr_unequal';

// ── Mixed CSTR + PFR network (series only) ───────────────────────────────────
export { sizeMixedReactors, conversionInMixedReactors } from './mixed';

// ── General network (series + parallel) ──────────────────────────────────────
export { sizeNetwork, conversionInNetwork } from './network';

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  // PFR / CSTR
  SolverInput, SizingInput, ConversionInput,
  SizingResult, ConversionResult, ProfilePoint,
  // Batch
  BatchSizingInput, BatchConversionInput,
  BatchSizingResult, BatchConversionResult, BatchProfilePoint,
  // PBR
  PBRSizingInput, PBRConversionInput,
  PBRSizingResult, PBRConversionResult, PBRProfilePoint,
  // Equal-volume CSTR series
  CSTRSeriesSizingInput, CSTRSeriesConversionInput,
  CSTRSeriesSizingResult, CSTRSeriesConversionResult,
  // PFR series
  PFRSeriesSizingInput, PFRSeriesConversionInput,
  PFRSeriesSizingResult, PFRSeriesConversionResult,
  // Unequal CSTR series
  CSTRUnequalSizingInput, CSTRUnequalConversionInput,
  CSTRUnequalSizingResult, CSTRUnequalConversionResult,
  // Mixed series network
  MixedSizingInput, MixedConversionInput,
  MixedSizingResult, MixedConversionResult,
  ReactorUnit, ReactorUnitType,
  // General network (series + parallel)
  NetworkStage, NetworkReactor, NetworkParallelBlock,
  NetworkStageResult, NetworkReactorResult, NetworkParallelResult,
  NetworkSizingInput, NetworkConversionInput, NetworkResult,
} from './types';
