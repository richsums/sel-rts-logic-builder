/**
 * @module demo-data
 * Pre-built relay instances covering all 8 supported models.
 * Each instance is a full ParsedRelaySettings with rich SELogic equations
 * exercising AND, OR, NOT, ^(edge), latches (SV), timers, blocking, and
 * comms-assisted (POTT/PUTT) operators.
 */

import type { ParsedRelaySettings, LogicEquation, SettingGroup, SourceRef, LogicFunctionType } from '../relay-adapters/common/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ref(file: string, line: number, raw: string): SourceRef {
  return { sourceFile: file, lineNumber: line, rawText: raw };
}

function eq(
  label: string,
  expression: string,
  description: string,
  fnType: LogicFunctionType,
  file: string,
  line: number,
): LogicEquation {
  return { label, expression, description, functionType: fnType, source: ref(file, line, `${label}=${expression}`) };
}

function grp(name: string, entries: Array<{ k: string; v: string; l: number }>, file: string, headerLine: number): SettingGroup {
  return {
    name,
    source: ref(file, headerLine, `[${name}]`),
    entries: entries.map(e => ({ key: e.k, value: e.v, source: ref(file, e.l, `${e.k}=${e.v}`) })),
  };
}

function settings(model: ParsedRelaySettings['model'], tag: string, fw: string,
  groups: SettingGroup[], equations: LogicEquation[], file: string, lines: number): ParsedRelaySettings {
  return { model, tag, firmware: fw, settingGroups: groups, logicEquations: equations, rawLines: [], sourceFile: file, lineCount: lines };
}

// ─── SEL-351 FDR01 (enhanced) ─────────────────────────────────────────────────

const F = 'SEL351_FDR01.txt';
export const DEMO_SEL351: ParsedRelaySettings = settings('SEL-351', 'FDR01', 'R300-V1', [
  grp('MAIN', [{ k: 'TAG', v: 'FDR01', l: 2 }, { k: 'RID', v: 'FEEDER 01', l: 3 }], F, 1),
  grp('SET1', [
    { k: '51P1P',  v: '5.00',  l: 10 }, { k: '51P1TD', v: '0.50', l: 11 },
    { k: '51P1CT', v: 'U1',    l: 12 }, { k: '50P1P',  v: '20.00',l: 13 },
    { k: '51G1P',  v: '1.00',  l: 14 }, { k: '51G1TD', v: '0.30', l: 15 },
  ], F, 9),
  grp('SELOGIC', [
    { k: 'TR',     v: '51P1T + 51G1T + 50P1 + 50G1', l: 20 },
    { k: '51P1TC', v: '51P1',                          l: 21 },
    { k: '51G1TC', v: '51G1',                          l: 22 },
    { k: 'LT1S',   v: 'TR',                            l: 23 },
    { k: 'LT1R',   v: 'IN101',                         l: 24 },
    { k: 'OUT101', v: 'LT1',                           l: 25 },
    { k: 'ALARM',  v: '51P1 + 51G1',                   l: 26 },
  ], F, 19),
], [
  eq('TR',     '51P1T + 51G1T + 50P1 + 50G1', 'Trip',                    'TRIP',      F, 20),
  eq('51P1TC', '51P1',                          'Phase OC Timer Control', 'TIMER_IN',  F, 21),
  eq('51G1TC', '51G1',                          'Ground OC Timer Control','TIMER_IN',  F, 22),
  eq('LT1S',   'TR',                            'Latch 1 Set',            'LATCH_SET', F, 23),
  eq('LT1R',   'IN101',                         'Latch 1 Reset',          'LATCH_RESET',F,24),
  eq('OUT101', 'LT1',                           'Output 101',             'OUTPUT',    F, 25),
  eq('ALARM',  '51P1 + 51G1',                   'Alarm',                  'ALARM',     F, 26),
], F, 30);

// ─── SEL-411L LDR01 (line differential) ──────────────────────────────────────

