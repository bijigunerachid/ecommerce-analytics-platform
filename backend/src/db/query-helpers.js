// Helpers for building parameterized list queries safely.

/** Escapes LIKE wildcards so user search text is matched literally. Use with ESCAPE '\'. */
export function escapeLike(text) {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Collects WHERE conditions and their parameters. Values are always passed as $n parameters;
 * only fixed SQL fragments written in the repositories are concatenated.
 */
export class WhereBuilder {
  constructor() {
    this.conditions = [];
    this.params = [];
  }

  /** Adds a parameter and returns its placeholder, e.g. "$3". */
  param(value) {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  /** @param {(p: (value: unknown) => string) => string} build */
  add(build) {
    this.conditions.push(build((value) => this.param(value)));
    return this;
  }

  toSql() {
    return this.conditions.length ? `WHERE ${this.conditions.join(' AND ')}` : '';
  }
}

/** Builds LIMIT/OFFSET placeholders on an existing WhereBuilder. */
export function paginate(where, { page, pageSize }) {
  return `LIMIT ${where.param(pageSize)} OFFSET ${where.param((page - 1) * pageSize)}`;
}

export function paginationMeta({ page, pageSize }, total) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
