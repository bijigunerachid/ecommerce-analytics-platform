import { describe, expect, it } from 'vitest';
import { WhereBuilder, escapeLike, paginate, paginationMeta } from '../../src/db/query-helpers.js';
import { moneySchema } from '../../src/validation/common.js';

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('100%_off\\')).toBe('100\\%\\_off\\\\');
    expect(escapeLike('plain')).toBe('plain');
  });
});

describe('WhereBuilder', () => {
  it('numbers parameters in order and joins conditions with AND', () => {
    const where = new WhereBuilder();
    where.add((p) => `a = ${p(1)}`).add((p) => `b BETWEEN ${p(2)} AND ${p(3)}`);
    expect(where.toSql()).toBe('WHERE a = $1 AND b BETWEEN $2 AND $3');
    expect(paginate(where, { page: 3, pageSize: 10 })).toBe('LIMIT $4 OFFSET $5');
    expect(where.params).toEqual([1, 2, 3, 10, 20]);
  });

  it('produces no WHERE clause without conditions', () => {
    expect(new WhereBuilder().toSql()).toBe('');
  });
});

describe('paginationMeta', () => {
  it('computes total pages', () => {
    expect(paginationMeta({ page: 1, pageSize: 20 }, 41)).toEqual({
      page: 1,
      pageSize: 20,
      total: 41,
      totalPages: 3,
    });
    expect(paginationMeta({ page: 1, pageSize: 20 }, 0).totalPages).toBe(0);
  });
});

describe('moneySchema', () => {
  it.each([
    ['19.99', '19.99'],
    [19.99, '19.99'],
    [0, '0'],
    [' 5 ', '5'],
  ])('accepts %j', (input, expected) => {
    expect(moneySchema.parse(input)).toBe(expected);
  });

  it.each(['-1', '1.234', 'abc', '', '1e3', 1e21, Number.NaN])('rejects %j', (input) => {
    expect(moneySchema.safeParse(input).success).toBe(false);
  });
});