const L = 'SEL411L_LDR01.txt';
export const DEMO_SEL411L: ParsedRelaySettings = settings('SEL-411L', 'LDR01', 'R230-V1', [
  grp('MAIN', [{ k: 'TAG', v: 'LDR01', l: 2 }, { k: 'RID', v: 'LINE DIFF 01', l: 3 }], L, 1),
  grp('SET1', [
    { k: '87LP', v: '0.20', l: 10 }, { k: '87LS', v: '1.00', l: 11 },
    { k: '21P1', v: '8.00', l: 12 }, { k: '21P2', v: '12.00',l: 13 },
    { k: '51PP', v: '5.00', l: 14 }, { k: '51PTD',v: '1.00', l: 15 },
  ], L, 9),
  grp('SELOGIC', [
    { k: 'TR',    v: '87L + 21P1T + 51PT * !BLK21', l: 20 },
    { k: '87LCT', v: 'SV1',                          l: 21 },
    { k: 'SV1S',  v: '^IN101',                        l: 22 },
    { k: 'SV1R',  v: 'IN102',                         l: 23 },
    { k: 'BLK21', v: '!52A * SOTF',                   l: 24 },
    { k: '21TC',  v: '21P1 + 21P2',                   l: 25 },
    { k: 'ALARM', v: '87L + 51P',                      l: 26 },
    { k: 'OUT101',v: 'TR',                             l: 27 },
  ], L, 19),
], [
  eq('TR',     '87L + 21P1T + 51PT * !BLK21', 'Trip (diff OR dist, blocked by BLK21)', 'TRIP',        L, 20),
  eq('87LCT',  'SV1',                           '87L Comm Timer Control',               'TIMER_IN',    L, 21),
  eq('SV1S',   '^IN101',                         'SV1 Set on rising edge of IN101',      'RISING_EDGE', L, 22),
  eq('SV1R',   'IN102',                          'SV1 Reset',                            'LATCH_RESET', L, 23),
  eq('BLK21',  '!52A * SOTF',                    'Distance Block (breaker open + SOTF)', 'BLOCK',       L, 24),
  eq('21TC',   '21P1 + 21P2',                    'Zone 1/2 Timer Control',               'TIMER_IN',    L, 25),
  eq('ALARM',  '87L + 51P',                       'Alarm',                               'ALARM',       L, 26),
  eq('OUT101', 'TR',                              'Trip Output',                          'OUTPUT',      L, 27),
], L, 35);

// ─── SEL-421 DTR01 (POTT distance) ───────────────────────────────────────────

const D = 'SEL421_DTR01.txt';
export const DEMO_SEL421: ParsedRelaySettings = settings('SEL-421', 'DTR01', 'R500-V2', [
  grp('MAIN', [{ k: 'TAG', v: 'DTR01', l: 2 }, { k: 'RID', v: 'DISTANCE 01', l: 3 }], D, 1),
  grp('SET1', [
    { k: '21P1R', v: '4.50', l: 10 }, { k: '21P2R', v: '8.00', l: 11 },
    { k: '21P3R', v: '12.00',l: 12 }, { k: '21G1R', v: '5.00', l: 13 },
    { k: '67ANG', v: '85',   l: 14 }, { k: '51PPU', v: '6.00', l: 15 },
    { k: '51PTD', v: '1.00', l: 16 },
  ], D, 9),
  grp('SELOGIC', [
    { k: 'TR',    v: 'Z1G + POTT + 51PT * !BLK51', l: 20 },
    { k: 'POTT',  v: '(21P2 + 21G2) * 67P * RxWI', l: 21 },
    { k: 'TxWI',  v: '(21P2 + 21G2) * 67P',        l: 22 },
    { k: 'BLK21', v: '!52A',                         l: 23 },
    { k: 'BLK51', v: 'BLK21 + 21P1',                l: 24 },
    { k: '51PTC', v: '67P * !BLK51',                 l: 25 },
    { k: 'LT1S',  v: 'TR',                           l: 26 },
    { k: 'LT1R',  v: '^IN101',                        l: 27 },
    { k: 'ALARM', v: '21P3 + 51P',                    l: 28 },
    { k: 'OUT101',v: 'LT1',                           l: 29 },
    { k: 'OUT102',v: 'TxWI',                          l: 30 },
  ], D, 19),
], [
  eq('TR',    'Z1G + POTT + 51PT * !BLK51',  'Trip (Z1G OR POTT OR OC backup)',     'TRIP',         D, 20),
  eq('POTT',  '(21P2 + 21G2) * 67P * RxWI', 'POTT trip — zone 2 + direct + RxWI', 'COMM_ASSISTED', D, 21),
  eq('TxWI',  '(21P2 + 21G2) * 67P',         'Transmit POTT permissive',            'COMM_ASSISTED', D, 22),
  eq('BLK21', '!52A',                          'Distance block (breaker open)',       'BLOCK',         D, 23),
  eq('BLK51', 'BLK21 + 21P1',                 'OC block',                            'BLOCK',         D, 24),
  eq('51PTC', '67P * !BLK51',                  'OC timer control (supervised)',       'TIMER_IN',      D, 25),
  eq('LT1S',  'TR',                            'Trip latch set',                      'LATCH_SET',     D, 26),
  eq('LT1R',  '^IN101',                         'Trip latch reset (rising edge)',      'RISING_EDGE',   D, 27),
  eq('ALARM', '21P3 + 51P',                    'Alarm (Z3 reach or OC pickup)',       'ALARM',         D, 28),
  eq('OUT101','LT1',                           'Trip output (latched)',               'OUTPUT',        D, 29),
  eq('OUT102','TxWI',                          'Transmit POTT output',               'OUTPUT',        D, 30),
], D, 40);

