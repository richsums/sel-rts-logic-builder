import { describe, it, expect } from 'vitest';
import { detectSEL351 } from '../relay-adapters/sel351/detector';
import { detectSEL411L } from '../relay-adapters/sel411l/detector';
import { detectSEL421 } from '../relay-adapters/sel421/detector';
import { detectSEL451 } from '../relay-adapters/sel451/detector';
import { detectSEL711 } from '../relay-adapters/sel711/detector';
import { detectSEL751 } from '../relay-adapters/sel751/detector';
import { detectSEL787 } from '../relay-adapters/sel787/detector';
import { detectSEL2411 } from '../relay-adapters/sel2411/detector';

const header = (model: string, extras = '') =>
  `${model} Relay Settings\n[MAIN]\nTAG=TEST\n${extras}\n[SELOGIC]\nTR=1`;

describe('Relay model detectors', () => {
  describe('SEL-351', () => {
    it('detects SEL-351 from header', () => {
      const result = detectSEL351(header('SEL-351'));
      expect(result.detected).toBe(true);
      expect(result.model).toBe('SEL-351');
      expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    });
    it('does not detect SEL-351 from unrelated text', () => {
      const result = detectSEL351('TOTALLY UNRELATED FILE CONTENT\nNO RELAY KEYWORDS HERE');
      expect(result.confidence).toBeLessThan(0.3);
    });
  });

  describe('SEL-411L', () => {
    it('detects SEL-411L from header', () => {
      const result = detectSEL411L(header('SEL-411L', '87L ELEMENTS\nLINE DIFF'));
      expect(result.detected).toBe(true);
      expect(result.model).toBe('SEL-411L');
    });
    it('gives high confidence with 87L keyword', () => {
      const result = detectSEL411L('SEL-411L Line Differential\n87L=0.2\n[SELOGIC]');
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('SEL-421', () => {
    it('detects SEL-421 from header', () => {
      const result = detectSEL421(header('SEL-421', 'POTT SCHEME\nMHO DISTANCE'));
      expect(result.detected).toBe(true);
      expect(result.model).toBe('SEL-421');
    });
    it('detects PUTT keyword', () => {
      const result = detectSEL421('SEL-421\nPUTT SCHEME\n[SELOGIC]');
      expect(result.detected).toBe(true);
    });
  });

  describe('SEL-451', () => {
    it('detects SEL-451 from header', () => {
      const result = detectSEL451(header('SEL-451', 'DISTANCE RELAY'));
      expect(result.detected).toBe(true);
      expect(result.model).toBe('SEL-451');
    });
  });

  describe('SEL-711', () => {
    it('detects SEL-711 from header', () => {
      const result = detectSEL711(header('SEL-711', 'RECLOSE 79'));
      expect(result.detected).toBe(true);
      expect(result.model).toBe('SEL-711');
    });
    it('detects with recloser keyword', () => {
      const result = detectSEL711('SEL-711 FEEDER\nRECLOSE\n79 ELEMENT\n[SELOGIC]');
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('SEL-751', () => {
    it('detects SEL-751 from header', () => {
      const result = detectSEL751(header('SEL-751'));
      expect(result.detected).toBe(true);
      expect(result.model).toBe('SEL-751');
    });
  });

  describe('SEL-787', () => {
    it('detects SEL-787 from header', () => {
      const result = detectSEL787(header('SEL-787', 'TRANSFORMER\n87T DIFFERENTIAL'));
      expect(result.detected).toBe(true);
      expect(result.model).toBe('SEL-787');
    });
    it('gives extra confidence with 87T keyword', () => {
      const result = detectSEL787('SEL-787\n87T=0.3\nTRANSFORMER DIFFERENTIAL\n[SELOGIC]');
      expect(result.confidence).toBeGreaterThan(0.6);
    });
  });

  describe('SEL-2411', () => {
    it('detects SEL-2411 from header', () => {
      const result = detectSEL2411(header('SEL-2411', 'PAC\nSELOGIC CONTROL EQUATIONS'));
      expect(result.detected).toBe(true);
      expect(result.model).toBe('SEL-2411');
    });
    it('detects := assignment syntax', () => {
      const result = detectSEL2411('SEL-2411 PAC\nOUT1 := IN1 * SV1\nOUT2 := IN2');
      expect(result.confidence).toBeGreaterThan(0.3);
    });
  });
});
