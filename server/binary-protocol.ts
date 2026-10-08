/**
 * MikroTik RouterOS Binary API Protocol Codec
 * Handles variable-length word encoding/decoding and sentence framing.
 */

export function encodeLength(length: number): Buffer {
  if (length < 0x80) {
    return Buffer.from([length]);
  } else if (length < 0x4000) {
    const val = length | 0x8000;
    return Buffer.from([(val >> 8) & 0xff, val & 0xff]);
  } else if (length < 0x200000) {
    const val = length | 0xc00000;
    return Buffer.from([(val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff]);
  } else if (length < 0x10000000) {
    const val = (length | 0xe0000000) >>> 0;
    return Buffer.from([
      (val >> 24) & 0xff,
      (val >> 16) & 0xff,
      (val >> 8) & 0xff,
      val & 0xff,
    ]);
  } else {
    return Buffer.from([
      0xf0,
      (length >> 24) & 0xff,
      (length >> 16) & 0xff,
      (length >> 8) & 0xff,
      length & 0xff,
    ]);
  }
}

export function encodeWord(word: string): Buffer {
  const wordBytes = Buffer.from(word, 'utf8');
  const lenBytes = encodeLength(wordBytes.length);
  return Buffer.concat([lenBytes, wordBytes]);
}

export function encodeSentence(words: string[]): Buffer {
  const chunks: Buffer[] = words.map((w) => encodeWord(w));
  chunks.push(Buffer.from([0x00])); // Empty word terminates sentence
  return Buffer.concat(chunks);
}

export interface DecodedWord {
  word: string;
  bytesConsumed: number;
}

export function decodeWord(buffer: Buffer, offset: number): DecodedWord | null {
  if (offset >= buffer.length) {
    return null;
  }

  const b0 = buffer[offset];
  let length: number;
  let lenBytes: number;

  if ((b0 & 0x80) === 0x00) {
    length = b0;
    lenBytes = 1;
  } else if ((b0 & 0xc0) === 0x80) {
    if (offset + 2 > buffer.length) return null;
    length = ((b0 & 0x3f) << 8) | buffer[offset + 1];
    lenBytes = 2;
  } else if ((b0 & 0xe0) === 0xc0) {
    if (offset + 3 > buffer.length) return null;
    length = ((b0 & 0x1f) << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2];
    lenBytes = 3;
  } else if ((b0 & 0xf0) === 0xe0) {
    if (offset + 4 > buffer.length) return null;
    length =
      ((b0 & 0x0f) << 24) |
      (buffer[offset + 1] << 16) |
      (buffer[offset + 2] << 8) |
      buffer[offset + 3];
    lenBytes = 4;
  } else if (b0 === 0xf0) {
    if (offset + 5 > buffer.length) return null;
    length =
      (buffer[offset + 1] << 24) |
      (buffer[offset + 2] << 16) |
      (buffer[offset + 3] << 8) |
      buffer[offset + 4];
    lenBytes = 5;
  } else {
    // Control byte or unhandled
    return null;
  }

  if (offset + lenBytes + length > buffer.length) {
    return null; // Incomplete word
  }

  const word = buffer.toString('utf8', offset + lenBytes, offset + lenBytes + length);
  return {
    word,
    bytesConsumed: lenBytes + length,
  };
}

export interface ApiSentence {
  type: string; // '!re', '!done', '!trap', '!fatal'
  attributes: Record<string, string>;
  rawWords: string[];
}

export class SentenceParser {
  private buffer: Buffer = Buffer.alloc(0);

  append(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
  }

  hasBuffer(): boolean {
    return this.buffer.length > 0;
  }

  nextSentence(): ApiSentence | null {
    let offset = 0;
    const words: string[] = [];

    while (offset < this.buffer.length) {
      const decoded = decodeWord(this.buffer, offset);
      if (!decoded) {
        return null; // Waiting for more data
      }

      offset += decoded.bytesConsumed;

      if (decoded.word === '') {
        // Sentence finished!
        this.buffer = this.buffer.subarray(offset);
        return parseSentenceWords(words);
      } else {
        words.push(decoded.word);
      }
    }

    return null;
  }
}

export function parseSentenceWords(words: string[]): ApiSentence {
  const type = words[0] || '';
  const attributes: Record<string, string> = {};

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (word.startsWith('=')) {
      const eqIdx = word.indexOf('=', 1);
      if (eqIdx !== -1) {
        const key = word.slice(1, eqIdx);
        const val = word.slice(eqIdx + 1);
        attributes[key] = val;
      } else {
        attributes[word.slice(1)] = '';
      }
    }
  }

  return { type, attributes, rawWords: words };
}