// ─── SEL-451 DOR01 (distance + OC + SOTF) ────────────────────────────────────

const DO = 'SEL451_DOR01.txt';
export const DEMO_SEL451: ParsedRelaySettings = settings('SEL-451', 'DOR01', 'R410-V1', [
  grp('MAIN', [{ k: 'TAG', v: 'DOR01', l: 2 }, { k: 'RID', v: 'DIST+OC 01', l: 3 }], DO, 1),
  grp('SET1', [
    { k: '21P1R', v: '3.50', l: 10 }, { k: '21P2R', v: '6.00', l: 11 },
    { k: '51PPU', v: '4.00', l: 12 }, { k: '51PTD', v: '0.80', l: 13 },
    { k: 'SOTFP', v: '20.00',l: 14 },
  ], DO, 9),
  grp('SELOGIC', [
    { k: 'TR',    v: '21P1T + SOTF_TRIP + 51PT * !BLK21', l: 20 },
    { k: 'SOTF_TRIP',v: 'SOTF * (50P1 + 50G1)',           l: 21 },
    { k: 'SOTF',  v: '^52A',                               l: 22 },
    { k: 'BLK21', v: 'OSB + !52A',                        l: 23 },
    { k: '51PTC', v: '!BLK21',                             l: 24 },
    { k: 'LT1S',  v: 'TR',                                 l: 25 },
    { k: 'LT1R',  v: 'IN101',                              l: 26 },
    { k: 'ALARM', v: '21P2 + 51P',                         l: 27 },
    { k: 'OUT101',v: 'TR',                                  l: 28 },
  ], DO, 19),
], [
  eq('TR',       '21P1T + SOTF_TRIP + 51PT * !BLK21','Trip',                              'TRIP',        DO,20),
  eq('SOTF_TRIP','SOTF * (50P1 + 50G1)',               'Switch-onto-fault trip',           'TRIP',        DO,21),
  eq('SOTF',     '^52A',                                'Switch-onto-fault (edge of 52A)', 'RISING_EDGE', DO,22),
  eq('BLK21',    'OSB + !52A',                          'Distance block (OSB or open)',     'BLOCK',       DO,23),
  eq('51PTC',    '!BLK21',                              'OC timer control',                 'TIMER_IN',    DO,24),
  eq('LT1S',     'TR',                                  'Trip latch set',                   'LATCH_SET',   DO,25),
  eq('LT1R',     'IN101',                               'Trip latch reset',                 'LATCH_RESET', DO,26),
  eq('ALARM',    '21P2 + 51P',                          'Alarm',                            'ALARM',       DO,27),
  eq('OUT101',   'TR',                                  'Trip output',                      'OUTPUT',      DO,28),
], DO, 35);

