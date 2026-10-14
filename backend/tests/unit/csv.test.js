import { describe, expect, it } from 'vitest';
import { FORMATS, csvHeader, csvRows, formatCell } from '../../src/exports/csv.js';

describe('formatCell', () => {
  it.each([
    ['plain', 'text', 'plain'],
    ['a,b', 'text', '"a,b"'],
    ['say "hi"', 'text', '"say ""hi"""'],
    ['two\nlines', 'text', '"two\nlines"'],
    ['=1+1', 'text', "'=1+1"],
    ['+33 1 23', 'text', "'+33 1 23"],
    ['-x', 'text', "'-x"],
    ['@SUM(A1)', 'text', "'@SUM(A1)"],
    ['\tcmd', 'text', "'\tcmd"],
    [-3, 'number', '-3'],
    ['1299.00', 'number', '1299.00'],
    [true, 'boolean', 'true'],
    [null, 'text', ''],
    ['2026-03-01T10:00:00Z', 'date', '2026-03-01T10:00:00.000Z'],
  ])('%j as %s → %j', (value, type, expected) => {
    expect(formatCell(value, type, ',')).toBe(expected);
  });

  it('quotes the active delimiter only', () => {
    expect(formatCell('a;b', 'text', ',')).toBe('a;b');
    expect(formatCell('a;b', 'text', ';')).toBe('"a;b"');
  });
});

describe('csv rows', () => {
  it('writes CRLF rows, with a byte order mark for Excel', () => {
    const columns = [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B', value: (r) => r.a * 2, type: 'number' },
    ];
    expect(csvHeader(columns, FORMATS.csv)).toBe('A,B\r\n');
    // U+FEFF byte order mark, written as a code point so it stays visible here.
    expect(csvHeader(columns, FORMATS.excel)).toBe(`${String.fromCodePoint(0xfeff)}A;B\r\n`);
    expect(csvRows([{ a: 1 }, { a: 2 }], columns, FORMATS.csv)).toBe('1,2\r\n2,4\r\n');
  });
});
