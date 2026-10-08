/**
 * Tests untuk random code generator
 */

import { describe, it, expect } from 'vitest';
import { generateCode, generateCodePair, isValidCode } from '../random-code';
import { CODE_LENGTH, CHARSET, LETTERS, DIGITS } from '../../constants';

describe('generateCode', () => {
  it('should generate code with correct length', () => {
    const code = generateCode();
    expect(code).toHaveLength(CODE_LENGTH);
  });

  it('should only use allowed charset', () => {
    const code = generateCode();
    
    // Check semua karakter ada di charset
    for (const char of code) {
      expect(CHARSET).toContain(char);
    }
  });

  it('should not contain ambiguous characters', () => {
    const ambiguous = ['0', 'o', '1', 'l', 'i', 'O', 'L', 'I'];
    
    for (let i = 0; i < 100; i++) {
      const code = generateCode();
      
      for (const char of ambiguous) {
        expect(code).not.toContain(char);
      }
      
      // Semua karakter harus huruf besar atau angka
      expect(code).toMatch(/^[A-Z2-9]+$/);
    }
  });

  it('should contain at least 1 letter and 1 digit', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateCode();
      
      // Check ada huruf
      const hasLetter = LETTERS.split('').some(letter => code.includes(letter));
      expect(hasLetter).toBe(true);
      
      // Check ada angka
      const hasDigit = DIGITS.split('').some(digit => code.includes(digit));
      expect(hasDigit).toBe(true);
    }
  });

  it('should generate different codes', () => {
    const codes = new Set<string>();
    const iterations = 1000;
    
    for (let i = 0; i < iterations; i++) {
      codes.add(generateCode());
    }
    
    // Allow < 1% collision
    expect(codes.size).toBeGreaterThan(iterations * 0.99);
  });

  it('should have reasonable distribution', () => {
    const charCount = new Map<string, number>();
    const iterations = 10000;
    
    // Count karakter dari banyak kode
    for (let i = 0; i < iterations; i++) {
      const code = generateCode();
      for (const char of code) {
        charCount.set(char, (charCount.get(char) || 0) + 1);
      }
    }
    
    // Setiap karakter di charset harus muncul setidaknya sekali
    // dalam 10000 kode (60000 total karakter)
    // Allow significant variance karena rejection sampling
    // tapi semua karakter harus muncul
    for (const char of CHARSET) {
      const count = charCount.get(char) || 0;
      expect(count).toBeGreaterThan(0);
    }
  });
});

describe('generateCodePair', () => {
  it('should generate different user and pass when samePassword is false', () => {
    const pair = generateCodePair(false);
    
    expect(pair.user).toHaveLength(CODE_LENGTH);
    expect(pair.pass).toHaveLength(CODE_LENGTH);
    
    // User dan pass kemungkinan besar berbeda (tapi bisa sama secara random)
    // Jadi kita test dengan multiple iterations
    const pairs = Array.from({ length: 20 }, () => generateCodePair(false));
    const differentCount = pairs.filter(p => p.user !== p.pass).length;
    
    // Setidaknya 95% harus berbeda
    expect(differentCount).toBeGreaterThan(18);
  });

  it('should generate same user and pass when samePassword is true', () => {
    const pair = generateCodePair(true);
    
    expect(pair.user).toBe(pair.pass);
    expect(pair.user).toHaveLength(CODE_LENGTH);
  });
});

describe('isValidCode', () => {
  it('should validate correct codes', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCode();
      expect(isValidCode(code)).toBe(true);
    }
  });

  it('should reject codes with wrong length', () => {
    expect(isValidCode('ABC')).toBe(false);
    expect(isValidCode('ABCD12')).toBe(false); // 6 chars tapi bisa valid jika sesuai aturan
    expect(isValidCode('ABC12')).toBe(false); // 5 chars
    expect(isValidCode('ABC1234')).toBe(false); // 7 chars
  });

  it('should reject codes with invalid characters', () => {
    expect(isValidCode('ABC23O')).toBe(false); // contains O
    expect(isValidCode('ABC1OX')).toBe(false); // contains 1 and O
    expect(isValidCode('abc123')).toBe(false); // lowercase
    expect(isValidCode('ABC!23')).toBe(false); // special char
  });

  it('should reject codes without letters', () => {
    expect(isValidCode('234567')).toBe(false);
  });

  it('should reject codes without digits', () => {
    expect(isValidCode('ABCDEF')).toBe(false);
  });

  it('should accept valid codes', () => {
    expect(isValidCode('ABC234')).toBe(true);
    expect(isValidCode('X2Y3Z4')).toBe(true);
    expect(isValidCode('M9N8P7')).toBe(true);
  });
});