// ─── SEL-711 FDR02 (feeder + 79 recloser) ────────────────────────────────────

const R = 'SEL711_FDR02.txt';
export const DEMO_SEL711: ParsedRelaySettings = settings('SEL-711', 'FDR02', 'R210-V1', [
  grp('MAIN', [{ k: 'TAG', v: 'FDR02', l: 2 }, { k: 'RID', v: 'FEEDER 02', l: 3 }], R, 1),
  grp('SET1', [
    { k: '51PPU', v: '5.00', l: 10 }, { k: '51PTD', v: '0.40', l: 11 },
    { k: '50P1P', v: '25.00',l: 12 }, { k: '50P2P', v: '50.00',l: 13 },
    { k: '51GPU', v: '1.00', l: 14 }, { k: '51GTD', v: '0.30', l: 15 },
  ], R, 9),
  grp('RECLOSE', [
    { k: '79DTD1',v: '0.50', l: 22 }, { k: '79DTD2',v: '5.00', l: 23 },
    { k: '79DTD3',v: '15.00',l: 24 }, { k: '79LO',  v: '60.00',l: 25 },
  ], R, 21),
  grp('SELOGIC', [
    { k: 'TR',   v: '51PT + 51GT + 50P1 + 50G1',       l: 30 },
    { k: 'CL',   v: '79CY * !79LO',                     l: 31 },
    { k: '79CY', v: 'TR * !79LO',                        l: 32 },
    { k: 'CLDI', v: '^52A',                               l: 33 },
    { k: 'LT1S', v: '79LO',                              l: 34 },
    { k: 'LT1R', v: 'IN101',                             l: 35 },
    { k: 'ALARM',v: '51P + 51G + 79LO',                  l: 36 },
    { k: 'OUT101',v:'TR',                                 l: 37 },
    { k: 'OUT102',v:'CL',                                 l: 38 },
  ], R, 29),
], [
  eq('TR',    '51PT + 51GT + 50P1 + 50G1', 'Trip',                  'TRIP',        R, 30),
  eq('CL',    '79CY * !79LO',               'Close (recloser)',      'RECLOSER',    R, 31),
  eq('79CY',  'TR * !79LO',                 '79 Recloser cycle',     'RECLOSER',    R, 32),
  eq('CLDI',  '^52A',                        'Cold load inhibit edge','RISING_EDGE', R, 33),
  eq('LT1S',  '79LO',                        'Lockout latch set',    'LATCH_SET',   R, 34),
  eq('LT1R',  'IN101',                       'Lockout latch reset',  'LATCH_RESET', R, 35),
  eq('ALARM', '51P + 51G + 79LO',            'Alarm',                'ALARM',       R, 36),
  eq('OUT101','TR',                          'Trip output',           'OUTPUT',      R, 37),
  eq('OUT102','CL',                          'Close output',          'OUTPUT',      R, 38),
], R, 45);

// ─── SEL-751 FDR03 (50/51/67 + SEF + cold load) ──────────────────────────────

