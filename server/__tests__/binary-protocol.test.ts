import { describe, it, expect } from 'vitest';
import {
  encodeLength,
  encodeWord,
  encodeSentence,
  SentenceParser,
  parseSentenceWords,
} from '../binary-protocol.ts';

describe('RouterOS Binary Protocol Codec', () => {
  it('should encode lengths correctly', () => {
    // < 0x80 -> 1 byte
    expect(encodeLength(10)).toEqual(Buffer.from([10]));
    expect(encodeLength(127)).toEqual(Buffer.from([127]));

    // 0x80 to 0x3FFF -> 2 bytes
    const twoByte = encodeLength(200);
    expect(twoByte.length).toBe(2);
    expect(twoByte[0] & 0x80).toBe(0x80);

    // larger lengths
    const threeByte = encodeLength(20000);
    expect(threeByte.length).toBe(3);
    expect(threeByte[0] & 0xc0).toBe(0xc0);
  });

  it('should encode single word correctly', () => {
    const wordBuf = encodeWord('test');
    expect(wordBuf[0]).toBe(4);
    expect(wordBuf.subarray(1).toString('utf8')).toBe('test');
  });

  it('should encode and decode sentences', () => {
    const words = ['/login', '=name=admin', '=password=secret'];
    const encoded = encodeSentence(words);

    const parser = new SentenceParser();
    parser.append(encoded);

    const sentence = parser.nextSentence();
    expect(sentence).not.toBeNull();
    expect(sentence?.type).toBe('/login');
    expect(sentence?.attributes['name']).toBe('admin');
    expect(sentence?.attributes['password']).toBe('secret');
  });

  it('should handle fragmented streams', () => {
    const words = ['!re', '=.id=*1', '=name=default', '=rate-limit=2M/5M'];
    const encoded = encodeSentence(words);

    const parser = new SentenceParser();
    
    // Split into 3 chunks to simulate TCP fragmentation
    const chunk1 = encoded.subarray(0, 10);
    const chunk2 = encoded.subarray(10, 25);
    const chunk3 = encoded.subarray(25);

    parser.append(chunk1);
    expect(parser.nextSentence()).toBeNull();

    parser.append(chunk2);
    expect(parser.nextSentence()).toBeNull();

    parser.append(chunk3);
    const sentence = parser.nextSentence();
    expect(sentence).not.toBeNull();
    expect(sentence?.type).toBe('!re');
    expect(sentence?.attributes['.id']).toBe('*1');
    expect(sentence?.attributes['name']).toBe('default');
    expect(sentence?.attributes['rate-limit']).toBe('2M/5M');
  });

  it('should parse !done sentence with return value', () => {
    const parsed = parseSentenceWords(['!done', '=ret=*A']);
    expect(parsed.type).toBe('!done');
    expect(parsed.attributes['ret']).toBe('*A');
  });

  it('should parse !trap error sentence', () => {
    const parsed = parseSentenceWords(['!trap', '=message=invalid user name or password']);
    expect(parsed.type).toBe('!trap');
    expect(parsed.attributes['message']).toBe('invalid user name or password');
  });
});