const S = 'SEL751_FDR03.txt';
export const DEMO_SEL751: ParsedRelaySettings = settings('SEL-751', 'FDR03', 'R400-V1', [
  grp('MAIN', [{ k: 'TAG', v: 'FDR03', l: 2 }, { k: 'RID', v: 'FEEDER 03', l: 3 }], S, 1),
  grp('SET1', [
    { k: '51PPU', v: '4.00',  l: 10 }, { k: '51PTD', v: '0.35', l: 11 },
    { k: '67PPU', v: '4.00',  l: 12 }, { k: '67GTD', v: '0.20', l: 13 },
    { k: 'SEFPU', v: '0.10',  l: 14 }, { k: 'SEFTD', v: '0.50', l: 15 },
    { k: '50P1P', v: '20.00', l: 16 },
  ], S, 9),
  grp('SELOGIC', [
    { k: 'TR',   v: '67PT + 67GT + 50P1 + SEF_TRIP * !CLDI',l: 20 },
    { k: '67PTC',v: '67P * 52A',                              l: 21 },
    { k: '67GTC',v: '67G * 52A',                              l: 22 },
    { k: 'SEF_TRIP',v:'SEFT * !CLDI',                         l: 23 },
    { k: 'CLDI', v: '^52A',                                    l: 24 },
    { k: 'SV1S', v: 'IN101',                                  l: 25 },
    { k: 'SV1R', v: 'IN102',                                  l: 26 },
    { k: 'LT1S', v: 'TR',                                     l: 27 },
    { k: 'LT1R', v: 'IN103',                                  l: 28 },
    { k: 'ALARM',v: '51P + 67P + SEF',                         l: 29 },
    { k: 'OUT101',v:'TR',                                      l: 30 },
  ], S, 19),
], [
  eq('TR',      '67PT + 67GT + 50P1 + SEF_TRIP * !CLDI','Trip',                              'TRIP',        S, 20),
  eq('67PTC',   '67P * 52A',                              'Phase dir. OC timer (supv 52A)',   'TIMER_IN',    S, 21),
  eq('67GTC',   '67G * 52A',                              'Ground dir. OC timer (supv 52A)',  'TIMER_IN',    S, 22),
  eq('SEF_TRIP','SEFT * !CLDI',                           'SEF trip (blocked cold load)',     'TRIP',        S, 23),
  eq('CLDI',    '^52A',                                    'Cold load inhibit (edge)',         'RISING_EDGE', S, 24),
  eq('SV1S',    'IN101',                                   'SV1 set (remote ctrl)',            'LATCH_SET',   S, 25),
  eq('SV1R',    'IN102',                                   'SV1 reset',                        'LATCH_RESET', S, 26),
  eq('LT1S',    'TR',                                     'Trip latch set',                    'LATCH_SET',   S, 27),
  eq('LT1R',    'IN103',                                  'Trip latch reset',                  'LATCH_RESET', S, 28),
  eq('ALARM',   '51P + 67P + SEF',                         'Alarm',                            'ALARM',       S, 29),
  eq('OUT101',  'TR',                                     'Trip output',                       'OUTPUT',      S, 30),
], S, 38);

// ─── SEL-787 TXDR01 (transformer differential) ───────────────────────────────

const TX = 'SEL787_TXDR01.txt';
export const DEMO_SEL787: ParsedRelaySettings = settings('SEL-787', 'TXDR01', 'R530-V1', [
  grp('MAIN', [{ k: 'TAG', v: 'TXDR01', l: 2 }, { k: 'RID', v: 'TRANSFORMER 01', l: 3 }], TX, 1),
  grp('SET1', [
    { k: '87TP',  v: '0.30',  l: 10 }, { k: '87TRS', v: '1.00', l: 11 },
    { k: '87TQ',  v: '0.10',  l: 12 }, { k: '51NP',  v: '2.00', l: 13 },
    { k: '51NTD', v: '0.60',  l: 14 }, { k: 'REFPU', v: '0.05', l: 15 },
  ], TX, 9),
  grp('SELOGIC', [
    { k: 'TR',    v: '87T + REF_TRIP',                    l: 20 },
    { k: '87T',   v: '87TP + 87TQ * !HARMS',             l: 21 },
    { k: 'REF_TRIP',v: 'REFT * !HARMS',                   l: 22 },
    { k: 'HARMS', v: 'H2 + H5',                           l: 23 },
    { k: '51NTC', v: '51N * !HARMS',                      l: 24 },
    { k: 'LT1S',  v: 'TR',                                l: 25 },
    { k: 'LT1R',  v: '^IN101',                             l: 26 },
    { k: 'ALARM', v: '87T + 51N + REF',                   l: 27 },
    { k: 'OUT101',v: 'LT1',                                l: 28 },
  ], TX, 19),
], [
  eq('TR',      '87T + REF_TRIP',           'Trip',                              'TRIP',        TX, 20),
  eq('87T',     '87TP + 87TQ * !HARMS',     'Diff trip (restrained by harmonics)','DIFFERENTIAL',TX, 21),
  eq('REF_TRIP','REFT * !HARMS',             'REF trip (harmonic restrained)',    'TRIP',        TX, 22),
  eq('HARMS',   'H2 + H5',                   'Harmonic restraint (2nd + 5th)',   'BLOCK',       TX, 23),
  eq('51NTC',   '51N * !HARMS',              'Neutral OC timer (supv)',           'TIMER_IN',    TX, 24),
  eq('LT1S',    'TR',                        'Trip latch set',                    'LATCH_SET',   TX, 25),
  eq('LT1R',    '^IN101',                     'Trip latch reset (edge)',           'RISING_EDGE', TX, 26),
  eq('ALARM',   '87T + 51N + REF',           'Alarm',                            'ALARM',       TX, 27),
  eq('OUT101',  'LT1',                        'Trip output (latched)',             'OUTPUT',      TX, 28),
], TX, 35);

// ─── SEL-2411 PAC01 (automation/interlocking) ─────────────────────────────────

const P = 'SEL2411_PAC01.txt';
export const DEMO_SEL2411: ParsedRelaySettings = settings('SEL-2411', 'PAC01', 'R132-V1', [
  grp('MAIN', [{ k: 'TAG', v: 'PAC01', l: 2 }, { k: 'RID', v: 'PAC INTERLOCKING', l: 3 }], P, 1),
  grp('SELOGIC CONTROL EQUATIONS', [
    { k: 'OUT1', v: 'IN1 * !IN2 * SV1',               l: 10 },
    { k: 'OUT2', v: '^IN3 + SV2',                      l: 11 },
    { k: 'OUT3', v: 'IN4 * IN5 * !SV1',                l: 12 },
    { k: 'OUT4', v: 'COMM_IN * (IN1 + IN2)',            l: 13 },
    { k: 'SV1S', v: 'IN6',                              l: 14 },
    { k: 'SV1R', v: 'IN7',                              l: 15 },
    { k: 'SV2S', v: '^IN8',                             l: 16 },
    { k: 'SV2R', v: 'IN9 + IN10',                      l: 17 },
    { k: 'ALARM',v: '!OUT1 * IN1 + !OUT2 * IN3',        l: 18 },
  ], P, 9),
], [
  eq('OUT1', 'IN1 * !IN2 * SV1',             'Output 1 (AND logic, SV1 supervised)',  'OUTPUT',      P, 10),
  eq('OUT2', '^IN3 + SV2',                    'Output 2 (edge trigger OR latch)',      'RISING_EDGE', P, 11),
  eq('OUT3', 'IN4 * IN5 * !SV1',             'Output 3 (AND with NOT block)',         'OUTPUT',      P, 12),
  eq('OUT4', 'COMM_IN * (IN1 + IN2)',         'Output 4 (comms-assisted)',             'COMM_ASSISTED',P,13),
  eq('SV1S', 'IN6',                           'SV1 set',                              'LATCH_SET',   P, 14),
  eq('SV1R', 'IN7',                           'SV1 reset',                            'LATCH_RESET', P, 15),
  eq('SV2S', '^IN8',                           'SV2 set (rising edge)',                'RISING_EDGE', P, 16),
  eq('SV2R', 'IN9 + IN10',                   'SV2 reset',                            'LATCH_RESET', P, 17),
  eq('ALARM','!OUT1 * IN1 + !OUT2 * IN3',     'Alarm (output mismatch)',              'ALARM',       P, 18),
], P, 25);

// ─── Full demo relay list ─────────────────────────────────────────────────────

/** All 8 pre-built relay demo instances. */
export const ALL_DEMO_RELAYS: ParsedRelaySettings[] = [
  DEMO_SEL351,
  DEMO_SEL411L,
  DEMO_SEL421,
  DEMO_SEL451,
  DEMO_SEL711,
  DEMO_SEL751,
  DEMO_SEL787,
  DEMO_SEL2411,
];
